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
#[allow(dead_code)] // Used by tool implementations called via MCP
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
                write!(
                    f,
                    "Invalid tool name '{}': expected 'namespace.method'",
                    name
                )
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
#[derive(Clone)]
#[allow(dead_code)] // Fields used via MCP tool methods
pub struct NetdataTools {
    /// The netdata_query tool for AI-powered analysis.
    pub query: NetdataQueryTool,
    /// Space ID for context.
    space_id: String,
    /// Room ID for context.
    room_id: String,
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
            query: NetdataQueryTool::new(api, space_id.clone(), room_id.clone()),
            space_id,
            room_id,
        }
    }

    /// Get the space ID.
    pub(crate) fn space_id(&self) -> &str {
        &self.space_id
    }

    /// Get the room ID.
    pub(crate) fn room_id(&self) -> &str {
        &self.room_id
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

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
