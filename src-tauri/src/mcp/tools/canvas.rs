//! Canvas tools for AI workers.
//!
//! These tools allow AI workers to manipulate charts and visualizations
//! on the canvas. They are defined in Rust but execute via JS bridge
//! (Tauri events to the frontend).
//!
//! # Available Tools
//!
//! - `canvas.addChart` - Add a metric chart to the canvas
//! - `canvas.removeChart` - Remove a chart by ID
//! - `canvas.getCharts` - List all charts on the canvas
//! - `canvas.clearCharts` - Remove all charts
//! - `canvas.setTimeRange` - Set the time range for all charts
//!
//! # Execution
//!
//! These tools don't execute directly in Rust. Instead, they emit Tauri
//! events to the frontend which handles the actual UI manipulation.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::ToolError;
use crate::mcp::bridge::JsBridge;

// =============================================================================
// Tool Parameter Types (Single Source of Truth)
// =============================================================================

/// Parameters for adding a chart to the canvas.
///
/// Used by both the MCP server (for schema generation) and the bridge
/// (for serialization).
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddChartParams {
    /// The metric context to chart (e.g., "system.cpu", "disk.io").
    #[schemars(description = "Metric context to chart (e.g., 'system.cpu', 'disk.io')")]
    pub context: String,

    /// Optional grouping dimensions (e.g., ["node", "instance"]).
    #[schemars(description = "Optional grouping dimensions")]
    #[serde(default)]
    pub group_by: Option<Vec<String>>,

    /// Optional filters as key-value pairs.
    #[schemars(description = "Optional filters (e.g., {'node': ['server1']})")]
    #[serde(default)]
    pub filter_by: Option<Value>,
}

/// Parameters for removing a chart from the canvas.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RemoveChartParams {
    /// The unique ID of the chart to remove.
    #[schemars(description = "The unique ID of the chart to remove")]
    pub chart_id: String,
}

/// Parameters for setting the time range.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetTimeRangeParams {
    /// Time range to display.
    #[schemars(description = "Time range: 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d")]
    pub range: String,
}

// =============================================================================
// Result Types
// =============================================================================

/// Result of adding a chart.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddChartResult {
    /// The ID of the newly created chart.
    pub chart_id: String,
}

/// Information about a chart on the canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartInfo {
    /// The chart's unique ID.
    pub chart_id: String,
    /// The metric context being displayed.
    pub context: String,
}

/// Canvas tools with worker context bound at creation time.
///
/// These tools manipulate charts on the canvas. They execute via Tauri
/// events to the frontend, which handles the actual UI operations.
///
/// # Context Binding
///
/// The tool is created with worker context (worker_id, space_id, room_id).
/// When a canvas tool is called, the frontend will:
/// 1. Find or create a tab owned by this worker
/// 2. Execute the operation on that tab's canvas
///
/// This allows lazy tab creation - workers only get a tab when they
/// actually need to display something.
///
/// # Tab Ownership
///
/// Each worker can own at most one tab. The tab is identified by:
/// - worker_id: The type of worker (e.g., "anomaly_investigator")
/// - space_id: The Netdata space
/// - room_id: The Netdata room
///
/// # Bridge
///
/// The optional `JsBridge` enables actual tool execution. If not provided
/// (e.g., in tests), tools will return an error indicating the bridge
/// is not available.
#[derive(Clone)]
pub struct CanvasTools {
    /// Worker ID - identifies the worker type.
    worker_id: String,
    /// Space ID - the Netdata space this worker operates in.
    space_id: String,
    /// Room ID - the Netdata room this worker operates in.
    room_id: String,
    /// JS bridge for tool execution (optional for testing).
    bridge: Option<JsBridge>,
}

impl CanvasTools {
    /// Create canvas tools bound to a worker's context (without bridge).
    ///
    /// This constructor creates tools without a JS bridge, useful for testing.
    /// Tools will return an error when executed.
    pub fn new(worker_id: String, space_id: String, room_id: String) -> Self {
        Self {
            worker_id,
            space_id,
            room_id,
            bridge: None,
        }
    }

    /// Create canvas tools with a JS bridge for actual execution.
    ///
    /// The tab will be created lazily when the first UI operation is performed.
    pub fn with_bridge(
        worker_id: String,
        space_id: String,
        room_id: String,
        bridge: JsBridge,
    ) -> Self {
        Self {
            worker_id,
            space_id,
            room_id,
            bridge: Some(bridge),
        }
    }

    /// Get the worker ID.
    pub fn worker_id(&self) -> &str {
        &self.worker_id
    }

    /// Get the space ID.
    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    /// Get the room ID.
    pub fn room_id(&self) -> &str {
        &self.room_id
    }

    /// Get a reference to the bridge (if available).
    fn bridge(&self) -> Result<&JsBridge, ToolError> {
        self.bridge
            .as_ref()
            .ok_or_else(|| ToolError::ExecutionFailed("JS bridge not available".to_string()))
    }

    /// Add a chart to the canvas.
    ///
    /// Calls the JS bridge to create the chart in the frontend.
    pub async fn add_chart(&self, params: AddChartParams) -> Result<AddChartResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "canvas.addChart",
                serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Remove a chart from the canvas.
    pub async fn remove_chart(&self, params: RemoveChartParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "canvas.removeChart",
                serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Get all charts on the canvas.
    pub async fn get_charts(&self) -> Result<Vec<ChartInfo>, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "canvas.getCharts",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Clear all charts from the canvas.
    pub async fn clear_charts(&self) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "canvas.clearCharts",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Set the time range for all charts.
    pub async fn set_time_range(&self, params: SetTimeRangeParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "canvas.setTimeRange",
                serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
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
        let tools = CanvasTools::new(
            "anomaly_investigator".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
        assert_eq!(tools.worker_id(), "anomaly_investigator");
        assert_eq!(tools.space_id(), "space-123");
        assert_eq!(tools.room_id(), "room-456");
    }

    #[test]
    fn test_add_chart_params_deserialization() {
        let json = json!({
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
    fn test_add_chart_params_minimal() {
        let json = json!({
            "context": "disk.io"
        });

        let params: AddChartParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.context, "disk.io");
        assert!(params.group_by.is_none());
        assert!(params.filter_by.is_none());
    }

    #[test]
    fn test_remove_chart_params() {
        let json = json!({
            "chartId": "chart-123"
        });

        let params: RemoveChartParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.chart_id, "chart-123");
    }

    #[test]
    fn test_set_time_range_params() {
        let json = json!({
            "range": "1h"
        });

        let params: SetTimeRangeParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.range, "1h");
    }

}
