use std::sync::Arc;

use tauri::Manager;

use crate::api::netdata::NetdataApi;
use crate::assistant::engine::AssistantDeps;
use crate::mcp::bridge::JsBridge;
use crate::mcp::tools::netdata::{NetdataQueryParams, NetdataQueryTool};

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

    let query_params: NetdataQueryParams =
        serde_json::from_value(params).map_err(|e| format!("Invalid netdata.query params: {}", e))?;

    // Get the NetdataApi from Tauri managed state
    let api: Arc<NetdataApi> = deps
        .app
        .try_state::<Arc<NetdataApi>>()
        .ok_or("NetdataApi not available")?
        .inner()
        .clone();

    let tool = NetdataQueryTool::new(api, space_id.to_string(), room_id.to_string());
    let result = tool
        .query(query_params)
        .await
        .map_err(|e| format!("netdata.query failed: {}", e))?;

    Ok(serde_json::json!({"response": result}))
}

/// Execute a JS-bridge tool (dashboard.*, tabs.*, canvas.*).
///
/// Before calling any bridge tool, we first call `agent.setup` to ensure
/// the frontend bridge knows which tab the assistant is operating on.
/// This allows tool handlers like `ensureAgentTab` to find the correct tab.
async fn execute_bridge_tool(
    deps: &AssistantDeps,
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let bridge = JsBridge::new(deps.app.clone());

    let agent_id = "assistant";
    let space_id = context.space_id.as_deref().unwrap_or("");
    let room_id = context.room_id.as_deref().unwrap_or("");

    // Ensure the frontend bridge has a tab mapping for the assistant agent.
    // This calls `agent.setup` which registers the active tab so that
    // tool handlers can find it via ensureAgentTab().
    if let Some(tab_id) = &context.tab_id {
        let setup_params = serde_json::json!({
            "agentName": "Assistant",
            "tabId": tab_id,
        });
        let _ = bridge
            .call_tool(agent_id, space_id, room_id, "agent.setup", setup_params)
            .await;
    }

    bridge
        .call_tool(agent_id, space_id, room_id, tool_name, params)
        .await
        .map_err(|e| format!("{} failed: {}", tool_name, e))
}
