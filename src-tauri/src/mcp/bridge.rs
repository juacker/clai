//! JS Tool Bridge for AI worker tools.
//!
//! This module provides the bridge between Rust MCP tools and JavaScript
//! frontend components. Tools like `canvas.*` and `tabs.*` are defined in
//! Rust but execute their operations in the frontend via Tauri events.
//!
//! # Architecture
//!
//! ```text
//! Rust (async)                        JS (React)
//!      │                                   │
//!      │  emit("worker:tool:request", {    │
//!      │    requestId, workerId,           │
//!      │    spaceId, roomId,               │
//!      │    tool, params                   │
//!      ├──────────────────────────────────►│
//!      │                                   │  getOrCreateWorkerTab()
//!      │  (async wait via oneshot)         │  execute tool
//!      │                                   │
//!      │  invoke("worker_tool_result", {   │
//!      │    requestId, result              │
//!      │◄──────────────────────────────────┤
//!      │                                   │
//!      │  return result to AI              │
//! ```
//!
//! # Usage
//!
//! The bridge is created with an `AppHandle`:
//!
//! ```rust,ignore
//! let bridge = JsBridge::new(app_handle.clone());
//!
//! // In a tool implementation:
//! let response = bridge.call_tool(
//!     "anomaly_investigator",
//!     "space-123",
//!     "room-456",
//!     "canvas.addChart",
//!     json!({ "context": "system.cpu" }),
//! ).await?;
//! ```
//!
//! # Global Pending Requests
//!
//! Pending requests are stored in a global registry so that the Tauri command
//! `worker_tool_result` can complete them. This allows multiple `JsBridge`
//! instances to share the same pending request storage.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio::time::timeout;

// =============================================================================
// Types
// =============================================================================

/// Request sent from Rust to JS for tool execution.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRequest {
    /// Unique request ID for correlating responses.
    pub request_id: String,
    /// Worker type identifier (e.g., "anomaly_investigator").
    pub worker_id: String,
    /// Netdata space ID.
    pub space_id: String,
    /// Netdata room ID.
    pub room_id: String,
    /// Tool name (e.g., "canvas.addChart", "tabs.splitTile").
    pub tool: String,
    /// Tool parameters as JSON.
    pub params: serde_json::Value,
}

/// Response from JS after tool execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResponse {
    /// The request ID this is responding to.
    pub request_id: String,
    /// Whether the tool executed successfully.
    pub success: bool,
    /// Result data (if successful).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// Error message (if failed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Errors that can occur during JS bridge operations.
#[derive(Debug, Clone)]
pub enum BridgeError {
    /// Failed to emit event to frontend.
    EmitFailed(String),
    /// Response was not received in time.
    Timeout,
    /// Response channel was closed (receiver dropped).
    ChannelClosed,
    /// Tool execution failed in JS.
    ToolFailed(String),
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BridgeError::EmitFailed(msg) => write!(f, "Failed to emit event: {}", msg),
            BridgeError::Timeout => write!(f, "Tool request timed out"),
            BridgeError::ChannelClosed => write!(f, "Response channel closed"),
            BridgeError::ToolFailed(msg) => write!(f, "Tool execution failed: {}", msg),
        }
    }
}

impl std::error::Error for BridgeError {}

// =============================================================================
// Global Pending Requests Registry
// =============================================================================

/// Default timeout for tool requests (30 seconds).
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Event name for tool requests.
pub const EVENT_TOOL_REQUEST: &str = "worker:tool:request";

/// Internal state for pending requests.
type PendingMap = HashMap<String, oneshot::Sender<ToolResponse>>;

/// Global pending requests registry.
///
/// This is shared across all `JsBridge` instances so that the Tauri command
/// can complete requests regardless of which bridge instance made them.
static PENDING_REQUESTS: OnceLock<Mutex<PendingMap>> = OnceLock::new();

/// Get the global pending requests map, initializing if necessary.
fn pending_requests() -> &'static Mutex<PendingMap> {
    PENDING_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Complete a pending tool request from the Tauri command.
///
/// This function is called by the `worker_tool_result` Tauri command
/// when JavaScript sends back a response.
///
/// # Arguments
///
/// * `response` - The tool response from JavaScript
///
/// # Returns
///
/// Ok if the request was found and completed, Err if unknown request ID.
pub fn complete_pending_request(response: ToolResponse) -> Result<(), String> {
    let tx = {
        let mut pending = pending_requests().lock().unwrap();
        pending.remove(&response.request_id)
    };

    match tx {
        Some(sender) => sender
            .send(response)
            .map_err(|_| "Response receiver was dropped".to_string()),
        None => Err(format!("Unknown request ID: {}", response.request_id)),
    }
}

// =============================================================================
// JsBridge
// =============================================================================

/// Bridge for calling JS tools from Rust.
///
/// This struct manages the communication between Rust MCP tools and
/// JavaScript frontend. It uses Tauri events for requests and a
/// Tauri command for responses.
///
/// # Thread Safety
///
/// `JsBridge` is `Clone` and can be safely shared across threads.
/// Pending requests are stored in a global registry shared by all instances.
#[derive(Clone)]
pub struct JsBridge {
    /// Tauri app handle for emitting events.
    app_handle: AppHandle,
    /// Timeout for tool requests.
    timeout: Duration,
}

impl JsBridge {
    /// Create a new JS bridge with the given app handle.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - Tauri app handle for emitting events
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// Create a new JS bridge with a custom timeout.
    ///
    /// # Arguments
    ///
    /// * `app_handle` - Tauri app handle for emitting events
    /// * `timeout` - Timeout duration for tool requests
    pub fn with_timeout(app_handle: AppHandle, timeout: Duration) -> Self {
        Self {
            app_handle,
            timeout,
        }
    }

    /// Setup a worker's tab and canvas before the CLI starts.
    ///
    /// This creates the worker's tab with a canvas command upfront, avoiding
    /// race conditions when multiple tool calls come in rapid succession.
    ///
    /// # Arguments
    ///
    /// * `worker_id` - Worker type identifier (e.g., "anomaly-investigator")
    /// * `worker_name` - Human-readable worker name for the tab title
    /// * `space_id` - Netdata space ID
    /// * `room_id` - Netdata room ID
    ///
    /// # Returns
    ///
    /// The tab ID that was created or found.
    ///
    /// # Errors
    ///
    /// Same as `call_tool`.
    pub async fn setup_worker_tab(
        &self,
        worker_id: &str,
        worker_name: &str,
        space_id: &str,
        room_id: &str,
    ) -> Result<String, BridgeError> {
        let result = self
            .call_tool(
                worker_id,
                space_id,
                room_id,
                "worker.setup",
                serde_json::json!({
                    "workerName": worker_name,
                }),
            )
            .await?;

        // Extract tab ID from result
        result
            .get("tabId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| BridgeError::ToolFailed("Missing tabId in response".to_string()))
    }

    /// Call a JS tool and wait for the response.
    ///
    /// This method:
    /// 1. Generates a unique request ID
    /// 2. Creates a oneshot channel for the response
    /// 3. Stores the sender in the global registry
    /// 4. Emits a `worker:tool:request` event to the frontend
    /// 5. Waits for the response (with timeout)
    ///
    /// # Arguments
    ///
    /// * `worker_id` - Worker type identifier
    /// * `space_id` - Netdata space ID
    /// * `room_id` - Netdata room ID
    /// * `tool` - Tool name (e.g., "canvas.addChart")
    /// * `params` - Tool parameters as JSON
    ///
    /// # Returns
    ///
    /// The tool response containing the result or error.
    ///
    /// # Errors
    ///
    /// - `BridgeError::EmitFailed` - Failed to emit event
    /// - `BridgeError::Timeout` - Response not received in time
    /// - `BridgeError::ChannelClosed` - Response sender was dropped
    /// - `BridgeError::ToolFailed` - Tool execution failed in JS
    pub async fn call_tool(
        &self,
        worker_id: &str,
        space_id: &str,
        room_id: &str,
        tool: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, BridgeError> {
        // Generate unique request ID
        let request_id = uuid::Uuid::new_v4().to_string();

        // Create oneshot channel for response
        let (tx, rx) = oneshot::channel();

        // Store sender in global pending registry
        {
            let mut pending = pending_requests().lock().unwrap();
            pending.insert(request_id.clone(), tx);
        }

        // Build request
        let request = ToolRequest {
            request_id: request_id.clone(),
            worker_id: worker_id.to_string(),
            space_id: space_id.to_string(),
            room_id: room_id.to_string(),
            tool: tool.to_string(),
            params,
        };

        // Emit event to frontend
        if let Err(e) = self.app_handle.emit(EVENT_TOOL_REQUEST, &request) {
            // Remove pending request on failure
            let mut pending = pending_requests().lock().unwrap();
            pending.remove(&request_id);
            return Err(BridgeError::EmitFailed(e.to_string()));
        }

        // Wait for response with timeout
        let result = timeout(self.timeout, rx).await;

        // Clean up pending request (in case of timeout)
        {
            let mut pending = pending_requests().lock().unwrap();
            pending.remove(&request_id);
        }

        match result {
            Ok(Ok(response)) => {
                if response.success {
                    Ok(response.result.unwrap_or(serde_json::Value::Null))
                } else {
                    Err(BridgeError::ToolFailed(
                        response.error.unwrap_or_else(|| "Unknown error".to_string()),
                    ))
                }
            }
            Ok(Err(_)) => Err(BridgeError::ChannelClosed),
            Err(_) => Err(BridgeError::Timeout),
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_request_serialization() {
        let request = ToolRequest {
            request_id: "req-123".to_string(),
            worker_id: "anomaly_investigator".to_string(),
            space_id: "space-456".to_string(),
            room_id: "room-789".to_string(),
            tool: "canvas.addChart".to_string(),
            params: serde_json::json!({ "context": "system.cpu" }),
        };

        let json = serde_json::to_value(&request).unwrap();

        assert_eq!(json["requestId"], "req-123");
        assert_eq!(json["workerId"], "anomaly_investigator");
        assert_eq!(json["spaceId"], "space-456");
        assert_eq!(json["roomId"], "room-789");
        assert_eq!(json["tool"], "canvas.addChart");
        assert_eq!(json["params"]["context"], "system.cpu");
    }

    #[test]
    fn test_tool_response_deserialization() {
        let json = serde_json::json!({
            "requestId": "req-123",
            "success": true,
            "result": { "chartId": "chart-001" }
        });

        let response: ToolResponse = serde_json::from_value(json).unwrap();

        assert_eq!(response.request_id, "req-123");
        assert!(response.success);
        assert!(response.result.is_some());
        assert_eq!(response.result.unwrap()["chartId"], "chart-001");
        assert!(response.error.is_none());
    }

    #[test]
    fn test_tool_response_error_deserialization() {
        let json = serde_json::json!({
            "requestId": "req-456",
            "success": false,
            "error": "Chart not found"
        });

        let response: ToolResponse = serde_json::from_value(json).unwrap();

        assert_eq!(response.request_id, "req-456");
        assert!(!response.success);
        assert!(response.result.is_none());
        assert_eq!(response.error.unwrap(), "Chart not found");
    }

    #[test]
    fn test_bridge_error_display() {
        assert_eq!(
            BridgeError::Timeout.to_string(),
            "Tool request timed out"
        );
        assert_eq!(
            BridgeError::ChannelClosed.to_string(),
            "Response channel closed"
        );
        assert_eq!(
            BridgeError::ToolFailed("test error".to_string()).to_string(),
            "Tool execution failed: test error"
        );
    }
}
