//! MCP Server implementation for AI worker tools.
//!
//! This module implements an MCP (Model Context Protocol) server that exposes
//! tools to AI CLIs like Claude Code, Gemini CLI, and Codex.
//!
//! # Architecture
//!
//! ```text
//! AI CLI (claude/gemini/codex)
//!     │
//!     │ MCP Protocol (stdio)
//!     ▼
//! McpToolServer
//!     │
//!     ├─→ netdata.query → NetdataTools (Rust-native, direct API call)
//!     │
//!     └─→ canvas.*/tabs.* → CanvasTools/TabsTools (JS-bridge, Tauri events)
//! ```
//!
//! # Usage
//!
//! The server is created per-worker with context already bound:
//!
//! ```rust,ignore
//! use crate::mcp::server::McpToolServer;
//!
//! let server = McpToolServer::new(
//!     api.clone(),
//!     "anomaly_investigator".to_string(),
//!     "space-123".to_string(),
//!     "room-456".to_string(),
//! );
//!
//! // Start server with stdio transport
//! server.serve_stdio().await?;
//! ```

use std::sync::Arc;

use rmcp::{
    handler::server::{tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    tool, tool_router, ErrorData as McpError, ServerHandler, ServiceExt,
};

use crate::api::netdata::NetdataApi;

use super::bridge::JsBridge;
use super::tools::{CanvasTools, NetdataTools, TabsTools};

// Re-export parameter types from tool modules (single source of truth)
pub use super::tools::canvas::{AddChartParams, RemoveChartParams, SetTimeRangeParams};
pub use super::tools::netdata::NetdataQueryParams;
pub use super::tools::tabs::{RemoveTileParams, SplitTileParams};

// =============================================================================
// Error Types
// =============================================================================

/// Errors that can occur when running the MCP server.
#[derive(Debug, Clone)]
pub enum McpServerError {
    /// Transport initialization or communication error.
    TransportError(String),
    /// Service-level error (protocol, disconnection, etc.).
    ServiceError(String),
}

impl std::fmt::Display for McpServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpServerError::TransportError(msg) => write!(f, "Transport error: {}", msg),
            McpServerError::ServiceError(msg) => write!(f, "Service error: {}", msg),
        }
    }
}

impl std::error::Error for McpServerError {}

// =============================================================================
// MCP Tool Server
// =============================================================================

/// MCP server exposing tools to AI CLIs.
///
/// This server wraps `WorkerTools` and exposes them via the MCP protocol.
/// Context (worker_id, space_id, room_id) is bound at creation time,
/// so the AI only needs to provide tool-specific parameters.
///
/// # Tool Categories
///
/// - **netdata.*** - Rust-native, execute directly via API
/// - **canvas.*** - JS-bridge, execute via Tauri events
/// - **tabs.*** - JS-bridge, execute via Tauri events
///
/// # Tool Filtering
///
/// By default, all tools are available. Use `with_allowed_tools()` to restrict
/// which tools the AI CLI can see and use. This filters both the `tools/list`
/// response and blocks execution of non-allowed tools.
#[derive(Clone)]
pub struct McpToolServer {
    /// Netdata tools (Rust-native).
    netdata: NetdataTools,
    /// Canvas tools (JS-bridge).
    canvas: CanvasTools,
    /// Tabs tools (JS-bridge).
    tabs: TabsTools,
    /// Tool router for MCP protocol.
    tool_router: ToolRouter<Self>,
    /// Allowed tools filter. If None, all tools are allowed.
    /// If Some, only tools with names in this list are available.
    allowed_tools: Option<Vec<String>>,
}

// =============================================================================
// Tool Router Implementation
// =============================================================================

/// Tool implementations using rmcp macros.
///
/// Each method decorated with #[tool] becomes an MCP tool.
/// The macro generates JSON Schema from the parameter types.
#[tool_router]
impl McpToolServer {
    /// Create a new MCP tool server with bound context (without JS bridge).
    ///
    /// This constructor creates a server without a JS bridge, useful for testing.
    /// Canvas and tabs tools will return errors when executed.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client
    /// * `worker_id` - Worker type identifier (e.g., "anomaly_investigator")
    /// * `space_id` - Netdata space ID
    /// * `room_id` - Netdata room ID
    pub fn new(
        api: Arc<NetdataApi>,
        worker_id: String,
        space_id: String,
        room_id: String,
    ) -> Self {
        Self {
            netdata: NetdataTools::new(api, space_id.clone(), room_id.clone()),
            canvas: CanvasTools::new(worker_id.clone(), space_id.clone(), room_id.clone()),
            tabs: TabsTools::new(worker_id, space_id, room_id),
            tool_router: Self::tool_router(),
            allowed_tools: None,
        }
    }

    /// Create a new MCP tool server with JS bridge for actual execution.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client
    /// * `worker_id` - Worker type identifier (e.g., "anomaly_investigator")
    /// * `space_id` - Netdata space ID
    /// * `room_id` - Netdata room ID
    /// * `bridge` - JS bridge for canvas/tabs tool execution
    pub fn with_bridge(
        api: Arc<NetdataApi>,
        worker_id: String,
        space_id: String,
        room_id: String,
        bridge: JsBridge,
    ) -> Self {
        Self {
            netdata: NetdataTools::new(api, space_id.clone(), room_id.clone()),
            canvas: CanvasTools::with_bridge(
                worker_id.clone(),
                space_id.clone(),
                room_id.clone(),
                bridge.clone(),
            ),
            tabs: TabsTools::with_bridge(worker_id, space_id, room_id, bridge),
            tool_router: Self::tool_router(),
            allowed_tools: None,
        }
    }

    /// Set the allowed tools filter.
    ///
    /// When set, only tools with names in this list will be:
    /// - Returned in the `tools/list` response (AI CLI only sees these)
    /// - Allowed to execute (calls to other tools will fail)
    ///
    /// # Arguments
    ///
    /// * `tools` - List of tool names to allow (e.g., `["netdata.query", "canvas.addChart"]`)
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// let server = McpToolServer::new(api, worker_id, space_id, room_id)
    ///     .with_allowed_tools(vec!["netdata.query".to_string()]);
    /// ```
    pub fn with_allowed_tools(mut self, tools: Vec<String>) -> Self {
        self.allowed_tools = Some(tools);
        self
    }

    /// Get the worker ID.
    pub fn worker_id(&self) -> &str {
        self.canvas.worker_id()
    }

    /// Get the space ID.
    pub fn space_id(&self) -> &str {
        self.netdata.space_id()
    }

    /// Get the room ID.
    pub fn room_id(&self) -> &str {
        self.netdata.room_id()
    }

    /// Start the MCP server with stdio transport.
    ///
    /// This method blocks until the AI CLI disconnects or an error occurs.
    /// Use this when spawning an AI CLI subprocess - connect this server
    /// to the subprocess's stdin/stdout.
    ///
    /// If `allowed_tools` was set via `with_allowed_tools()`, only those tools
    /// will be available to the AI CLI.
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// let server = McpToolServer::new(api, worker_id, space_id, room_id);
    ///
    /// // This blocks until the AI CLI finishes
    /// server.serve_stdio().await?;
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Transport initialization fails
    /// - Protocol error during communication
    /// - AI CLI disconnects unexpectedly
    pub async fn serve_stdio(self) -> Result<(), McpServerError> {
        use rmcp::handler::server::router::Router;
        use rmcp::transport::stdio;

        // Get all tool routes from the router
        let all_tools = (Self::tool_router)();

        // Filter tools based on allowed_tools
        let filtered_tools: Vec<_> = match &self.allowed_tools {
            Some(allowed) => all_tools
                .into_iter()
                .filter(|route| allowed.contains(&route.name().to_string()))
                .collect(),
            None => all_tools.into_iter().collect(),
        };

        // Build router with filtered tools
        let router = Router::new(self).with_tools(filtered_tools);

        // Start serving with stdio transport
        let service = router
            .serve(stdio())
            .await
            .map_err(|e| McpServerError::TransportError(e.to_string()))?;

        // Wait for the service to complete (AI CLI disconnects)
        service
            .waiting()
            .await
            .map_err(|e| McpServerError::ServiceError(e.to_string()))?;

        Ok(())
    }

    // -------------------------------------------------------------------------
    // Netdata Tools (Rust-native)
    // -------------------------------------------------------------------------

    /// Query Netdata Cloud AI for analysis of metrics, alerts, anomalies,
    /// and infrastructure health. The AI has access to all monitoring data.
    #[tool(
        name = "netdata.query",
        description = "Query Netdata Cloud AI for analysis of metrics, alerts, anomalies, and infrastructure health. Returns text analysis."
    )]
    async fn netdata_query(
        &self,
        params: Parameters<NetdataQueryParams>,
    ) -> Result<CallToolResult, McpError> {
        let result = self
            .netdata
            .query
            .query(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(result)]))
    }

    // -------------------------------------------------------------------------
    // Canvas Tools (JS-bridge)
    // -------------------------------------------------------------------------

    /// Add a metric chart to the canvas for visualization.
    #[tool(
        name = "canvas.addChart",
        description = "Add a metric chart to the canvas. Displays time-series data for the specified metric context."
    )]
    async fn canvas_add_chart(
        &self,
        params: Parameters<AddChartParams>,
    ) -> Result<CallToolResult, McpError> {
        let result = self
            .canvas
            .add_chart(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string(&result).unwrap_or_default(),
        )]))
    }

    /// Remove a chart from the canvas by its ID.
    #[tool(
        name = "canvas.removeChart",
        description = "Remove a chart from the canvas by its ID."
    )]
    async fn canvas_remove_chart(
        &self,
        params: Parameters<RemoveChartParams>,
    ) -> Result<CallToolResult, McpError> {
        self.canvas
            .remove_chart(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text("Chart removed")]))
    }

    /// Get a list of all charts currently displayed on the canvas.
    #[tool(
        name = "canvas.getCharts",
        description = "Get a list of all charts currently displayed on the canvas."
    )]
    async fn canvas_get_charts(&self) -> Result<CallToolResult, McpError> {
        let result = self
            .canvas
            .get_charts()
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string(&result).unwrap_or_default(),
        )]))
    }

    /// Remove all charts from the canvas.
    #[tool(
        name = "canvas.clearCharts",
        description = "Remove all charts from the canvas. Use to start fresh."
    )]
    async fn canvas_clear_charts(&self) -> Result<CallToolResult, McpError> {
        self.canvas
            .clear_charts()
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(
            "All charts cleared",
        )]))
    }

    /// Set the time range for all charts on the canvas.
    #[tool(
        name = "canvas.setTimeRange",
        description = "Set the time range for all charts. Options: 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d"
    )]
    async fn canvas_set_time_range(
        &self,
        params: Parameters<SetTimeRangeParams>,
    ) -> Result<CallToolResult, McpError> {
        let range = params.0.range.clone();
        self.canvas
            .set_time_range(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(format!(
            "Time range set to {}",
            range
        ))]))
    }

    // -------------------------------------------------------------------------
    // Tabs Tools (JS-bridge)
    // -------------------------------------------------------------------------

    /// Split an existing tile to create a new one.
    #[tool(
        name = "tabs.splitTile",
        description = "Split an existing tile. 'vertical' creates side-by-side tiles, 'horizontal' creates stacked tiles."
    )]
    async fn tabs_split_tile(
        &self,
        params: Parameters<SplitTileParams>,
    ) -> Result<CallToolResult, McpError> {
        let result = self
            .tabs
            .split_tile(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string(&result).unwrap_or_default(),
        )]))
    }

    /// Remove a tile from the current tab.
    #[tool(
        name = "tabs.removeTile",
        description = "Remove a tile from the current tab by its ID."
    )]
    async fn tabs_remove_tile(
        &self,
        params: Parameters<RemoveTileParams>,
    ) -> Result<CallToolResult, McpError> {
        self.tabs
            .remove_tile(params.0)
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text("Tile removed")]))
    }

    /// Get the current tile layout structure.
    #[tool(
        name = "tabs.getTileLayout",
        description = "Get the current tile layout tree. Returns tile IDs and their arrangement."
    )]
    async fn tabs_get_tile_layout(&self) -> Result<CallToolResult, McpError> {
        let result = self
            .tabs
            .get_tile_layout()
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string(&result).unwrap_or_default(),
        )]))
    }
}

// =============================================================================
// ServerHandler Implementation
// =============================================================================

impl ServerHandler for McpToolServer {
    /// Return server information and capabilities.
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Netdata AI Worker tools. Use netdata.query for data analysis, \
                 canvas.* for chart visualization, and tabs.* for layout management."
                    .into(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::client::create_client;

    fn create_test_api() -> Arc<NetdataApi> {
        let client = create_client();
        Arc::new(NetdataApi::new(
            client,
            "https://app.netdata.cloud".to_string(),
            "test-token".to_string(),
        ))
    }

    #[test]
    fn test_server_creation() {
        let api = create_test_api();
        let server = McpToolServer::new(
            api,
            "test_worker".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );

        assert_eq!(server.worker_id(), "test_worker");
        assert_eq!(server.space_id(), "space-123");
        assert_eq!(server.room_id(), "room-456");
    }

    #[test]
    fn test_server_info() {
        let api = create_test_api();
        let server = McpToolServer::new(
            api,
            "test_worker".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );

        let info = server.get_info();
        assert!(info.instructions.is_some());
        assert!(info.instructions.unwrap().contains("Netdata"));
    }

    #[test]
    fn test_netdata_query_params_deserialization() {
        let json = serde_json::json!({
            "query": "What anomalies are happening?"
        });

        let params: NetdataQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.query, "What anomalies are happening?");
    }

    #[test]
    fn test_add_chart_params_deserialization() {
        let json = serde_json::json!({
            "context": "system.cpu",
            "groupBy": ["node"],
            "filterBy": {"node": ["server1"]}
        });

        let params: AddChartParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.context, "system.cpu");
        assert_eq!(params.group_by, Some(vec!["node".to_string()]));
        assert!(params.filter_by.is_some());
    }

    #[test]
    fn test_split_tile_params_deserialization() {
        let json = serde_json::json!({
            "parentTileId": "tile-1",
            "splitType": "vertical"
        });

        let params: SplitTileParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.parent_tile_id, "tile-1");
        assert_eq!(params.split_type, "vertical");
    }

    #[test]
    fn test_with_allowed_tools() {
        let api = create_test_api();
        let server = McpToolServer::new(
            api,
            "test_worker".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        )
        .with_allowed_tools(vec!["netdata.query".to_string()]);

        assert!(server.allowed_tools.is_some());
        assert_eq!(server.allowed_tools.as_ref().unwrap().len(), 1);
        assert!(server
            .allowed_tools
            .as_ref()
            .unwrap()
            .contains(&"netdata.query".to_string()));
    }

    #[test]
    fn test_tool_router_returns_all_tools() {
        // Verify that tool_router returns all 9 tools
        let all_tools: Vec<_> = (McpToolServer::tool_router)().into_iter().collect();
        assert_eq!(all_tools.len(), 9);

        let tool_names: Vec<_> = all_tools.iter().map(|r| r.name()).collect();
        assert!(tool_names.contains(&"netdata.query"));
        assert!(tool_names.contains(&"canvas.addChart"));
        assert!(tool_names.contains(&"canvas.removeChart"));
        assert!(tool_names.contains(&"canvas.getCharts"));
        assert!(tool_names.contains(&"canvas.clearCharts"));
        assert!(tool_names.contains(&"canvas.setTimeRange"));
        assert!(tool_names.contains(&"tabs.splitTile"));
        assert!(tool_names.contains(&"tabs.removeTile"));
        assert!(tool_names.contains(&"tabs.getTileLayout"));
    }
}
