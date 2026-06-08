use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::Router;
use rmcp::model::{
    CallToolRequestParams, CallToolResult, ErrorData as McpError, JsonObject, ListToolsResult,
    PaginatedRequestParams, ServerCapabilities, ServerInfo, Tool as RmcpTool, ToolAnnotations,
};
use rmcp::service::{RequestContext, RoleServer};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, tower::StreamableHttpService,
};
use rmcp::transport::StreamableHttpServerConfig;
use rmcp::ServerHandler;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::assistant::engine::AssistantDeps;
use crate::assistant::repository;
use crate::assistant::tools::{self, ToolExecutionContext};
use crate::assistant::types::{RunNotice, ToolDefinition};
use crate::db::DbPool;
use crate::AppState;

static LOCAL_MCP_RUNTIME: OnceLock<tokio::sync::Mutex<Option<Arc<LocalMcpRuntime>>>> =
    OnceLock::new();

fn runtime_slot() -> &'static tokio::sync::Mutex<Option<Arc<LocalMcpRuntime>>> {
    LOCAL_MCP_RUNTIME.get_or_init(|| tokio::sync::Mutex::new(None))
}

#[derive(Clone)]
pub struct LocalMcpRuntime {
    url: String,
    // Only process-wide state lives on the runtime. The DB pool is
    // per-workspace and rides on each ToolBinding instead — pinning a
    // pool here would silently route every workspace's MCP calls to
    // whichever workspace happened to bind first.
    app: AppHandle,
    cancellation_token: CancellationToken,
    bindings: Arc<RwLock<HashMap<String, ToolBinding>>>,
}

#[derive(Clone)]
pub struct ToolBinding {
    /// The workspace-scoped DB pool this run's session lives in. Carried
    /// per-binding because the local MCP runtime is a process singleton
    /// while pools are per-workspace.
    pub pool: DbPool,
    pub session_id: String,
    pub run_id: String,
    pub cancel_token: CancellationToken,
    pub inter_agent_call_depth: Option<u32>,
    pub notices: Arc<Mutex<Vec<RunNotice>>>,
    /// Run-scoped grants accepted via `fs_request_grant`. Shared with the
    /// host engine so a session grant accepted during a CLI-provider run is
    /// visible to the same run's subsequent tool calls.
    pub session_grants: Arc<Mutex<Vec<crate::config::FilesystemPathGrant>>>,
    /// Run-scoped allowed command prefixes accepted via the bash approval
    /// modal. Populated from both `AllowOnce` and `AllowAlways` decisions
    /// so a single `Allow once` during a run prevents the user from being
    /// re-prompted for the same (or descendant) command for the rest of
    /// the run. `AllowAlways` is additionally persisted by the submit
    /// command into the agent's durable `allowed_command_prefixes`.
    pub session_allowed_command_prefixes: Arc<Mutex<Vec<String>>>,
    /// Run-scoped blocked command prefixes — mirror of the allow cache
    /// for `DenyAlways` decisions. Without this, a `DenyAlways` would be
    /// honored on the next session (durable persistence) but the current
    /// run would still re-prompt the user for the same command if the
    /// LLM retried, because the running `context.execution` snapshot
    /// doesn't pick up persistence. `DenyOnce` is intentionally NOT
    /// cached: that decision is one-shot by definition, and re-prompting
    /// on retry lets the user reconsider.
    pub session_blocked_command_prefixes: Arc<Mutex<Vec<String>>>,
}

impl LocalMcpRuntime {
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Register a tool binding and return an RAII guard. The binding is
    /// removed automatically when the guard is dropped — including on
    /// panic or early return — so callers cannot leak entries into the
    /// bindings map.
    pub fn bind_run(&self, binding: ToolBinding) -> BindingGuard {
        let token = Uuid::new_v4().to_string();
        // Bindings map only ever holds short, await-free critical sections,
        // so `std::sync::RwLock` is fine and lets `Drop` clean up sync.
        // A poisoned lock means the binding map is unusable; we'd rather
        // panic here than continue with a corrupted server state.
        self.bindings
            .write()
            .expect("local MCP binding map poisoned")
            .insert(token.clone(), binding);
        BindingGuard {
            bindings: self.bindings.clone(),
            token,
        }
    }

    fn binding_from_request(
        &self,
        context: &RequestContext<RoleServer>,
    ) -> Result<ToolBinding, McpError> {
        let token = bearer_token(context).ok_or_else(|| {
            McpError::invalid_request("missing bearer token for CLAI MCP request", None)
        })?;
        self.bindings
            .read()
            .expect("local MCP binding map poisoned")
            .get(&token)
            .cloned()
            .ok_or_else(|| {
                McpError::invalid_request("invalid bearer token for CLAI MCP request", None)
            })
    }
}

/// RAII guard returned by [`LocalMcpRuntime::bind_run`]. Holds the bearer
/// token while alive and removes it from the runtime on drop, so a panic
/// or early return between bind and the end of a run cannot leak a stale
/// binding into the process-singleton MCP server.
pub struct BindingGuard {
    bindings: Arc<RwLock<HashMap<String, ToolBinding>>>,
    token: String,
}

impl BindingGuard {
    pub fn token(&self) -> &str {
        &self.token
    }
}

impl Drop for BindingGuard {
    fn drop(&mut self) {
        if let Ok(mut bindings) = self.bindings.write() {
            bindings.remove(&self.token);
        }
        // If the lock is poisoned we leave the (now-unreachable) entry
        // in place; the binding map is already in an unrecoverable state
        // and the process is on its way down.
    }
}

pub async fn ensure_started(app: &AppHandle) -> Result<Arc<LocalMcpRuntime>, String> {
    let mut guard = runtime_slot().lock().await;
    if let Some(runtime) = guard.as_ref() {
        return Ok(runtime.clone());
    }

    let cancellation_token = CancellationToken::new();
    let bindings = Arc::new(RwLock::new(HashMap::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local MCP server: {}", e))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to read local MCP server address: {}", e))?;
    let url = format!("http://{}/mcp", addr);

    let runtime_with_url = Arc::new(LocalMcpRuntime {
        url,
        app: app.clone(),
        cancellation_token: cancellation_token.clone(),
        bindings,
    });
    let service_runtime = runtime_with_url.clone();
    let service: StreamableHttpService<ClaiMcpService, LocalSessionManager> =
        StreamableHttpService::new(
            move || {
                Ok(ClaiMcpService {
                    runtime: service_runtime.clone(),
                })
            },
            Default::default(),
            {
                // rmcp 1.7's StreamableHttpServerConfig is #[non_exhaustive]
                // (added DNS-rebinding host/origin allowlists, session store,
                // etc.), so build from Default and override only what we need.
                // The default allowed_hosts (loopback) already covers our
                // 127.0.0.1 bind, port-agnostically.
                let mut config = StreamableHttpServerConfig::default();
                config.stateful_mode = true;
                config.sse_keep_alive = None;
                config.cancellation_token = cancellation_token.child_token();
                config
            },
        );
    let router = Router::new().nest_service("/mcp", service);
    let shutdown = runtime_with_url.cancellation_token.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router)
            .with_graceful_shutdown(async move { shutdown.cancelled_owned().await })
            .await
        {
            tracing::error!(error = %error, "Local MCP server exited with error");
        }
    });

    tracing::info!(url = %runtime_with_url.url(), "Started local CLAI MCP server");
    *guard = Some(runtime_with_url.clone());
    Ok(runtime_with_url)
}

#[derive(Clone)]
struct ClaiMcpService {
    runtime: Arc<LocalMcpRuntime>,
}

#[allow(clippy::manual_async_fn)]
impl ServerHandler for ClaiMcpService {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo (InitializeResult) is #[non_exhaustive] in rmcp 1.7, so we
        // can't use struct-literal syntax. Default sets protocol_version to
        // rmcp's LATEST (2025-11-25), which is what Claude Code >=2.1.153
        // negotiates — the version mismatch that previously left runs tool-less.
        let mut info = ServerInfo::default();
        info.instructions = Some(
            "Use only these CLAI MCP tools. Do not use CLI-native filesystem or shell tools."
                .into(),
        );
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ListToolsResult, McpError>> + Send + '_ {
        async move {
            let binding = self.runtime.binding_from_request(&context)?;
            let session = repository::get_session(&binding.pool, &binding.session_id)
                .await
                .map_err(|e| McpError::internal_error(e, None))?
                .ok_or_else(|| McpError::invalid_request("assistant session not found", None))?;

            let external_tools = {
                let state = self.runtime.app.state::<AppState>();
                let mut manager = state.mcp_client_manager.lock().await;
                manager
                    .list_tools_for_servers(&session.context.mcp_server_ids)
                    .await
            };
            let tool_defs = tools::available_tools(&session.context, &external_tools);
            Ok(ListToolsResult {
                meta: None,
                tools: tool_defs.into_iter().map(tool_definition_to_mcp).collect(),
                next_cursor: None,
            })
        }
    }

    fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<CallToolResult, McpError>> + Send + '_ {
        async move {
            let binding = self.runtime.binding_from_request(&context)?;
            let tool_name = request.name.to_string();
            let params = request
                .arguments
                .map(serde_json::Value::Object)
                .unwrap_or(serde_json::Value::Object(Default::default()));

            match execute_bound_tool(&self.runtime.app, &binding, &tool_name, params).await {
                Ok(value) => Ok(CallToolResult::structured(value)),
                Err(error) => Ok(CallToolResult::structured_error(serde_json::json!({
                    "error": error,
                }))),
            }
        }
    }
}

/// Execute the requested tool for a CLI-provider MCP call.
///
/// This is a silent executor — it does **not** persist tool_call records,
/// emit ToolCall* UI events, or create Tool-role messages. The Claude
/// stream parser in `local_agent::handle_claude_event` owns all that
/// bookkeeping (it sees the matching provider-side tool events and uses
/// the provider's tool id as the canonical id, so the chat UI can wire
/// results back to the originating assistant message). If this function
/// did its own writes we'd end up with two disconnected tool_call records
/// per invocation.
async fn execute_bound_tool(
    app: &AppHandle,
    binding: &ToolBinding,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if binding.cancel_token.is_cancelled() {
        return Err("run cancelled".to_string());
    }

    // Rebuild AssistantDeps from the per-binding pool plus the singleton's
    // app handle, so downstream `tools::execute_tool` keeps its existing
    // `&AssistantDeps` API but operates on the correct workspace DB.
    let deps = AssistantDeps {
        pool: binding.pool.clone(),
        app: app.clone(),
    };

    let session = repository::get_session(&deps.pool, &binding.session_id)
        .await?
        .ok_or_else(|| format!("Assistant session not found: {}", binding.session_id))?;
    let workspace_root = session
        .context
        .agent_workspace_id
        .as_deref()
        .and_then(|workspace_id| {
            deps.app
                .try_state::<AppState>()
                .and_then(|state| state.workspace_root(workspace_id))
        });

    let tool_context = ToolExecutionContext {
        session_id: binding.session_id.clone(),
        run_id: binding.run_id.clone(),
        // No tool_call_id here — the stream parser doesn't surface it
        // through the MCP transport. Inter-agent caller-id telemetry
        // therefore loses that one link for Claude-CLI sessions; the
        // tool still executes correctly.
        tool_call_id: None,
        cancel_token: binding.cancel_token.clone(),
        workspace_id: session.context.workspace_id.clone(),
        space_id: session.context.space_id.clone(),
        room_id: session.context.room_id.clone(),
        mcp_server_ids: session.context.mcp_server_ids.clone(),
        agent_workspace_id: session.context.agent_workspace_id.clone(),
        workspace_root,
        automation_id: session.context.automation_id.clone(),
        workspace_agents: session.context.workspace_agents.clone(),
        inter_agent_call_depth: binding.inter_agent_call_depth,
        execution: session.context.execution.clone(),
        notices: binding.notices.clone(),
        session_grants: binding.session_grants.clone(),
        session_allowed_command_prefixes: binding.session_allowed_command_prefixes.clone(),
        session_blocked_command_prefixes: binding.session_blocked_command_prefixes.clone(),
    };

    tokio::select! {
        _ = binding.cancel_token.cancelled() => Err("run cancelled".to_string()),
        result = tools::execute_tool(&deps, &tool_context, tool_name, params) => result,
    }
}

fn tool_definition_to_mcp(definition: ToolDefinition) -> RmcpTool {
    let input_schema = match definition.input_schema {
        serde_json::Value::Object(map) => map,
        _ => JsonObject::default(),
    };
    // RmcpTool is #[non_exhaustive] in rmcp 1.7 (new `execution`, `icons`,
    // `meta` fields), so construct via the builder rather than a literal.
    let title = definition.name.clone();
    let mut tool = RmcpTool::new(definition.name, definition.description, input_schema);
    tool.title = Some(title);
    tool.annotations = tool_annotations();
    tool
}

fn tool_annotations() -> Option<ToolAnnotations> {
    let mut annotations = ToolAnnotations::default();
    annotations.open_world_hint = Some(true);
    Some(annotations)
}

fn bearer_token(context: &RequestContext<RoleServer>) -> Option<String> {
    let parts = context.extensions.get::<Parts>()?;
    let header = parts.headers.get(AUTHORIZATION)?.to_str().ok()?;
    header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
