//! JS bridge Tauri commands.
//!
//! This module provides Tauri commands for the JavaScript tool bridge.

use crate::mcp::bridge::mark_bridge_ready;
use crate::mcp::{complete_pending_request, ToolResponse};

/// Complete a pending agent tool request.
///
/// This command is called by JavaScript after executing a tool operation
/// (canvas.*, tabs.*). It completes the async request that Rust is waiting on.
///
/// # Arguments
///
/// * `response` - The tool response containing request_id, success, result/error
///
/// # Returns
///
/// Ok if the request was found and completed, Err if unknown request ID.
///
/// # Example (JavaScript)
///
/// ```javascript
/// import { invoke } from '@tauri-apps/api/core';
///
/// // After executing a tool successfully
/// await invoke('agent_tool_result', {
///     response: {
///         requestId: 'abc-123',
///         success: true,
///         result: { chartId: 'chart-001' }
///     }
/// });
///
/// // After a tool execution error
/// await invoke('agent_tool_result', {
///     response: {
///         requestId: 'abc-123',
///         success: false,
///         error: 'Chart not found'
///     }
/// });
/// ```
#[tauri::command]
pub fn agent_tool_result(response: ToolResponse) -> Result<(), String> {
    complete_pending_request(response)
}

/// Mark the frontend agent bridge as ready to receive tool requests.
#[tauri::command]
pub fn agent_bridge_ready() {
    mark_bridge_ready();
}
