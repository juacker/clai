//! Canvas tools for AI agents.
//!
//! These tools allow AI agents to create and manipulate nodes on the
//! React Flow canvas. They are defined in Rust but execute via JS bridge
//! (Tauri events to the frontend).
//!
//! # Available Tools
//!
//! - `canvas.addChart` - Add a chart node to the canvas
//! - `canvas.addStatusBadge` - Add a status badge node
//! - `canvas.addText` - Add a text label node
//! - `canvas.addEdge` - Connect two nodes with an edge
//! - `canvas.removeNode` - Remove a node by ID
//! - `canvas.removeEdge` - Remove an edge by ID
//! - `canvas.getNodes` - List all nodes on the canvas
//! - `canvas.clearCanvas` - Remove all nodes and edges
//!
//! # Node Types
//!
//! - **chart**: Netdata chart visualization with time series data
//! - **statusBadge**: Color-coded status indicator (healthy/warning/critical)
//! - **text**: Simple text label for annotations
//!
//! # Positioning
//!
//! All positions are explicit - agents must specify x,y coordinates.
//! The canvas origin (0,0) is at the top-left.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::ToolError;
use crate::mcp::bridge::JsBridge;

// =============================================================================
// Tool Parameter Types
// =============================================================================

/// Parameters for adding a chart node to the canvas.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddChartNodeParams {
    /// X position on the canvas.
    #[schemars(description = "X coordinate on the canvas")]
    pub x: f64,

    /// Y position on the canvas.
    #[schemars(description = "Y coordinate on the canvas")]
    pub y: f64,

    /// The metric context to chart (e.g., "system.cpu").
    #[schemars(description = "Metric context to chart (e.g., 'system.cpu')")]
    pub context: String,

    /// Optional title for the chart node.
    #[schemars(description = "Optional title displayed above the chart")]
    #[serde(default)]
    pub title: Option<String>,

    /// Optional grouping dimensions.
    #[schemars(description = "Optional grouping dimensions")]
    #[serde(default)]
    pub group_by: Option<Vec<String>>,

    /// Optional filters as key-value pairs.
    #[schemars(description = "Optional filters (e.g., {'node': ['server1']})")]
    #[serde(default)]
    pub filter_by: Option<Value>,

    /// Time range for the chart (default: "15m").
    #[schemars(description = "Time range: 5m, 15m, 30m, 1h, 6h, 24h, 7d")]
    #[serde(default)]
    pub time_range: Option<String>,

    /// Width of the chart node in pixels (default: 400).
    #[schemars(description = "Width in pixels (default: 400)")]
    #[serde(default)]
    pub width: Option<f64>,

    /// Height of the chart node in pixels (default: 300).
    #[schemars(description = "Height in pixels (default: 300)")]
    #[serde(default)]
    pub height: Option<f64>,
}

/// Parameters for adding a status badge node.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddStatusBadgeParams {
    /// X position on the canvas.
    #[schemars(description = "X coordinate on the canvas")]
    pub x: f64,

    /// Y position on the canvas.
    #[schemars(description = "Y coordinate on the canvas")]
    pub y: f64,

    /// Status level.
    #[schemars(description = "Status: healthy, warning, critical, unknown")]
    pub status: String,

    /// Status message.
    #[schemars(description = "Message describing the status")]
    pub message: String,

    /// Optional title.
    #[schemars(description = "Optional title for the badge")]
    #[serde(default)]
    pub title: Option<String>,
}

/// Parameters for adding a text node.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddTextNodeParams {
    /// X position on the canvas.
    #[schemars(description = "X coordinate on the canvas")]
    pub x: f64,

    /// Y position on the canvas.
    #[schemars(description = "Y coordinate on the canvas")]
    pub y: f64,

    /// Text content.
    #[schemars(description = "Text content to display")]
    pub text: String,

    /// Text size.
    #[schemars(description = "Size: small, medium, large, heading")]
    #[serde(default)]
    pub size: Option<String>,

    /// Text color (CSS color value).
    #[schemars(description = "Text color (e.g., '#333', 'red')")]
    #[serde(default)]
    pub color: Option<String>,

    /// Background color (CSS color value).
    #[schemars(description = "Background color (optional)")]
    #[serde(default)]
    pub background_color: Option<String>,
}

/// Parameters for adding an edge between nodes.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddEdgeParams {
    /// Source node ID.
    #[schemars(description = "ID of the source node")]
    pub source_id: String,

    /// Target node ID.
    #[schemars(description = "ID of the target node")]
    pub target_id: String,

    /// Optional label for the edge.
    #[schemars(description = "Optional label displayed on the edge")]
    #[serde(default)]
    pub label: Option<String>,

    /// Whether the edge should be animated.
    #[schemars(description = "Animate the edge (default: true)")]
    #[serde(default)]
    pub animated: Option<bool>,
}

/// Parameters for removing a node.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RemoveNodeParams {
    /// The unique ID of the node to remove.
    #[schemars(description = "The unique ID of the node to remove")]
    pub node_id: String,
}

/// Parameters for removing an edge.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEdgeParams {
    /// The unique ID of the edge to remove.
    #[schemars(description = "The unique ID of the edge to remove")]
    pub edge_id: String,
}

/// Parameters for getting node details.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetNodeDetailsParams {
    /// The unique ID of the node to get details for.
    #[schemars(description = "The unique ID of the node")]
    pub node_id: String,
}

// =============================================================================
// Result Types
// =============================================================================

/// Result of adding a node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AddNodeResult {
    /// The ID of the newly created node.
    pub node_id: String,
}

/// Result of adding an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AddEdgeResult {
    /// The ID of the newly created edge.
    pub edge_id: String,
}

/// Information about a node on the canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NodeInfo {
    /// The node's unique ID.
    pub node_id: String,
    /// The node type (chart, statusBadge, text).
    pub node_type: String,
    /// X position.
    pub x: f64,
    /// Y position.
    pub y: f64,
}

/// Information about an edge on the canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct EdgeInfo {
    /// The edge's unique ID.
    pub edge_id: String,
    /// Source node ID.
    pub source_id: String,
    /// Target node ID.
    pub target_id: String,
}

/// Canvas state information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CanvasInfo {
    /// List of nodes.
    pub nodes: Vec<NodeInfo>,
    /// List of edges.
    pub edges: Vec<EdgeInfo>,
}

/// Detailed information about a node, including its full data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct NodeDetailedInfo {
    /// The node's unique ID.
    pub node_id: String,
    /// The node type (chart, statusBadge, text).
    pub node_type: String,
    /// X position.
    pub x: f64,
    /// Y position.
    pub y: f64,
    /// Full node data (varies by node type).
    pub data: Value,
}

/// Detailed information about an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct EdgeDetailedInfo {
    /// The edge's unique ID.
    pub edge_id: String,
    /// Source node ID.
    pub source_id: String,
    /// Target node ID.
    pub target_id: String,
    /// Optional label.
    pub label: Option<String>,
    /// Whether the edge is animated.
    pub animated: Option<bool>,
}

// =============================================================================
// Canvas Tools
// =============================================================================

/// Canvas tools with agent context bound at creation time.
///
/// These tools manipulate nodes and edges on the React Flow canvas.
/// They execute via Tauri events to the frontend.
#[derive(Clone)]
#[allow(dead_code)]
pub struct CanvasTools {
    /// Agent ID - identifies the agent type.
    agent_id: String,
    /// Space ID - the Netdata space this agent operates in.
    space_id: String,
    /// Room ID - the Netdata room this agent operates in.
    room_id: String,
    /// JS bridge for tool execution (optional for testing).
    bridge: Option<JsBridge>,
}

#[allow(dead_code)]
impl CanvasTools {
    /// Create canvas tools bound to an agent's context (without bridge).
    pub fn new(agent_id: String, space_id: String, room_id: String) -> Self {
        Self {
            agent_id,
            space_id,
            room_id,
            bridge: None,
        }
    }

    /// Create canvas tools with a JS bridge for actual execution.
    pub fn with_bridge(
        agent_id: String,
        space_id: String,
        room_id: String,
        bridge: JsBridge,
    ) -> Self {
        Self {
            agent_id,
            space_id,
            room_id,
            bridge: Some(bridge),
        }
    }

    /// Get the agent ID.
    pub(crate) fn agent_id(&self) -> &str {
        &self.agent_id
    }

    /// Get a reference to the bridge (if available).
    fn bridge(&self) -> Result<&JsBridge, ToolError> {
        self.bridge
            .as_ref()
            .ok_or_else(|| ToolError::ExecutionFailed("JS bridge not available".to_string()))
    }

    /// Add a chart node to the canvas.
    pub async fn add_chart(&self, params: AddChartNodeParams) -> Result<AddNodeResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.addChart",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Add a status badge node to the canvas.
    pub async fn add_status_badge(
        &self,
        params: AddStatusBadgeParams,
    ) -> Result<AddNodeResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.addStatusBadge",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Add a text node to the canvas.
    pub async fn add_text(&self, params: AddTextNodeParams) -> Result<AddNodeResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.addText",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Add an edge between two nodes.
    pub async fn add_edge(&self, params: AddEdgeParams) -> Result<AddEdgeResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.addEdge",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Remove a node from the canvas.
    pub async fn remove_node(&self, params: RemoveNodeParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.removeNode",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Remove an edge from the canvas.
    pub async fn remove_edge(&self, params: RemoveEdgeParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.removeEdge",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Get all nodes on the canvas.
    pub async fn get_nodes(&self) -> Result<Vec<NodeInfo>, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.getNodes",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Clear all nodes and edges from the canvas.
    pub async fn clear_canvas(&self) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.clearCanvas",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Get detailed information about a specific node.
    pub async fn get_node_details(
        &self,
        params: GetNodeDetailsParams,
    ) -> Result<NodeDetailedInfo, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.getNodeDetails",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Get all nodes with their full data.
    pub async fn get_nodes_detailed(&self) -> Result<Vec<NodeDetailedInfo>, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "canvas.getNodesDetailed",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_canvas_tools_creation() {
        let _tools = CanvasTools::new(
            "test_agent".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
    }

    #[test]
    fn test_add_chart_node_params() {
        let json = json!({
            "x": 100.0,
            "y": 200.0,
            "context": "system.cpu",
            "title": "CPU Usage",
            "timeRange": "1h"
        });

        let params: AddChartNodeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.x, 100.0);
        assert_eq!(params.y, 200.0);
        assert_eq!(params.context, "system.cpu");
        assert_eq!(params.title, Some("CPU Usage".to_string()));
        assert_eq!(params.time_range, Some("1h".to_string()));
    }

    #[test]
    fn test_add_status_badge_params() {
        let json = json!({
            "x": 50.0,
            "y": 50.0,
            "status": "healthy",
            "message": "All systems operational"
        });

        let params: AddStatusBadgeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.status, "healthy");
        assert_eq!(params.message, "All systems operational");
    }

    #[test]
    fn test_add_text_node_params() {
        let json = json!({
            "x": 0.0,
            "y": 0.0,
            "text": "Infrastructure Overview",
            "size": "heading"
        });

        let params: AddTextNodeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.text, "Infrastructure Overview");
        assert_eq!(params.size, Some("heading".to_string()));
    }

    #[test]
    fn test_add_edge_params() {
        let json = json!({
            "sourceId": "node-1",
            "targetId": "node-2",
            "label": "depends on"
        });

        let params: AddEdgeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.source_id, "node-1");
        assert_eq!(params.target_id, "node-2");
        assert_eq!(params.label, Some("depends on".to_string()));
    }

    #[test]
    fn test_remove_node_params() {
        let json = json!({
            "nodeId": "node-123"
        });

        let params: RemoveNodeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.node_id, "node-123");
    }

    #[test]
    fn test_get_node_details_params() {
        let json = json!({
            "nodeId": "chart_123"
        });

        let params: GetNodeDetailsParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.node_id, "chart_123");
    }
}
