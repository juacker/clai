use futures::StreamExt;
use tauri::AppHandle;
use thiserror::Error;

use crate::assistant::events::{emit_event, AssistantUiEvent};
use crate::assistant::providers;
use crate::assistant::providers::types::ProviderError;
use crate::assistant::repository;
use crate::assistant::repository::{
    CreateMessageParams, CreateRunParams, CreateToolCallParams,
};
use crate::assistant::tools::{self, ToolExecutionContext};
use crate::assistant::types::{
    CompletionRequest, ContentPart, MessageRole, ProviderEvent, ProviderInputMessage, RunId,
    RunStatus, RunTrigger, RunUsage, SessionId, ToolCallStatus, ToolInvocationDraft,
};
use crate::db::DbPool;

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
    let provider_session =
        repository::get_provider_session(&deps.pool, &session.provider_id)
            .await?
            .ok_or_else(|| {
                AssistantEngineError::ProviderNotConfigured(session.provider_id.clone())
            })?;

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
    let run =
        repository::update_run_status(&deps.pool, &run_id, RunStatus::Running, None).await?;
    let _ = emit_event(
        &deps.app,
        &session,
        Some(&run_id),
        AssistantUiEvent::RunStarted { run },
    );

    // Resolve adapter
    let adapter = providers::resolve_adapter(&session.provider_id)?;

    // Get available tools for this session's context
    let tool_defs = tools::available_tools(&session.context);

    // Build execution context for tool calls
    let tool_context = ToolExecutionContext {
        session_id: session.id.clone(),
        run_id: run_id.clone(),
        tab_id: session.tab_id.clone(),
        space_id: session.context.space_id.clone(),
        room_id: session.context.room_id.clone(),
    };

    let mut usage: Option<RunUsage> = None;

    // === Tool execution loop ===
    for iteration in 0..MAX_TOOL_ITERATIONS {
        // Load fresh message history each iteration
        let messages = repository::list_messages(&deps.pool, &session.id).await?;

        let provider_messages: Vec<ProviderInputMessage> = messages
            .iter()
            .map(|msg| ProviderInputMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            })
            .collect();

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
        let stream_result = adapter
            .stream_completion(&provider_session, request)
            .await;

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
            match stream.next().await {
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
            // Persist tool call
            let tool_invocation = repository::create_tool_call(
                &deps.pool,
                CreateToolCallParams {
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
            let tool_result =
                tools::execute_tool(deps, &tool_context, &tc.tool_name, tc.params.clone()).await;

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
                        AssistantUiEvent::ToolCallCompleted {
                            tool_call: updated,
                        },
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
                        AssistantUiEvent::ToolCallFailed {
                            tool_call: updated,
                        },
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

    // Complete the run
    let run = repository::complete_run(
        &deps.pool,
        &run_id,
        RunStatus::Completed,
        usage.as_ref(),
        None,
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
