//! MCP tool definitions and implementations.
//!
//! This module contains all tools that can be exposed to AI workers via MCP.
//! Currently implements:
//!
//! - `netdata_query` - Query Netdata Cloud AI for analysis

pub mod netdata;

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::api::ai::AiService;

pub use netdata::NetdataQueryTool;

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
/// # Example
///
/// ```rust,ignore
/// // Create tools bound to worker's context
/// let tools = NetdataTools::new(
///     ai_service,
///     "space-123".to_string(),
///     "room-456".to_string(),
///     Some("conv-789".to_string()),
/// );
///
/// // Execute a query - context already bound
/// let response = tools.query.execute("What anomalies occurred?").await?;
/// ```
pub struct NetdataTools {
    /// The netdata_query tool for AI-powered analysis.
    pub query: NetdataQueryTool,
    // Future tools can be added here:
    // pub alerts: NetdataAlertsTool,
    // pub data: NetdataDataTool,
}

impl NetdataTools {
    /// Create tools bound to a specific execution context.
    ///
    /// # Arguments
    ///
    /// * `ai_service` - The AI service for chat completion
    /// * `space_id` - The space ID for context
    /// * `room_id` - The room ID for context
    /// * `conversation_id` - Optional conversation ID for continuing conversations
    pub fn new(
        ai_service: Arc<AiService>,
        space_id: String,
        room_id: String,
        conversation_id: Option<String>,
    ) -> Self {
        Self {
            query: NetdataQueryTool::new(ai_service, space_id, room_id, conversation_id),
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
/// * `netdata_tools` - The bound Netdata tools container
///
/// # Returns
///
/// Plain text response from the tool, or an error.
///
/// # Example
///
/// ```rust,ignore
/// let response = execute_tool("netdata.query", json!({"query": "What anomalies?"}), &tools).await?;
/// ```
pub async fn execute_tool(
    name: &str,
    params: serde_json::Value,
    netdata_tools: &NetdataTools,
) -> Result<String, ToolError> {
    // Parse namespace.method format
    let (namespace, method) = name
        .split_once('.')
        .ok_or_else(|| ToolError::InvalidToolName(name.to_string()))?;

    match namespace {
        "netdata" => netdata_tools.execute(method, params).await,
        // Future namespaces:
        // "canvas" => canvas_tools.execute(method, params).await,
        // "tabs" => tabs_tools.execute(method, params).await,
        // "notifications" => notification_tools.execute(method, params).await,
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
