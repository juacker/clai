use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

use crate::assistant::types::{
    AssistantMessage, AssistantRun, AssistantSession, AuthMode, ContentPart, MessageRole,
    ProviderSession, RunStatus, RunTrigger, RunUsage, SessionContext, SessionKind, ToolCallStatus,
    ToolInvocation,
};
use crate::db::DbPool;

pub struct CreateSessionParams {
    pub tab_id: Option<String>,
    pub kind: SessionKind,
    pub title: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    pub context: SessionContext,
}

pub struct CreateMessageParams {
    pub session_id: String,
    pub role: MessageRole,
    pub content: Vec<ContentPart>,
    pub provider_metadata: Option<serde_json::Value>,
}

pub struct CreateRunParams {
    pub session_id: String,
    pub status: RunStatus,
    pub trigger: RunTrigger,
    pub provider_id: String,
    pub model_id: String,
    pub usage: Option<RunUsage>,
    pub error: Option<String>,
}

pub struct CreateToolCallParams {
    pub run_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub params: serde_json::Value,
    pub status: ToolCallStatus,
}

pub struct UpsertProviderSessionParams {
    pub provider_id: String,
    pub auth_mode: AuthMode,
    pub base_url: Option<String>,
    pub secret_ref: String,
    pub account_label: Option<String>,
    pub expires_at: Option<i64>,
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn to_json_string<T: Serialize + ?Sized>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| format!("Failed to serialize JSON: {}", e))
}

fn parse_json<T: DeserializeOwned>(value: &str, context: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|e| format!("Failed to parse {}: {}", context, e))
}

fn parse_optional_json<T: DeserializeOwned>(
    value: Option<String>,
    context: &str,
) -> Result<Option<T>, String> {
    value.map(|json| parse_json(&json, context)).transpose()
}

fn map_session_row(row: &sqlx::sqlite::SqliteRow) -> Result<AssistantSession, String> {
    Ok(AssistantSession {
        id: row.get("id"),
        tab_id: row.get("tab_id"),
        kind: parse_json::<SessionKind>(&row.get::<String, _>("kind"), "session kind")?,
        title: row.get("title"),
        provider_id: row.get("provider_id"),
        model_id: row.get("model_id"),
        context: parse_json::<SessionContext>(
            &row.get::<String, _>("context_json"),
            "session context",
        )?,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

fn map_message_row(row: &sqlx::sqlite::SqliteRow) -> Result<AssistantMessage, String> {
    Ok(AssistantMessage {
        id: row.get("id"),
        session_id: row.get("session_id"),
        role: parse_json::<MessageRole>(&row.get::<String, _>("role"), "message role")?,
        content: parse_json::<Vec<ContentPart>>(
            &row.get::<String, _>("content_json"),
            "message content",
        )?,
        created_at: row.get("created_at"),
        provider_metadata: parse_optional_json::<serde_json::Value>(
            row.get("provider_metadata_json"),
            "provider metadata",
        )?,
    })
}

fn map_run_row(row: &sqlx::sqlite::SqliteRow) -> Result<AssistantRun, String> {
    Ok(AssistantRun {
        id: row.get("id"),
        session_id: row.get("session_id"),
        status: parse_json::<RunStatus>(&row.get::<String, _>("status"), "run status")?,
        trigger: parse_json::<RunTrigger>(&row.get::<String, _>("trigger"), "run trigger")?,
        provider_id: row.get("provider_id"),
        model_id: row.get("model_id"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
        usage: parse_optional_json::<RunUsage>(row.get("usage_json"), "run usage")?,
        error: row.get("error"),
    })
}

fn map_provider_session_row(row: &sqlx::sqlite::SqliteRow) -> Result<ProviderSession, String> {
    Ok(ProviderSession {
        provider_id: row.get("provider_id"),
        auth_mode: parse_json::<AuthMode>(&row.get::<String, _>("auth_mode"), "auth mode")?,
        base_url: row.get("base_url"),
        secret_ref: row.get("secret_ref"),
        account_label: row.get("account_label"),
        expires_at: row.get("expires_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn create_session(
    pool: &DbPool,
    params: CreateSessionParams,
) -> Result<AssistantSession, String> {
    let now = now_ms();
    let mut context = params.context;
    context.tab_id = params.tab_id.clone();

    let session = AssistantSession {
        id: Uuid::new_v4().to_string(),
        tab_id: params.tab_id,
        kind: params.kind,
        title: params.title,
        provider_id: params.provider_id,
        model_id: params.model_id,
        context,
        created_at: now,
        updated_at: now,
    };

    sqlx::query(
        r#"
        INSERT INTO assistant_sessions
            (id, tab_id, kind, title, provider_id, model_id, context_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&session.id)
    .bind(&session.tab_id)
    .bind(to_json_string(&session.kind)?)
    .bind(&session.title)
    .bind(&session.provider_id)
    .bind(&session.model_id)
    .bind(to_json_string(&session.context)?)
    .bind(session.created_at)
    .bind(session.updated_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create assistant session: {}", e))?;

    Ok(session)
}

pub async fn get_session(
    pool: &DbPool,
    session_id: &str,
) -> Result<Option<AssistantSession>, String> {
    let row = sqlx::query(
        r#"
        SELECT id, tab_id, kind, title, provider_id, model_id, context_json, created_at, updated_at
        FROM assistant_sessions
        WHERE id = ?
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to load assistant session: {}", e))?;

    row.as_ref().map(map_session_row).transpose()
}

pub async fn list_sessions(
    pool: &DbPool,
    tab_id: Option<&str>,
) -> Result<Vec<AssistantSession>, String> {
    let rows = if let Some(tab_id) = tab_id {
        sqlx::query(
            r#"
            SELECT id, tab_id, kind, title, provider_id, model_id, context_json, created_at, updated_at
            FROM assistant_sessions
            WHERE tab_id = ?
            ORDER BY updated_at DESC
            "#,
        )
        .bind(tab_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list assistant sessions: {}", e))?
    } else {
        sqlx::query(
            r#"
            SELECT id, tab_id, kind, title, provider_id, model_id, context_json, created_at, updated_at
            FROM assistant_sessions
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list assistant sessions: {}", e))?
    };

    rows.iter().map(map_session_row).collect()
}

pub async fn delete_session(pool: &DbPool, session_id: &str) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM assistant_sessions WHERE id = ?")
        .bind(session_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete assistant session: {}", e))?;

    Ok(result.rows_affected() > 0)
}

pub async fn attach_session_to_tab(
    pool: &DbPool,
    session_id: &str,
    tab_id: Option<&str>,
) -> Result<AssistantSession, String> {
    let mut session = get_session(pool, session_id)
        .await?
        .ok_or_else(|| format!("Assistant session not found: {}", session_id))?;

    session.tab_id = tab_id.map(str::to_string);
    session.context.tab_id = session.tab_id.clone();
    session.updated_at = now_ms();

    sqlx::query(
        r#"
        UPDATE assistant_sessions
        SET tab_id = ?, context_json = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&session.tab_id)
    .bind(to_json_string(&session.context)?)
    .bind(session.updated_at)
    .bind(&session.id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to attach session to tab: {}", e))?;

    Ok(session)
}

pub async fn list_messages(
    pool: &DbPool,
    session_id: &str,
) -> Result<Vec<AssistantMessage>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, session_id, role, content_json, provider_metadata_json, created_at
        FROM assistant_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load assistant messages: {}", e))?;

    rows.iter().map(map_message_row).collect()
}

pub async fn create_message(
    pool: &DbPool,
    params: CreateMessageParams,
) -> Result<AssistantMessage, String> {
    let message = AssistantMessage {
        id: Uuid::new_v4().to_string(),
        session_id: params.session_id,
        role: params.role,
        content: params.content,
        created_at: now_ms(),
        provider_metadata: params.provider_metadata,
    };

    sqlx::query(
        r#"
        INSERT INTO assistant_messages
            (id, session_id, role, content_json, provider_metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&message.id)
    .bind(&message.session_id)
    .bind(to_json_string(&message.role)?)
    .bind(to_json_string(&message.content)?)
    .bind(
        message
            .provider_metadata
            .as_ref()
            .map(to_json_string)
            .transpose()?,
    )
    .bind(message.created_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create assistant message: {}", e))?;

    touch_session(pool, &message.session_id).await?;

    Ok(message)
}

pub async fn create_run(pool: &DbPool, params: CreateRunParams) -> Result<AssistantRun, String> {
    let run = AssistantRun {
        id: Uuid::new_v4().to_string(),
        session_id: params.session_id,
        status: params.status,
        trigger: params.trigger,
        provider_id: params.provider_id,
        model_id: params.model_id,
        started_at: now_ms(),
        completed_at: None,
        usage: params.usage,
        error: params.error,
    };

    sqlx::query(
        r#"
        INSERT INTO assistant_runs
            (id, session_id, status, trigger, provider_id, model_id, usage_json, error, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&run.id)
    .bind(&run.session_id)
    .bind(to_json_string(&run.status)?)
    .bind(to_json_string(&run.trigger)?)
    .bind(&run.provider_id)
    .bind(&run.model_id)
    .bind(run.usage.as_ref().map(to_json_string).transpose()?)
    .bind(&run.error)
    .bind(run.started_at)
    .bind(run.completed_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create assistant run: {}", e))?;

    touch_session(pool, &run.session_id).await?;

    Ok(run)
}

pub async fn list_runs(pool: &DbPool, session_id: &str) -> Result<Vec<AssistantRun>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, session_id, status, trigger, provider_id, model_id, usage_json, error, started_at, completed_at
        FROM assistant_runs
        WHERE session_id = ?
        ORDER BY started_at DESC
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list assistant runs: {}", e))?;

    rows.iter().map(map_run_row).collect()
}

pub async fn upsert_provider_session(
    pool: &DbPool,
    params: UpsertProviderSessionParams,
) -> Result<ProviderSession, String> {
    let existing = get_provider_session(pool, &params.provider_id).await?;
    let now = now_ms();

    let provider_session = ProviderSession {
        provider_id: params.provider_id,
        auth_mode: params.auth_mode,
        base_url: params.base_url,
        secret_ref: params.secret_ref,
        account_label: params.account_label,
        expires_at: params.expires_at,
        created_at: existing
            .as_ref()
            .map(|value| value.created_at)
            .unwrap_or(now),
        updated_at: now,
    };

    sqlx::query(
        r#"
        INSERT INTO provider_sessions
            (provider_id, auth_mode, base_url, secret_ref, account_label, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
            auth_mode = excluded.auth_mode,
            base_url = excluded.base_url,
            secret_ref = excluded.secret_ref,
            account_label = excluded.account_label,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(&provider_session.provider_id)
    .bind(to_json_string(&provider_session.auth_mode)?)
    .bind(&provider_session.base_url)
    .bind(&provider_session.secret_ref)
    .bind(&provider_session.account_label)
    .bind(provider_session.expires_at)
    .bind(provider_session.created_at)
    .bind(provider_session.updated_at)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to upsert provider session: {}", e))?;

    Ok(provider_session)
}

pub async fn get_provider_session(
    pool: &DbPool,
    provider_id: &str,
) -> Result<Option<ProviderSession>, String> {
    let row = sqlx::query(
        r#"
        SELECT provider_id, auth_mode, base_url, secret_ref, account_label, expires_at, created_at, updated_at
        FROM provider_sessions
        WHERE provider_id = ?
        "#,
    )
    .bind(provider_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to load provider session: {}", e))?;

    row.as_ref().map(map_provider_session_row).transpose()
}

pub async fn list_provider_sessions(pool: &DbPool) -> Result<Vec<ProviderSession>, String> {
    let rows = sqlx::query(
        r#"
        SELECT provider_id, auth_mode, base_url, secret_ref, account_label, expires_at, created_at, updated_at
        FROM provider_sessions
        ORDER BY updated_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list provider sessions: {}", e))?;

    rows.iter().map(map_provider_session_row).collect()
}

pub async fn delete_provider_session(pool: &DbPool, provider_id: &str) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM provider_sessions WHERE provider_id = ?")
        .bind(provider_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete provider session: {}", e))?;

    Ok(result.rows_affected() > 0)
}

pub async fn update_run_status(
    pool: &DbPool,
    run_id: &str,
    status: RunStatus,
    error: Option<&str>,
) -> Result<AssistantRun, String> {
    let is_terminal = matches!(
        status,
        RunStatus::Completed | RunStatus::Failed | RunStatus::Cancelled
    );
    let completed_at = if is_terminal { Some(now_ms()) } else { None };

    sqlx::query(
        r#"
        UPDATE assistant_runs
        SET status = ?, error = ?, completed_at = COALESCE(?, completed_at)
        WHERE id = ?
        "#,
    )
    .bind(to_json_string(&status)?)
    .bind(error)
    .bind(completed_at)
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update run status: {}", e))?;

    let row = sqlx::query(
        r#"
        SELECT id, session_id, status, trigger, provider_id, model_id, usage_json, error, started_at, completed_at
        FROM assistant_runs
        WHERE id = ?
        "#,
    )
    .bind(run_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to load updated run: {}", e))?;

    let run = map_run_row(&row)?;
    touch_session(pool, &run.session_id).await?;
    Ok(run)
}

pub async fn complete_run(
    pool: &DbPool,
    run_id: &str,
    status: RunStatus,
    usage: Option<&RunUsage>,
    error: Option<&str>,
) -> Result<AssistantRun, String> {
    let completed_at = now_ms();

    sqlx::query(
        r#"
        UPDATE assistant_runs
        SET status = ?, usage_json = COALESCE(?, usage_json), error = ?, completed_at = ?
        WHERE id = ?
        "#,
    )
    .bind(to_json_string(&status)?)
    .bind(usage.map(to_json_string).transpose()?)
    .bind(error)
    .bind(completed_at)
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to complete run: {}", e))?;

    let row = sqlx::query(
        r#"
        SELECT id, session_id, status, trigger, provider_id, model_id, usage_json, error, started_at, completed_at
        FROM assistant_runs
        WHERE id = ?
        "#,
    )
    .bind(run_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to load completed run: {}", e))?;

    let run = map_run_row(&row)?;
    touch_session(pool, &run.session_id).await?;
    Ok(run)
}

pub async fn update_message_content(
    pool: &DbPool,
    message_id: &str,
    content: &[ContentPart],
) -> Result<AssistantMessage, String> {
    sqlx::query(
        r#"
        UPDATE assistant_messages
        SET content_json = ?
        WHERE id = ?
        "#,
    )
    .bind(to_json_string(content)?)
    .bind(message_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update message content: {}", e))?;

    let row = sqlx::query(
        r#"
        SELECT id, session_id, role, content_json, provider_metadata_json, created_at
        FROM assistant_messages
        WHERE id = ?
        "#,
    )
    .bind(message_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to load updated message: {}", e))?;

    map_message_row(&row)
}

fn map_tool_call_row(row: &sqlx::sqlite::SqliteRow) -> Result<ToolInvocation, String> {
    Ok(ToolInvocation {
        id: row.get("id"),
        run_id: row.get("run_id"),
        session_id: row.get("session_id"),
        tool_name: row.get("tool_name"),
        params: parse_json(&row.get::<String, _>("params_json"), "tool call params")?,
        status: parse_json::<ToolCallStatus>(
            &row.get::<String, _>("status"),
            "tool call status",
        )?,
        result: parse_optional_json(row.get("result_json"), "tool call result")?,
        error: row.get("error"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
    })
}

pub async fn create_tool_call(
    pool: &DbPool,
    params: CreateToolCallParams,
) -> Result<ToolInvocation, String> {
    let tc = ToolInvocation {
        id: Uuid::new_v4().to_string(),
        run_id: params.run_id,
        session_id: params.session_id,
        tool_name: params.tool_name,
        params: params.params,
        status: params.status,
        result: None,
        error: None,
        started_at: now_ms(),
        completed_at: None,
    };

    sqlx::query(
        r#"
        INSERT INTO assistant_tool_calls
            (id, run_id, session_id, tool_name, params_json, status, result_json, error, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&tc.id)
    .bind(&tc.run_id)
    .bind(&tc.session_id)
    .bind(&tc.tool_name)
    .bind(to_json_string(&tc.params)?)
    .bind(to_json_string(&tc.status)?)
    .bind::<Option<String>>(None)
    .bind::<Option<String>>(None)
    .bind(tc.started_at)
    .bind::<Option<i64>>(None)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create tool call: {}", e))?;

    Ok(tc)
}

pub async fn update_tool_call(
    pool: &DbPool,
    id: &str,
    status: ToolCallStatus,
    result: Option<&serde_json::Value>,
    error: Option<&str>,
) -> Result<ToolInvocation, String> {
    let is_terminal = matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed);
    let completed_at = if is_terminal { Some(now_ms()) } else { None };

    sqlx::query(
        r#"
        UPDATE assistant_tool_calls
        SET status = ?, result_json = ?, error = ?, completed_at = COALESCE(?, completed_at)
        WHERE id = ?
        "#,
    )
    .bind(to_json_string(&status)?)
    .bind(result.map(to_json_string).transpose()?)
    .bind(error)
    .bind(completed_at)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update tool call: {}", e))?;

    let row = sqlx::query(
        r#"
        SELECT id, run_id, session_id, tool_name, params_json, status, result_json, error, started_at, completed_at
        FROM assistant_tool_calls
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to load updated tool call: {}", e))?;

    map_tool_call_row(&row)
}

async fn touch_session(pool: &DbPool, session_id: &str) -> Result<(), String> {
    sqlx::query("UPDATE assistant_sessions SET updated_at = ? WHERE id = ?")
        .bind(now_ms())
        .bind(session_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update assistant session timestamp: {}", e))?;

    Ok(())
}
