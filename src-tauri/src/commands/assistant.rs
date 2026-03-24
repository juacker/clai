use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::assistant::engine::{self, AssistantDeps, RunTurnInput};
use crate::assistant::events::{emit_event, AssistantUiEvent};
use crate::assistant::repository;
use crate::assistant::repository::{CreateMessageParams, CreateRunParams, CreateSessionParams};
use crate::assistant::runtime;
use crate::assistant::types::{
    AssistantMessage, AssistantRun, AssistantSession, ContentPart, MessageRole, RunStatus,
    RunTrigger, SessionContext, SessionKind, ToolInvocation,
};
use crate::db::DbPool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssistantSessionRequest {
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub kind: Option<SessionKind>,
    #[serde(default)]
    pub title: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    #[serde(default)]
    pub context: SessionContext,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSendMessageResult {
    pub session: AssistantSession,
    pub message: AssistantMessage,
    pub run: AssistantRun,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListToolCallsRequest {
    pub session_id: String,
    #[serde(default)]
    pub run_id: Option<String>,
}

#[tauri::command]
pub async fn assistant_create_session(
    request: CreateAssistantSessionRequest,
    pool: State<'_, DbPool>,
    app: AppHandle,
) -> Result<AssistantSession, String> {
    let session = repository::create_session(
        pool.inner(),
        CreateSessionParams {
            tab_id: request.tab_id,
            kind: request.kind.unwrap_or(SessionKind::Interactive),
            title: request.title,
            provider_id: request.provider_id,
            model_id: request.model_id,
            context: request.context,
        },
    )
    .await?;

    emit_event(
        &app,
        &session,
        None,
        AssistantUiEvent::SessionCreated {
            session: session.clone(),
        },
    )?;

    Ok(session)
}

#[tauri::command]
pub async fn assistant_get_session(
    session_id: String,
    pool: State<'_, DbPool>,
) -> Result<Option<AssistantSession>, String> {
    repository::get_session(pool.inner(), &session_id).await
}

#[tauri::command]
pub async fn assistant_list_sessions(
    tab_id: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<AssistantSession>, String> {
    repository::list_sessions(pool.inner(), tab_id.as_deref()).await
}

#[tauri::command]
pub async fn assistant_delete_session(
    session_id: String,
    pool: State<'_, DbPool>,
) -> Result<bool, String> {
    repository::delete_session(pool.inner(), &session_id).await
}

#[tauri::command]
pub async fn assistant_attach_session_to_tab(
    session_id: String,
    tab_id: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<AssistantSession, String> {
    repository::attach_session_to_tab(pool.inner(), &session_id, tab_id.as_deref()).await
}

#[tauri::command]
pub async fn assistant_load_session_messages(
    session_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<AssistantMessage>, String> {
    repository::list_messages(pool.inner(), &session_id).await
}

#[tauri::command]
pub async fn assistant_list_runs(
    session_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<AssistantRun>, String> {
    repository::list_runs(pool.inner(), &session_id).await
}

#[tauri::command]
pub async fn assistant_list_tool_calls(
    request: ListToolCallsRequest,
    pool: State<'_, DbPool>,
) -> Result<Vec<ToolInvocation>, String> {
    repository::list_tool_calls(pool.inner(), &request.session_id, request.run_id.as_deref()).await
}

#[tauri::command]
pub async fn assistant_send_message(
    session_id: String,
    message: String,
    pool: State<'_, DbPool>,
    app: AppHandle,
) -> Result<AssistantSendMessageResult, String> {
    let session = repository::get_session(pool.inner(), &session_id)
        .await?
        .ok_or_else(|| format!("Assistant session not found: {}", session_id))?;

    let assistant_message = repository::create_message(
        pool.inner(),
        CreateMessageParams {
            session_id: session.id.clone(),
            role: MessageRole::User,
            content: vec![ContentPart::Text { text: message }],
            provider_metadata: None,
        },
    )
    .await?;

    let run = repository::create_run(
        pool.inner(),
        CreateRunParams {
            session_id: session.id.clone(),
            status: RunStatus::Queued,
            trigger: RunTrigger::UserMessage,
            provider_id: session.provider_id.clone(),
            model_id: session.model_id.clone(),
            usage: None,
            error: None,
        },
    )
    .await?;

    emit_event(
        &app,
        &session,
        Some(&run.id),
        AssistantUiEvent::MessageCreated {
            message: assistant_message.clone(),
        },
    )?;
    emit_event(
        &app,
        &session,
        Some(&run.id),
        AssistantUiEvent::RunQueued { run: run.clone() },
    )?;

    spawn_run_task(
        pool.inner().clone(),
        app.clone(),
        session.id.clone(),
        run.id.clone(),
        RunTrigger::UserMessage,
    );

    Ok(AssistantSendMessageResult {
        session,
        message: assistant_message,
        run,
    })
}

#[tauri::command]
pub async fn assistant_retry_run(
    run_id: String,
    pool: State<'_, DbPool>,
    app: AppHandle,
) -> Result<AssistantRun, String> {
    let previous_run = repository::get_run(pool.inner(), &run_id)
        .await?
        .ok_or_else(|| format!("Assistant run not found: {}", run_id))?;

    let session = repository::get_session(pool.inner(), &previous_run.session_id)
        .await?
        .ok_or_else(|| format!("Assistant session not found: {}", previous_run.session_id))?;

    let run = repository::create_run(
        pool.inner(),
        CreateRunParams {
            session_id: session.id.clone(),
            status: RunStatus::Queued,
            trigger: RunTrigger::Retry,
            provider_id: session.provider_id.clone(),
            model_id: session.model_id.clone(),
            usage: None,
            error: None,
        },
    )
    .await?;

    emit_event(
        &app,
        &session,
        Some(&run.id),
        AssistantUiEvent::RunQueued { run: run.clone() },
    )?;

    spawn_run_task(
        pool.inner().clone(),
        app,
        session.id,
        run.id.clone(),
        RunTrigger::Retry,
    );

    Ok(run)
}

#[tauri::command]
pub async fn assistant_cancel_run(
    run_id: String,
    pool: State<'_, DbPool>,
    app: AppHandle,
) -> Result<AssistantRun, String> {
    let run = repository::get_run(pool.inner(), &run_id)
        .await?
        .ok_or_else(|| format!("Assistant run not found: {}", run_id))?;

    if matches!(
        run.status,
        RunStatus::Completed | RunStatus::Failed | RunStatus::Cancelled
    ) {
        return Ok(run);
    }

    if runtime::cancel_run(&run_id) {
        return Ok(run);
    }

    let session = repository::get_session(pool.inner(), &run.session_id)
        .await?
        .ok_or_else(|| format!("Assistant session not found: {}", run.session_id))?;

    let cancelled =
        repository::update_run_status(pool.inner(), &run_id, RunStatus::Cancelled, None).await?;

    emit_event(
        &app,
        &session,
        Some(&run_id),
        AssistantUiEvent::RunCancelled {
            run: cancelled.clone(),
        },
    )?;

    Ok(cancelled)
}

fn spawn_run_task(
    pool: DbPool,
    app: AppHandle,
    session_id: String,
    run_id: String,
    trigger: RunTrigger,
) {
    let cancel_token = runtime::register_run(&run_id);
    tauri::async_runtime::spawn(async move {
        let deps = AssistantDeps { pool, app };
        let input = RunTurnInput {
            session_id,
            run_id: Some(run_id.clone()),
            trigger,
            cancel_token,
        };
        if let Err(e) = engine::run_session_turn(&deps, input).await {
            tracing::error!("Assistant engine error for run {}: {}", run_id, e);
        }
        runtime::unregister_run(&run_id);
    });
}
