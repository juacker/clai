use tauri::Manager;

use crate::assistant::engine::AssistantDeps;
use crate::assistant::tools::{ask_user, local, workspace_tasks};
use crate::AppState;

use super::ToolExecutionContext;

/// Execute a tool by name with the given parameters.
/// Returns the tool result as JSON, or an error string.
///
/// Tool names use `_` as the separator (`fs_list`, `bash_exec`,
/// `workspace_listAgents`) to satisfy OpenAI's stricter function-name
/// regex (`^[a-zA-Z][a-zA-Z0-9_-]*$`). Legacy conversation history may
/// still carry the old dotted form (`fs.list`); we canonicalize on
/// dispatch so those continue to work, and a one-shot DB migration
/// rewrites them at-rest on the next launch.
pub async fn execute_tool(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let canonical = canonicalize_tool_name(tool_name);
    let name_for_dispatch = canonical.as_str();
    match name_for_dispatch {
        name if name.starts_with("fs_")
            || name.starts_with("bash_")
            || name.starts_with("web_") =>
        {
            local::execute_local_tool(deps, context, name, params).await
        }
        name if name.starts_with("agent_") => Err(
            "Global agent tools are no longer available. Use workspace-local task delegation instead."
                .to_string(),
        ),
        "workspace_listAgents" | "workspace_assignTask" | "workspace_getTaskResult" => {
            workspace_tasks::execute(deps, context, name_for_dispatch, params).await
        }
        "ask_user" => ask_user::execute(deps, context, params).await,
        _ => execute_external_mcp_tool(deps, context, tool_name, params).await,
    }
}

/// Canonicalizes a possibly-legacy tool name. Built-in tools historically
/// used `.` as the namespace separator (`bash.exec`); we now use `_` to
/// be compatible with OpenAI's function-name regex. Names that match a
/// known legacy prefix are rewritten on the fly so old conversation
/// history dispatches to the right handler.
fn canonicalize_tool_name(name: &str) -> String {
    const LEGACY_PREFIXES: &[&str] = &["fs.", "bash.", "web.", "workspace.", "agent."];
    if LEGACY_PREFIXES.iter().any(|p| name.starts_with(p)) {
        name.replacen('.', "_", 1)
    } else {
        name.to_string()
    }
}

async fn execute_external_mcp_tool(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let state = deps.app.state::<AppState>();
    let mut manager = state.mcp_client_manager.lock().await;
    manager
        .execute_tool(&context.mcp_server_ids, tool_name, params)
        .await
        .map_err(|e| format!("{} failed: {}", tool_name, e))
}
