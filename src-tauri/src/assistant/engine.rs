use futures::StreamExt;
use tauri::AppHandle;
use tauri::Manager;
use thiserror::Error;

use crate::assistant::events::{emit_event, AssistantUiEvent};
use crate::assistant::providers;
use crate::assistant::providers::types::ProviderError;
use crate::assistant::repository;
use crate::assistant::repository::{CreateMessageParams, CreateRunParams, CreateToolCallParams};
use crate::assistant::runtime;
use crate::assistant::tools::{self, ToolExecutionContext};
use crate::assistant::types::{
    CompletionRequest, ContentPart, MessageRole, ProviderEvent, ProviderInputMessage, RunId,
    RunStatus, RunTrigger, RunUsage, SessionId, SessionKind, ToolCallStatus,
    ToolInvocationDraft,
};
use crate::db::DbPool;
use crate::config::McpServerIntegrationType;
use crate::assistant::tools::local::agent_workspace_root_for_id;
use tokio_util::sync::CancellationToken;

const MAX_TOOL_ITERATIONS: usize = 10;

#[derive(Clone)]
pub struct AssistantDeps {
    pub pool: DbPool,
    pub app: AppHandle,
}

#[derive(Debug, Clone)]
pub struct RunTurnInput {
    pub session_id: SessionId,
    pub run_id: Option<RunId>,
    pub trigger: RunTrigger,
    pub cancel_token: CancellationToken,
}

#[derive(Debug, Error)]
pub enum AssistantEngineError {
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("provider not configured: {0}")]
    ProviderNotConfigured(String),
    #[error("provider error: {0}")]
    Provider(#[from] ProviderError),
    #[error("persistence error: {0}")]
    Persistence(String),
}

impl From<String> for AssistantEngineError {
    fn from(s: String) -> Self {
        AssistantEngineError::Persistence(s)
    }
}

pub async fn run_session_turn(
    deps: &AssistantDeps,
    input: RunTurnInput,
) -> Result<(), AssistantEngineError> {
    // Load session
    let session = repository::get_session(&deps.pool, &input.session_id)
        .await?
        .ok_or_else(|| AssistantEngineError::SessionNotFound(input.session_id.clone()))?;

    // Load provider session
    let provider_session = repository::get_provider_session(&deps.pool, &session.provider_id)
        .await?
        .ok_or_else(|| AssistantEngineError::ProviderNotConfigured(session.provider_id.clone()))?;

    // Get or create the run
    let run_id = match &input.run_id {
        Some(id) => id.clone(),
        None => {
            let run = repository::create_run(
                &deps.pool,
                CreateRunParams {
                    session_id: session.id.clone(),
                    status: RunStatus::Queued,
                    trigger: input.trigger.clone(),
                    provider_id: session.provider_id.clone(),
                    model_id: session.model_id.clone(),
                    usage: None,
                    error: None,
                },
            )
            .await?;
            run.id
        }
    };

    // Transition run to Running
    let run = repository::update_run_status(&deps.pool, &run_id, RunStatus::Running, None).await?;
    let _ = emit_event(
        &deps.app,
        &session,
        Some(&run_id),
        AssistantUiEvent::RunStarted { run },
    );

    if input.cancel_token.is_cancelled() {
        cancel_run(deps, &session, &run_id, usage_none(), None).await?;
        return Ok(());
    }

    // Resolve adapter
    let adapter = providers::resolve_adapter(&session.provider_id)?;

    // Get available tools for this session's context
    let (external_tools, dashboard_enabled) = {
        let state = deps.app.state::<crate::AppState>();
        let mut manager = state.mcp_client_manager.lock().await;
        let external_tools = manager
            .list_tools_for_servers(&session.context.mcp_server_ids)
            .await;
        let dashboard_enabled = manager.has_integration_type(
            &session.context.mcp_server_ids,
            McpServerIntegrationType::NetdataCloud,
        );
        (external_tools, dashboard_enabled)
    };
    let tool_defs = tools::available_tools(&session.context, &external_tools, dashboard_enabled);

    // Build execution context for tool calls
    let tool_context = ToolExecutionContext {
        session_id: session.id.clone(),
        run_id: run_id.clone(),
        tab_id: session.tab_id.clone(),
        space_id: session.context.space_id.clone(),
        room_id: session.context.room_id.clone(),
        mcp_server_ids: session.context.mcp_server_ids.clone(),
        agent_workspace_id: session.context.agent_workspace_id.clone(),
        execution: session.context.execution.clone(),
        notices: std::sync::Mutex::new(Vec::new()),
    };

    let mut usage: Option<RunUsage> = None;

    // Pre-register the assistant's tab with the JS bridge (once per run)
    // so that frontend tool handlers can find the correct tab.
    if let Some(tab_id) = &session.tab_id {
        let managed_agent_tab = session.kind == SessionKind::BackgroundJob
            || session.context.automation_id.is_some()
            || session.context.automation_name.is_some();
        let bridge = crate::mcp::bridge::JsBridge::new(deps.app.clone());
        let setup_params = serde_json::json!({
            "agentName": session
                .context
                .automation_name
                .as_deref()
                .or(session.title.as_deref())
                .unwrap_or("Assistant"),
            "managedAgentTab": managed_agent_tab,
            "tabId": tab_id,
            "mcpServerIds": session.context.mcp_server_ids,
        });
        let _ = bridge
            .call_tool(
                &bridge_agent_id(&session.id),
                session.context.space_id.as_deref().unwrap_or(""),
                session.context.room_id.as_deref().unwrap_or(""),
                "agent.setup",
                setup_params,
            )
            .await;
    }

    // === Tool execution loop ===
    // Build system prompt (prepended to every API call, not persisted)
    let system_message = build_system_prompt(&session.context, &tool_defs);

    for iteration in 0..MAX_TOOL_ITERATIONS {
        if input.cancel_token.is_cancelled() {
            cancel_run(deps, &session, &run_id, usage.as_ref(), None).await?;
            return Ok(());
        }

        // Load fresh message history each iteration
        let messages = repository::list_messages(&deps.pool, &session.id).await?;

        let mut provider_messages = vec![system_message.clone()];
        if iteration == 0 {
            if let Some(trigger_message) = build_trigger_message(&session, &input.trigger) {
                provider_messages.push(trigger_message);
            }
        }
        provider_messages.extend(messages.iter().map(|msg| ProviderInputMessage {
            role: msg.role.clone(),
            content: msg.content.clone(),
        }));

        let request = CompletionRequest {
            run_id: run_id.clone(),
            session_id: session.id.clone(),
            model_id: session.model_id.clone(),
            messages: provider_messages,
            tools: tool_defs.clone(),
            temperature: None,
            max_output_tokens: None,
        };

        // Call the provider
        let stream_result = adapter.stream_completion(&provider_session, request).await;

        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                fail_run(deps, &session, &run_id, usage.as_ref(), &e.to_string()).await?;
                return Err(e.into());
            }
        };

        // Create assistant message placeholder
        let assistant_message = repository::create_message(
            &deps.pool,
            CreateMessageParams {
                session_id: session.id.clone(),
                role: MessageRole::Assistant,
                content: vec![ContentPart::Text {
                    text: String::new(),
                }],
                provider_metadata: None,
            },
        )
        .await?;

        let _ = emit_event(
            &deps.app,
            &session,
            Some(&run_id),
            AssistantUiEvent::MessageCreated {
                message: assistant_message.clone(),
            },
        );

        // Consume the stream
        let mut accumulated_text = String::new();
        let mut tool_calls: Vec<ToolInvocationDraft> = Vec::new();

        loop {
            match tokio::select! {
                _ = input.cancel_token.cancelled() => None,
                next = stream.next() => next,
            } {
                None if input.cancel_token.is_cancelled() => {
                    cancel_run(
                        deps,
                        &session,
                        &run_id,
                        usage.as_ref(),
                        Some(&assistant_message.id),
                    )
                    .await?;
                    return Ok(());
                }
                Some(Ok(event)) => match event {
                    ProviderEvent::MessageStart => {}
                    ProviderEvent::TextDelta { text } => {
                        accumulated_text.push_str(&text);
                        let _ = emit_event(
                            &deps.app,
                            &session,
                            Some(&run_id),
                            AssistantUiEvent::AssistantDelta {
                                message_id: assistant_message.id.clone(),
                                text,
                            },
                        );
                    }
                    ProviderEvent::Usage { usage: u } => {
                        usage = Some(u);
                    }
                    ProviderEvent::ToolCallReady { tool_call } => {
                        tool_calls.push(tool_call);
                    }
                    ProviderEvent::ToolCallDelta { .. } => {
                        // Could emit live UI updates here in the future
                    }
                    ProviderEvent::MessageComplete => {
                        // Update assistant message with final content
                        let mut final_content = Vec::new();

                        if !accumulated_text.is_empty() {
                            final_content.push(ContentPart::Text {
                                text: accumulated_text.clone(),
                            });
                        }

                        // Add tool use content parts
                        for tc in &tool_calls {
                            final_content.push(ContentPart::ToolUse {
                                tool_call_id: tc.tool_call_id.clone(),
                                tool_name: tc.tool_name.clone(),
                                arguments: tc.params.clone(),
                            });
                        }

                        if final_content.is_empty() {
                            final_content.push(ContentPart::Text {
                                text: String::new(),
                            });
                        }

                        let updated_message = repository::update_message_content(
                            &deps.pool,
                            &assistant_message.id,
                            &final_content,
                        )
                        .await?;

                        let _ = emit_event(
                            &deps.app,
                            &session,
                            Some(&run_id),
                            AssistantUiEvent::AssistantMessageCompleted {
                                message: updated_message,
                            },
                        );
                    }
                    ProviderEvent::ProviderError { message } => {
                        fail_run(deps, &session, &run_id, usage.as_ref(), &message).await?;
                        return Ok(());
                    }
                },
                Some(Err(e)) => {
                    let error_msg = e.to_string();
                    fail_run(deps, &session, &run_id, usage.as_ref(), &error_msg).await?;
                    return Err(AssistantEngineError::Provider(
                        ProviderError::RequestFailed(error_msg),
                    ));
                }
                None => break,
            }
        }

        // If no tool calls, we're done
        if tool_calls.is_empty() {
            break;
        }

        tracing::info!(
            "Assistant engine: executing {} tool call(s) (iteration {})",
            tool_calls.len(),
            iteration + 1
        );

        // Execute each tool call
        for tc in &tool_calls {
            if input.cancel_token.is_cancelled() {
                cancel_run(deps, &session, &run_id, usage.as_ref(), None).await?;
                return Ok(());
            }

            // Persist tool call
            let tool_invocation = repository::create_tool_call(
                &deps.pool,
                CreateToolCallParams {
                    id: tc.tool_call_id.clone(),
                    run_id: run_id.clone(),
                    session_id: session.id.clone(),
                    tool_name: tc.tool_name.clone(),
                    params: tc.params.clone(),
                    status: ToolCallStatus::Running,
                },
            )
            .await?;

            let _ = emit_event(
                &deps.app,
                &session,
                Some(&run_id),
                AssistantUiEvent::ToolCallStarted {
                    tool_call: tool_invocation.clone(),
                },
            );

            // Execute the tool
            let tool_result = tokio::select! {
                _ = input.cancel_token.cancelled() => {
                    cancel_run(deps, &session, &run_id, usage.as_ref(), None).await?;
                    return Ok(());
                }
                result = tools::execute_tool(deps, &tool_context, &tc.tool_name, tc.params.clone()) => result,
            };

            match tool_result {
                Ok(result) => {
                    let updated = repository::update_tool_call(
                        &deps.pool,
                        &tool_invocation.id,
                        ToolCallStatus::Completed,
                        Some(&result),
                        None,
                    )
                    .await?;

                    let _ = emit_event(
                        &deps.app,
                        &session,
                        Some(&run_id),
                        AssistantUiEvent::ToolCallCompleted { tool_call: updated },
                    );

                    // Persist tool result as a message
                    let result_message = repository::create_message(
                        &deps.pool,
                        CreateMessageParams {
                            session_id: session.id.clone(),
                            role: MessageRole::Tool,
                            content: vec![ContentPart::ToolResult {
                                tool_call_id: tc.tool_call_id.clone(),
                                payload: result,
                            }],
                            provider_metadata: None,
                        },
                    )
                    .await?;

                    let _ = emit_event(
                        &deps.app,
                        &session,
                        Some(&run_id),
                        AssistantUiEvent::MessageCreated {
                            message: result_message,
                        },
                    );
                }
                Err(error) => {
                    let updated = repository::update_tool_call(
                        &deps.pool,
                        &tool_invocation.id,
                        ToolCallStatus::Failed,
                        None,
                        Some(&error),
                    )
                    .await?;

                    let _ = emit_event(
                        &deps.app,
                        &session,
                        Some(&run_id),
                        AssistantUiEvent::ToolCallFailed { tool_call: updated },
                    );

                    // Still persist the error as a tool result so the API can see it
                    let error_payload = serde_json::json!({"error": error});
                    repository::create_message(
                        &deps.pool,
                        CreateMessageParams {
                            session_id: session.id.clone(),
                            role: MessageRole::Tool,
                            content: vec![ContentPart::ToolResult {
                                tool_call_id: tc.tool_call_id.clone(),
                                payload: error_payload,
                            }],
                            provider_metadata: None,
                        },
                    )
                    .await?;
                }
            }
        }

        // Continue loop — will call API again with tool results in message history
    }

    // Complete the run — check for policy notices
    let notices = tool_context.take_notices();
    let final_status = if notices.is_empty() {
        RunStatus::Completed
    } else {
        RunStatus::CompletedWithWarnings
    };
    let run = repository::complete_run(
        &deps.pool,
        &run_id,
        final_status,
        usage.as_ref(),
        None,
        &notices,
    )
    .await?;
    let _ = emit_event(
        &deps.app,
        &session,
        Some(&run_id),
        AssistantUiEvent::RunCompleted { run },
    );

    Ok(())
}

fn usage_none() -> Option<&'static RunUsage> {
    None
}

/// Build the system prompt for the assistant.
fn build_system_prompt(
    context: &crate::assistant::types::SessionContext,
    tool_defs: &[crate::assistant::types::ToolDefinition],
) -> ProviderInputMessage {
    let tool_names: Vec<&str> = tool_defs.iter().map(|t| t.name.as_str()).collect();

    let mut prompt = String::from(
        "You are CLAI, a workspace assistant and multi-agent orchestration tool built into a desktop app. \
         You help users inspect available capabilities, choose the right tools for the job, update the workspace, \
         and explain outcomes clearly.\n\n",
    );

    if !tool_names.is_empty() {
        prompt.push_str("You have the following tools available:\n");
        for td in tool_defs {
            prompt.push_str(&format!("- `{}`: {}\n", td.name, td.description));
        }
        prompt.push('\n');
    }

    // Tool usage guidance
    prompt.push_str(
        "## Tool Usage Guidelines\n\
         - First inspect what is available in this session and choose the smallest set of tools needed.\n\
         - When using canvas or dashboard tools, first call `tabs.getTileLayout` to discover \
           available commandIds. Canvas and dashboard tools require a `commandId` parameter.\n\
         - Use the configured MCP tools available in this session for domain-specific work.\n\
         - Use `fs.*` and `bash.*` only when those local execution capabilities are exposed in this session.\n\
         - Use `tabs.splitTile` to create new panels before adding charts or content.\n\
         - Prefer updating existing workspace artifacts over duplicating them.\n\
         - Be concise and direct in your responses. Prefer concrete actions and evidence over vague summaries.\n",
    );

    if context.space_id.is_some() || !context.mcp_server_ids.is_empty() {
        prompt.push_str(
            "- This tab already carries session-specific context and capabilities. \
             Use the MCP tools attached to this session when they are relevant.\n",
        );
    }

    if let Some(automation_name) = context.automation_name.as_deref() {
        prompt.push_str("\n## Automation Context\n");
        prompt.push_str(&format!(
            "This session belongs to the automation `{}`.\n",
            automation_name
        ));
        prompt.push_str(
            "Your assistant text is visible to the user in chat. Use normal assistant replies for \
             summaries and explanations; use dashboard/canvas/tabs tools to update the tab itself.\n\
             Prefer updating existing visuals over recreating duplicate panels when the topic is unchanged.\n",
        );

        if let Some(description) = context.automation_description.as_deref() {
            prompt.push_str("\nAgent instructions:\n");
            prompt.push_str(description);
            prompt.push('\n');
        }
    }

    if let Some(agent_workspace_id) = context.agent_workspace_id.as_deref() {
        prompt.push_str("\n## Local Execution Capabilities\n");
        if let Some(workspace_root) = agent_workspace_root_for_id(agent_workspace_id) {
            prompt.push_str(&format!(
                "- Private agent workspace: `{}` (read_write, default shell cwd)\n",
                workspace_root.display()
            ));
        } else {
            prompt.push_str("- Private agent workspace: available (read_write, default shell cwd)\n");
        }

        if context.execution.filesystem.extra_paths.is_empty() {
            prompt.push_str("- Additional path grants: none\n");
        } else {
            prompt.push_str("- Additional path grants:\n");
            for grant in &context.execution.filesystem.extra_paths {
                let access = match grant.access {
                    crate::config::FilesystemPathAccess::ReadOnly => "read_only",
                    crate::config::FilesystemPathAccess::ReadWrite => "read_write",
                };
                prompt.push_str(&format!("  - `{}` ({})\n", grant.path, access));
            }
        }

        let shell_mode = match context.execution.shell.mode {
            crate::config::ShellAccessMode::Off => "off",
            crate::config::ShellAccessMode::Restricted => "restricted",
            crate::config::ShellAccessMode::Full => "full",
        };
        prompt.push_str(&format!("- Shell mode: {}\n", shell_mode));

        if !context.execution.shell.blocked_command_prefixes.is_empty() {
            prompt.push_str(&format!(
                "- Blocked command prefixes: {}\n",
                context.execution.shell.blocked_command_prefixes.join(", ")
            ));
        }

        if context.execution.shell.allowed_command_prefixes.is_empty() {
            let hint = match context.execution.shell.mode {
                crate::config::ShellAccessMode::Restricted => "none (no commands allowed)",
                _ => "any command not blocked",
            };
            prompt.push_str(&format!("- Allowed command prefixes: {}\n", hint));
        } else {
            prompt.push_str(&format!(
                "- Allowed command prefixes: {}\n",
                context.execution.shell.allowed_command_prefixes.join(", ")
            ));
        }
    }

    ProviderInputMessage {
        role: MessageRole::System,
        content: vec![ContentPart::Text { text: prompt }],
    }
}

fn build_trigger_message(
    session: &crate::assistant::types::AssistantSession,
    trigger: &RunTrigger,
) -> Option<ProviderInputMessage> {
    let automation_name = session
        .context
        .automation_name
        .as_deref()
        .unwrap_or("automation");

    let text = match trigger {
        RunTrigger::Scheduled => Some(format!(
            "Run the next scheduled pass for {} now. Inspect the current state, \
             update the tab as needed, and end with a concise status update.",
            automation_name
        )),
        RunTrigger::ManualAutomation => Some(format!(
            "Run the automation {} now and report the current findings.",
            automation_name
        )),
        RunTrigger::UserMessage | RunTrigger::Retry => None,
    }?;

    Some(ProviderInputMessage {
        role: MessageRole::User,
        content: vec![ContentPart::Text { text }],
    })
}

pub fn bridge_agent_id(session_id: &str) -> String {
    format!("assistant-session:{}", session_id)
}

/// Helper to mark a run as failed and emit the event.
async fn fail_run(
    deps: &AssistantDeps,
    session: &crate::assistant::types::AssistantSession,
    run_id: &str,
    usage: Option<&RunUsage>,
    error_msg: &str,
) -> Result<(), AssistantEngineError> {
    let run = repository::complete_run(
        &deps.pool,
        run_id,
        RunStatus::Failed,
        usage,
        Some(error_msg),
        &[],
    )
    .await?;
    let _ = emit_event(
        &deps.app,
        session,
        Some(run_id),
        AssistantUiEvent::RunFailed { run },
    );
    Ok(())
}

async fn cancel_run(
    deps: &AssistantDeps,
    session: &crate::assistant::types::AssistantSession,
    run_id: &str,
    usage: Option<&RunUsage>,
    _message_id: Option<&str>,
) -> Result<(), AssistantEngineError> {
    let run =
        repository::complete_run(&deps.pool, run_id, RunStatus::Cancelled, usage, None, &[]).await?;
    let _ = emit_event(
        &deps.app,
        session,
        Some(run_id),
        AssistantUiEvent::RunCancelled { run },
    );
    runtime::unregister_run(run_id);
    Ok(())
}
