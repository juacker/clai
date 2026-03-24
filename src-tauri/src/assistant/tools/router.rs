use std::sync::Arc;

use tauri::Manager;

use crate::api::client::create_client;
use crate::assistant::engine::AssistantDeps;
use crate::mcp::bridge::JsBridge;
use crate::mcp::tools::netdata::{NetdataQueryParams, NetdataQueryTool};
use crate::AppState;

use super::ToolExecutionContext;

/// Execute a tool by name with the given parameters.
/// Returns the tool result as JSON, or an error string.
pub async fn execute_tool(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match tool_name {
        "netdata.query" => execute_netdata_query(deps, context, params).await,
        "chat.message" => {
            // chat.message is handled by returning the message content as a tool result.
            // The AI's text response in the conversation already serves as the message.
            Ok(serde_json::json!({"success": true}))
        }
        name if name.starts_with("dashboard.")
            || name.starts_with("tabs.")
            || name.starts_with("canvas.") =>
        {
            execute_bridge_tool(deps, context, name, params).await
        }
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

/// Execute netdata.query via the Rust-native NetdataQueryTool.
async fn execute_netdata_query(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let space_id = context
        .space_id
        .as_deref()
        .ok_or("netdata.query requires space_id in session context")?;
    let room_id = context
        .room_id
        .as_deref()
        .ok_or("netdata.query requires room_id in session context")?;

    let query_params: NetdataQueryParams = serde_json::from_value(params)
        .map_err(|e| format!("Invalid netdata.query params: {}", e))?;

    let state = deps.app.state::<AppState>();
    let token = state
        .token_storage
        .get_token()
        .map_err(|e| format!("Failed to read Netdata token: {}", e))?
        .ok_or("Netdata token not configured")?;
    let base_url = state
        .base_url
        .lock()
        .map_err(|e| format!("Failed to read Netdata base URL: {}", e))?
        .clone();
    let api = Arc::new(crate::api::netdata::NetdataApi::new(
        create_client(),
        base_url,
        token,
    ));

    let tool = NetdataQueryTool::new(api, space_id.to_string(), room_id.to_string());
    let result = tool
        .query(query_params)
        .await
        .map_err(|e| format!("netdata.query failed: {}", e))?;

    Ok(serde_json::json!({"response": result}))
}

/// Execute a JS-bridge tool (dashboard.*, tabs.*, canvas.*).
/// The engine pre-registers the tab via `agent.setup` once per run,
/// so tool handlers can find the correct tab via `ensureAgentTab`.
async fn execute_bridge_tool(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let bridge = JsBridge::new(deps.app.clone());

    bridge
        .call_tool(
            "assistant",
            context.space_id.as_deref().unwrap_or(""),
            context.room_id.as_deref().unwrap_or(""),
            tool_name,
            params,
        )
        .await
        .map_err(|e| format!("{} failed: {}", tool_name, e))
}
