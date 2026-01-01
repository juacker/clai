//! JS bridge Tauri commands.
//!
//! This module provides the Tauri command for JavaScript to send tool
//! execution results back to Rust.

use crate::mcp::{complete_pending_request, ToolResponse};

/// Complete a pending worker tool request.
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
/// await invoke('worker_tool_result', {
///     response: {
///         requestId: 'abc-123',
///         success: true,
///         result: { chartId: 'chart-001' }
///     }
/// });
///
/// // After a tool execution error
/// await invoke('worker_tool_result', {
///     response: {
///         requestId: 'abc-123',
///         success: false,
///         error: 'Chart not found'
///     }
/// });
/// ```
#[tauri::command]
pub fn worker_tool_result(response: ToolResponse) -> Result<(), String> {
    complete_pending_request(response)
}
