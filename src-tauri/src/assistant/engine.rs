use futures::StreamExt;
use tauri::AppHandle;
use thiserror::Error;

use crate::assistant::events::{emit_event, AssistantUiEvent};
use crate::assistant::providers;
use crate::assistant::providers::types::ProviderError;
use crate::assistant::repository;
use crate::assistant::repository::{CreateMessageParams, CreateRunParams};
use crate::assistant::types::{
    CompletionRequest, ContentPart, MessageRole, ProviderEvent, ProviderInputMessage, RunId,
    RunStatus, RunTrigger, RunUsage, SessionId,
};
use crate::db::DbPool;

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

    // Load message history
    let messages = repository::list_messages(&deps.pool, &session.id).await?;

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

    // Build completion request
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
        tools: vec![],
        temperature: None,
        max_output_tokens: None,
    };

    // Resolve adapter and start streaming
    let adapter = providers::resolve_adapter(&session.provider_id)?;

    let stream_result = adapter
        .stream_completion(&provider_session, request)
        .await;

    let mut stream = match stream_result {
        Ok(s) => s,
        Err(e) => {
            let error_msg = e.to_string();
            let run = repository::complete_run(
                &deps.pool,
                &run_id,
                RunStatus::Failed,
                None,
                Some(&error_msg),
            )
            .await?;
            let _ = emit_event(
                &deps.app,
                &session,
                Some(&run_id),
                AssistantUiEvent::RunFailed { run },
            );
            return Err(e.into());
        }
    };

    // Create the assistant message placeholder
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
    let mut usage: Option<RunUsage> = None;

    loop {
        match stream.next().await {
            Some(Ok(event)) => match event {
                ProviderEvent::MessageStart => {
                    // Already handled above
                }
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
                ProviderEvent::MessageComplete => {
                    // Update message in DB with final content
                    let final_content = vec![ContentPart::Text {
                        text: accumulated_text.clone(),
                    }];
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
                    let run = repository::complete_run(
                        &deps.pool,
                        &run_id,
                        RunStatus::Failed,
                        usage.as_ref(),
                        Some(&message),
                    )
                    .await?;
                    let _ = emit_event(
                        &deps.app,
                        &session,
                        Some(&run_id),
                        AssistantUiEvent::RunFailed { run },
                    );
                    return Ok(());
                }
                ProviderEvent::ToolCallDelta { .. } | ProviderEvent::ToolCallReady { .. } => {
                    // Phase 3: tool execution
                }
            },
            Some(Err(e)) => {
                let error_msg = e.to_string();
                let run = repository::complete_run(
                    &deps.pool,
                    &run_id,
                    RunStatus::Failed,
                    usage.as_ref(),
                    Some(&error_msg),
                )
                .await?;
                let _ = emit_event(
                    &deps.app,
                    &session,
                    Some(&run_id),
                    AssistantUiEvent::RunFailed { run },
                );
                return Err(AssistantEngineError::Provider(
                    ProviderError::RequestFailed(error_msg),
                ));
            }
            None => {
                // Stream ended
                break;
            }
        }
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
