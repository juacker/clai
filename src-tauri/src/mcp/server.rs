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
//!     │ HTTP (connects to CLAI)
//!     ▼
//! McpToolServer (HTTP on 127.0.0.1:PORT)
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
//! let server = McpToolServer::with_bridge(
//!     api.clone(),
//!     "anomaly_investigator".to_string(),
//!     "space-123".to_string(),
//!     "room-456".to_string(),
//!     bridge,
//! );
//!
//! // Start HTTP server and get the URL for AI CLI to connect
//! let (url, shutdown) = server.serve_http().await?;
//! // url = "http://127.0.0.1:PORT"
//! // shutdown can be used to stop the server
//! ```

use std::future::Future;
use std::sync::Arc;

use axum::{
    body::Body,
    http::Request,
    middleware::Next,
    response::Response,
    Router,
};
use rmcp::{
    handler::server::{tool::ToolCallContext, wrapper::Parameters},
    model::{
        CallToolRequestParam, CallToolResult, Content, ListToolsResult, PaginatedRequestParam,
        ServerCapabilities, ServerInfo,
    },
    tool, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as McpError, ServerHandler,
};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

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
    /// Failed to bind to address.
    BindError(String),
    /// Server error during operation.
    ServerError(String),
}

impl std::fmt::Display for McpServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpServerError::BindError(msg) => write!(f, "Bind error: {}", msg),
            McpServerError::ServerError(msg) => write!(f, "Server error: {}", msg),
        }
    }
}

impl std::error::Error for McpServerError {}

// =============================================================================
// Server Handle
// =============================================================================

/// Handle to a running MCP HTTP server.
///
/// Use this to get the server URL and shut down the server when done.
pub struct McpServerHandle {
    /// The URL where the server is listening (e.g., "http://127.0.0.1:12345")
    pub url: String,
    /// The port the server is listening on
    pub port: u16,
    /// Cancellation token to stop the server
    shutdown: CancellationToken,
}

impl McpServerHandle {
    /// Get the URL for AI CLIs to connect to.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Get the port number.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Shut down the server.
    pub fn shutdown(&self) {
        self.shutdown.cancel();
    }
}

// =============================================================================
// HTTP Logging Middleware
// =============================================================================

/// Middleware to log incoming HTTP requests to the MCP server.
async fn log_requests(request: Request<Body>, next: Next) -> Response {
    use axum::body::to_bytes;
    use axum::http::StatusCode;

    let method = request.method().clone();
    let uri = request.uri().clone();
    let headers = request.headers().clone();

    tracing::debug!(
        method = %method,
        uri = %uri,
        content_type = ?headers.get("content-type"),
        "MCP HTTP request"
    );

    // Track if this is a tools/list request
    let mut is_tools_list = false;

    // For POST requests, try to read and log the body
    if method == axum::http::Method::POST {
        let (parts, body) = request.into_parts();

        // Read body bytes
        match to_bytes(body, 10000).await {
            Ok(bytes) => {
                if let Ok(body_str) = std::str::from_utf8(&bytes) {
                    // Try to parse as JSON to extract method
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body_str) {
                        if let Some(method_name) = json.get("method").and_then(|m| m.as_str()) {
                            tracing::debug!(mcp_method = %method_name, "MCP method");
                            is_tools_list = method_name == "tools/list";
                        }
                        if let Some(id) = json.get("id") {
                            tracing::trace!(request_id = %id, "MCP request ID");
                        }
                    }
                    // Log truncated body for debugging
                    let preview: String = body_str.chars().take(200).collect();
                    tracing::trace!(body = %preview, "Request body");
                }

                // Reconstruct the request
                let request = Request::from_parts(parts, Body::from(bytes));
                let response = next.run(request).await;

                // For tools/list, also log the response body
                if is_tools_list {
                    let (resp_parts, resp_body) = response.into_parts();
                    tracing::debug!(status = %resp_parts.status, "MCP response status");
                    match to_bytes(resp_body, 50000).await {
                        Ok(resp_bytes) => {
                            if let Ok(resp_str) = std::str::from_utf8(&resp_bytes) {
                                tracing::trace!(
                                    response_len = resp_bytes.len(),
                                    response = %resp_str,
                                    "tools/list response"
                                );
                            }
                            return Response::from_parts(resp_parts, Body::from(resp_bytes));
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "Failed to read response body");
                            return Response::from_parts(resp_parts, Body::empty());
                        }
                    }
                }

                tracing::debug!(status = %response.status(), "MCP response status");
                return response;
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to read request body");
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Body::empty())
                    .unwrap();
            }
        }
    }

    let response = next.run(request).await;
    tracing::debug!(status = %response.status(), "MCP response status");
    response
}

// =============================================================================
// MCP Tool Server
// =============================================================================

/// MCP server exposing tools to AI CLIs via HTTP.
///
/// This server wraps `WorkerTools` and exposes them via the MCP protocol
/// over HTTP. AI CLIs connect to this server using:
/// - Claude Code: `claude mcp add --transport http <name> <url>`
/// - Gemini CLI: `gemini mcp add --transport http <name> <url>`
/// - Codex: Configure in `~/.codex/config.toml`
///
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
/// which tools the AI CLI can see and use.
#[derive(Clone)]
#[allow(dead_code)] // Fields used via MCP #[tool] methods
pub struct McpToolServer {
    /// Netdata tools (Rust-native).
    netdata: NetdataTools,
    /// Canvas tools (JS-bridge).
    canvas: CanvasTools,
    /// Tabs tools (JS-bridge).
    tabs: TabsTools,
    /// Allowed tools filter. If None, all tools are allowed.
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
            allowed_tools: None,
        }
    }

    /// Create a new MCP tool server with JS bridge for actual execution.
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
            allowed_tools: None,
        }
    }

    /// Set the allowed tools filter.
    ///
    /// When set, only tools with names in this list will be available.
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

    /// Start the MCP server with HTTP transport.
    ///
    /// This starts an HTTP server on `127.0.0.1` with a random available port.
    /// AI CLIs can then connect to this server using the returned URL.
    ///
    /// # Returns
    ///
    /// Returns a handle containing:
    /// - `url`: The URL for AI CLIs to connect (e.g., "http://127.0.0.1:12345")
    /// - `shutdown()`: Method to stop the server
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// let server = McpToolServer::with_bridge(api, worker_id, space_id, room_id, bridge);
    /// let handle = server.serve_http().await?;
    ///
    /// println!("MCP server at: {}", handle.url());
    ///
    /// // Later, when done:
    /// handle.shutdown();
    /// ```
    pub async fn serve_http(self) -> Result<McpServerHandle, McpServerError> {
        // Log available tools
        let tools: Vec<_> = Self::tool_router().into_iter().collect();
        let tool_names: Vec<_> = tools.iter().map(|t| t.name()).collect();
        tracing::debug!(tools = ?tool_names, count = tools.len(), "MCP server tools");
        // Bind to localhost with port 0 to get a random available port
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| McpServerError::BindError(e.to_string()))?;

        let addr = listener
            .local_addr()
            .map_err(|e| McpServerError::BindError(e.to_string()))?;

        let port = addr.port();
        let url = format!("http://127.0.0.1:{}", port);

        // Create cancellation token for shutdown
        let shutdown_token = CancellationToken::new();
        let server_token = shutdown_token.clone();

        // Configure the HTTP server
        let config = StreamableHttpServerConfig {
            cancellation_token: server_token.clone(),
            ..Default::default()
        };

        // Create session manager
        let session_manager = Arc::new(LocalSessionManager::default());

        // Get filtered tools based on allowed_tools
        let allowed_tools = self.allowed_tools.clone();

        // Create the service factory
        let service = StreamableHttpService::new(
            move || {
                // Create a new server instance for each session
                let mut server = self.clone();
                // Apply tool filtering if set
                if let Some(ref tools) = allowed_tools {
                    server.allowed_tools = Some(tools.clone());
                }
                Ok(server)
            },
            session_manager,
            config,
        );

        // Create axum router with the MCP service and request logging
        let app = Router::new()
            .fallback_service(service)
            .layer(axum::middleware::from_fn(log_requests));

        // Spawn the server
        tokio::spawn(async move {
            tracing::info!(port, "MCP HTTP server listening");
            let server = axum::serve(listener, app).with_graceful_shutdown(async move {
                server_token.cancelled().await;
            });

            if let Err(e) = server.await {
                tracing::error!(error = %e, "MCP HTTP server error");
            }
            tracing::debug!("MCP HTTP server stopped");
        });

        Ok(McpServerHandle {
            url,
            port,
            shutdown: shutdown_token,
        })
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
        tracing::debug!(query = %params.0.query, "netdata.query called");

        let result = self
            .netdata
            .query
            .query(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "netdata.query error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(result_len = result.len(), "netdata.query result");
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
        tracing::debug!(context = %params.0.context, "canvas.addChart called");

        let result = self
            .canvas
            .add_chart(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "canvas.addChart error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(result = ?result, "canvas.addChart success");
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
        tracing::debug!(chart_id = %params.0.chart_id, "canvas.removeChart called");

        self.canvas
            .remove_chart(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "canvas.removeChart error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!("canvas.removeChart success");
        Ok(CallToolResult::success(vec![Content::text("Chart removed")]))
    }

    /// Get a list of all charts currently displayed on the canvas.
    #[tool(
        name = "canvas.getCharts",
        description = "Get a list of all charts currently displayed on the canvas."
    )]
    async fn canvas_get_charts(&self) -> Result<CallToolResult, McpError> {
        tracing::debug!("canvas.getCharts called");

        let result = self
            .canvas
            .get_charts()
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "canvas.getCharts error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(chart_count = result.len(), "canvas.getCharts success");
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
        tracing::debug!("canvas.clearCharts called");

        self.canvas
            .clear_charts()
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "canvas.clearCharts error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!("canvas.clearCharts success");
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
        tracing::debug!(range = %params.0.range, "canvas.setTimeRange called");

        let range = params.0.range.clone();
        self.canvas
            .set_time_range(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "canvas.setTimeRange error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(range = %range, "canvas.setTimeRange success");
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
        tracing::debug!(
            parent_tile_id = %params.0.parent_tile_id,
            split_type = %params.0.split_type,
            "tabs.splitTile called"
        );

        let result = self
            .tabs
            .split_tile(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "tabs.splitTile error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(result = ?result, "tabs.splitTile success");
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
        tracing::debug!(tile_id = %params.0.tile_id, "tabs.removeTile called");

        self.tabs
            .remove_tile(params.0)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "tabs.removeTile error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!("tabs.removeTile success");
        Ok(CallToolResult::success(vec![Content::text("Tile removed")]))
    }

    /// Get the current tile layout structure.
    #[tool(
        name = "tabs.getTileLayout",
        description = "Get the current tile layout tree. Returns tile IDs and their arrangement."
    )]
    async fn tabs_get_tile_layout(&self) -> Result<CallToolResult, McpError> {
        tracing::debug!("tabs.getTileLayout called");

        let result = self
            .tabs
            .get_tile_layout()
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "tabs.getTileLayout error");
                McpError::internal_error(e.to_string(), None)
            })?;

        tracing::debug!(layout = ?result, "tabs.getTileLayout success");
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string(&result).unwrap_or_default(),
        )]))
    }
}

// =============================================================================
// ServerHandler Implementation
// =============================================================================

// Note: list_tools and call_tool use `impl Future` return type to match the trait signature.
// The trait requires this pattern; using `async fn` directly is not compatible with the trait.
#[allow(clippy::manual_async_fn)]
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

    /// List all available tools.
    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: rmcp::service::RequestContext<rmcp::service::RoleServer>,
    ) -> impl Future<Output = Result<ListToolsResult, McpError>> + Send + '_ {
        async move {
            let tools = Self::tool_router().list_all();

            let tool_names: Vec<_> = tools.iter().map(|t| &t.name).collect();
            tracing::debug!(tools = ?tool_names, count = tools.len(), "list_tools response");

            Ok(ListToolsResult {
                tools,
                ..Default::default()
            })
        }
    }

    /// Call a tool by name.
    fn call_tool(
        &self,
        request: CallToolRequestParam,
        context: rmcp::service::RequestContext<rmcp::service::RoleServer>,
    ) -> impl Future<Output = Result<CallToolResult, McpError>> + Send + '_ {
        async move {
            tracing::debug!(tool_name = %request.name, "call_tool");

            let tool_context = ToolCallContext::new(self, request, context);
            Self::tool_router()
                .call(tool_context)
                .await
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

    #[tokio::test]
    async fn test_serve_http_starts_server() {
        let api = create_test_api();
        let server = McpToolServer::new(
            api,
            "test_worker".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );

        let handle = server.serve_http().await.unwrap();

        // Verify we got a valid URL
        assert!(handle.url().starts_with("http://127.0.0.1:"));
        assert!(handle.port() > 0);

        // Shut down the server
        handle.shutdown();
    }
}
