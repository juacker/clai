//! MCP tool definitions and implementations.
//!
//! This module contains all tools that can be exposed to AI workers via MCP.
//!
//! # Tool Namespaces
//!
//! ## Rust-native (`netdata.*`)
//! These tools execute directly in Rust:
//! - `netdata.query` - Query Netdata Cloud AI for analysis
//!
//! ## JS-bridge (`canvas.*`, `tabs.*`)
//! These tools are defined in Rust but execute via Tauri events to the frontend:
//! - `canvas.addChart` - Add a metric chart to the canvas
//! - `canvas.removeChart` - Remove a chart by ID
//! - `canvas.getCharts` - List all charts
//! - `canvas.clearCharts` - Remove all charts
//! - `canvas.setTimeRange` - Set time range for charts
//! - `tabs.addTile` - Add a tile to the current tab
//! - `tabs.removeTile` - Remove a tile by ID
//! - `tabs.getTileLayout` - Get current tile layout

pub mod canvas;
pub mod netdata;
pub mod tabs;

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::api::netdata::NetdataApi;

pub use canvas::CanvasTools;
pub use netdata::NetdataQueryTool;
pub use tabs::TabsTools;

// =============================================================================
// Error Types
// =============================================================================

/// Errors that can occur during tool execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolError {
    /// Invalid tool name format (expected namespace.method).
    InvalidToolName(String),

    /// Unknown namespace.
    UnknownNamespace(String),

    /// Unknown method within a namespace.
    UnknownMethod(String),

    /// Invalid parameters provided.
    InvalidParams(String),

    /// Tool execution failed.
    ExecutionFailed(String),

    /// Network or API error.
    ApiError(String),
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolError::InvalidToolName(name) => {
                write!(f, "Invalid tool name '{}': expected 'namespace.method'", name)
            }
            ToolError::UnknownNamespace(ns) => write!(f, "Unknown namespace: {}", ns),
            ToolError::UnknownMethod(method) => write!(f, "Unknown method: {}", method),
            ToolError::InvalidParams(msg) => write!(f, "Invalid parameters: {}", msg),
            ToolError::ExecutionFailed(msg) => write!(f, "Execution failed: {}", msg),
            ToolError::ApiError(msg) => write!(f, "API error: {}", msg),
        }
    }
}

impl std::error::Error for ToolError {}

// =============================================================================
// NetdataTools Container
// =============================================================================

/// Container for all Netdata tools, created per worker execution.
///
/// Tools are bound to a specific execution context (space_id, room_id) at
/// creation time. This means the AI only needs to provide tool-specific
/// parameters (like the query), not context information.
///
/// Conversation state (conversation_id, message threading) is managed
/// internally by each tool. When the worker stops and the tools are dropped,
/// the conversation state is lost. The next worker run starts fresh.
///
/// # Example
///
/// ```rust,ignore
/// // Create tools bound to worker's context
/// let tools = NetdataTools::new(
///     api,
///     "space-123".to_string(),
///     "room-456".to_string(),
/// );
///
/// // First query - creates conversation
/// let response = tools.query.execute("What anomalies occurred?").await?;
///
/// // Second query - continues conversation with context
/// let response = tools.query.execute("Tell me more about the CPU issue").await?;
/// ```
pub struct NetdataTools {
    /// The netdata_query tool for AI-powered analysis.
    pub query: NetdataQueryTool,
}

impl NetdataTools {
    /// Create tools bound to a specific execution context.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client
    /// * `space_id` - The space ID for context
    /// * `room_id` - The room ID for context
    pub fn new(api: Arc<NetdataApi>, space_id: String, room_id: String) -> Self {
        Self {
            query: NetdataQueryTool::new(api, space_id, room_id),
        }
    }

    /// Get MCP tool definitions for AI CLI configuration.
    ///
    /// Returns a list of tool definitions in MCP schema format that can be
    /// included in the AI CLI's MCP configuration.
    pub fn tool_definitions() -> Vec<serde_json::Value> {
        vec![netdata::tool_definition()]
    }

    /// Execute a method within the netdata namespace.
    ///
    /// # Arguments
    ///
    /// * `method` - The method name (e.g., "query")
    /// * `params` - The method parameters as JSON
    pub async fn execute(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<String, ToolError> {
        match method {
            "query" => {
                let query = params["query"]
                    .as_str()
                    .ok_or_else(|| ToolError::InvalidParams("query parameter is required".into()))?;
                self.query.execute(query).await
            }
            _ => Err(ToolError::UnknownMethod(format!("netdata.{}", method))),
        }
    }
}

// =============================================================================
// WorkerTools - Combined Tool Container
// =============================================================================

/// Container for all tools available to a worker.
///
/// This struct holds all tool instances bound to the worker's execution context.
/// Tools are created when the worker starts and dropped when it finishes.
///
/// # Context Binding
///
/// All tools share the same worker context:
/// - `worker_id` - The worker type (e.g., "anomaly_investigator")
/// - `space_id` - The Netdata space
/// - `room_id` - The Netdata room
///
/// # Lazy Tab Creation
///
/// Canvas and tabs tools don't require a tab upfront. When a UI tool is called,
/// the frontend will find or create a tab owned by this worker. This means:
/// - Workers that don't need UI don't create unnecessary tabs
/// - Tabs are created on-demand when the worker first needs to display something
///
/// # Example
///
/// ```rust,ignore
/// let tools = WorkerTools::new(
///     api,
///     "anomaly_investigator".to_string(),
///     "space-123".to_string(),
///     "room-456".to_string(),
/// );
///
/// // Query Netdata AI (no tab needed)
/// let response = tools.execute("netdata.query", json!({"query": "Any anomalies?"})).await?;
///
/// // Add a chart (tab created lazily if needed)
/// let response = tools.execute("canvas.addChart", json!({"context": "system.cpu"})).await?;
/// ```
pub struct WorkerTools {
    /// Netdata tools (for Cloud AI queries).
    pub netdata: NetdataTools,
    /// Canvas tools (for chart manipulation, lazy tab creation).
    pub canvas: CanvasTools,
    /// Tabs tools (for tile layout manipulation, lazy tab creation).
    pub tabs: TabsTools,
}

impl WorkerTools {
    /// Create all tools bound to the worker's execution context.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client
    /// * `worker_id` - The worker type identifier
    /// * `space_id` - The Netdata space
    /// * `room_id` - The Netdata room
    pub fn new(api: Arc<NetdataApi>, worker_id: String, space_id: String, room_id: String) -> Self {
        Self {
            netdata: NetdataTools::new(api, space_id.clone(), room_id.clone()),
            canvas: CanvasTools::new(worker_id.clone(), space_id.clone(), room_id.clone()),
            tabs: TabsTools::new(worker_id, space_id, room_id),
        }
    }

    /// Get all tool definitions for MCP configuration.
    ///
    /// Returns definitions for all tools: netdata, canvas, and tabs.
    pub fn all_tool_definitions() -> Vec<serde_json::Value> {
        let mut definitions = Vec::new();
        definitions.extend(NetdataTools::tool_definitions());
        definitions.extend(canvas::tool_definitions());
        definitions.extend(tabs::tool_definitions());
        definitions
    }

    /// Execute a tool by its full name (namespace.method).
    ///
    /// Routes to the appropriate tool based on the namespace.
    pub async fn execute(
        &self,
        name: &str,
        params: serde_json::Value,
    ) -> Result<String, ToolError> {
        execute_tool(name, params, self).await
    }
}

// =============================================================================
// Tool Routing
// =============================================================================

/// Route MCP tool calls to bound implementations.
///
/// Tool names use dot notation: `namespace.method` (e.g., `netdata.query`).
/// This allows for clean organization and routing of tools by namespace.
///
/// # Arguments
///
/// * `name` - The tool name in `namespace.method` format (e.g., "netdata.query")
/// * `params` - The tool parameters as JSON
/// * `tools` - The bound worker tools container
///
/// # Returns
///
/// Plain text response from the tool, or an error.
///
/// # Example
///
/// ```rust,ignore
/// let response = execute_tool("netdata.query", json!({"query": "What anomalies?"}), &tools).await?;
/// let response = execute_tool("canvas.addChart", json!({"context": "system.cpu"}), &tools).await?;
/// ```
pub async fn execute_tool(
    name: &str,
    params: serde_json::Value,
    tools: &WorkerTools,
) -> Result<String, ToolError> {
    // Parse namespace.method format
    let (namespace, method) = name
        .split_once('.')
        .ok_or_else(|| ToolError::InvalidToolName(name.to_string()))?;

    match namespace {
        "netdata" => tools.netdata.execute(method, params).await,
        "canvas" => tools.canvas.execute(method, params).await,
        "tabs" => tools.tabs.execute(method, params).await,
        _ => Err(ToolError::UnknownNamespace(namespace.to_string())),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_contains_netdata_query() {
        let definitions = NetdataTools::tool_definitions();
        assert_eq!(definitions.len(), 1);
        assert_eq!(definitions[0]["name"], "netdata.query");
    }

    #[test]
    fn test_tool_error_display() {
        let err = ToolError::InvalidToolName("foo".into());
        assert_eq!(
            format!("{}", err),
            "Invalid tool name 'foo': expected 'namespace.method'"
        );

        let err = ToolError::UnknownNamespace("unknown".into());
        assert_eq!(format!("{}", err), "Unknown namespace: unknown");

        let err = ToolError::UnknownMethod("netdata.foo".into());
        assert_eq!(format!("{}", err), "Unknown method: netdata.foo");

        let err = ToolError::InvalidParams("missing query".into());
        assert_eq!(format!("{}", err), "Invalid parameters: missing query");
    }
}
