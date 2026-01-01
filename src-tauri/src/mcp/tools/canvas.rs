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
use serde_json::{json, Value};

use super::ToolError;

/// Returns all canvas tool definitions in MCP-compatible format.
///
/// These tools manipulate the chart canvas in the UI. When called,
/// they will be routed to the frontend via Tauri events.
pub fn tool_definitions() -> Vec<Value> {
    vec![
        add_chart_definition(),
        remove_chart_definition(),
        get_charts_definition(),
        clear_charts_definition(),
        set_time_range_definition(),
    ]
}

/// Tool: canvas.addChart
///
/// Adds a metric chart to the canvas for visualization.
fn add_chart_definition() -> Value {
    json!({
        "name": "canvas.addChart",
        "description": "Add a metric chart to the canvas. The chart will display time-series data for the specified metric context. Use this to visualize metrics that need investigation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "context": {
                    "type": "string",
                    "description": "The metric context to chart (e.g., 'system.cpu', 'disk.io', 'net.eth0')"
                },
                "groupBy": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional grouping dimensions (e.g., ['node', 'instance'])"
                },
                "filterBy": {
                    "type": "object",
                    "description": "Optional filters as key-value pairs (e.g., {'node': ['server1', 'server2']})"
                }
            },
            "required": ["context"]
        }
    })
}

/// Tool: canvas.removeChart
///
/// Removes a specific chart from the canvas by its ID.
fn remove_chart_definition() -> Value {
    json!({
        "name": "canvas.removeChart",
        "description": "Remove a chart from the canvas by its ID. Use this to clean up charts that are no longer needed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chartId": {
                    "type": "string",
                    "description": "The unique ID of the chart to remove"
                }
            },
            "required": ["chartId"]
        }
    })
}

/// Tool: canvas.getCharts
///
/// Returns a list of all charts currently on the canvas.
fn get_charts_definition() -> Value {
    json!({
        "name": "canvas.getCharts",
        "description": "Get a list of all charts currently displayed on the canvas. Returns chart IDs and their configurations.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    })
}

/// Tool: canvas.clearCharts
///
/// Removes all charts from the canvas.
fn clear_charts_definition() -> Value {
    json!({
        "name": "canvas.clearCharts",
        "description": "Remove all charts from the canvas. Use this to start fresh with a clean canvas.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    })
}

/// Tool: canvas.setTimeRange
///
/// Sets the time range for all charts on the canvas.
fn set_time_range_definition() -> Value {
    json!({
        "name": "canvas.setTimeRange",
        "description": "Set the time range for all charts on the canvas. Affects how much historical data is shown.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "range": {
                    "type": "string",
                    "enum": ["5m", "15m", "30m", "1h", "2h", "6h", "12h", "24h", "7d"],
                    "description": "Time range to display"
                }
            },
            "required": ["range"]
        }
    })
}

// =============================================================================
// CanvasTools Implementation
// =============================================================================

/// Parameters for adding a chart to the canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddChartParams {
    /// The metric context to chart (e.g., "system.cpu", "disk.io").
    pub context: String,
    /// Optional grouping dimensions.
    #[serde(default)]
    pub group_by: Option<Vec<String>>,
    /// Optional filters as key-value pairs.
    #[serde(default)]
    pub filter_by: Option<Value>,
}

/// Parameters for removing a chart from the canvas.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveChartParams {
    /// The unique ID of the chart to remove.
    pub chart_id: String,
}

/// Parameters for setting the time range.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTimeRangeParams {
    /// Time range to display.
    pub range: String,
}

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
pub struct CanvasTools {
    /// Worker ID - identifies the worker type.
    worker_id: String,
    /// Space ID - the Netdata space this worker operates in.
    space_id: String,
    /// Room ID - the Netdata room this worker operates in.
    room_id: String,
}

impl CanvasTools {
    /// Create canvas tools bound to a worker's context.
    ///
    /// The tab will be created lazily when the first UI operation is performed.
    pub fn new(worker_id: String, space_id: String, room_id: String) -> Self {
        Self {
            worker_id,
            space_id,
            room_id,
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

    /// Execute a canvas tool method.
    ///
    /// Routes to the appropriate method based on the method name.
    pub async fn execute(&self, method: &str, params: Value) -> Result<String, ToolError> {
        match method {
            "addChart" => {
                let p: AddChartParams = serde_json::from_value(params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?;
                let result = self.add_chart(p).await?;
                serde_json::to_string(&result)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))
            }
            "removeChart" => {
                let p: RemoveChartParams = serde_json::from_value(params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?;
                self.remove_chart(p).await?;
                Ok("Chart removed".to_string())
            }
            "getCharts" => {
                let charts = self.get_charts().await?;
                serde_json::to_string(&charts)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))
            }
            "clearCharts" => {
                self.clear_charts().await?;
                Ok("All charts cleared".to_string())
            }
            "setTimeRange" => {
                let p: SetTimeRangeParams = serde_json::from_value(params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?;
                let range = p.range.clone();
                self.set_time_range(p).await?;
                Ok(format!("Time range set to {}", range))
            }
            _ => Err(ToolError::UnknownMethod(format!("canvas.{}", method))),
        }
    }

    /// Add a chart to the canvas.
    ///
    /// Emits a Tauri event to the frontend which creates the chart.
    async fn add_chart(&self, params: AddChartParams) -> Result<AddChartResult, ToolError> {
        // TODO: Implement via Tauri event to frontend
        // For now, return a placeholder
        let _ = params;
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Remove a chart from the canvas.
    async fn remove_chart(&self, params: RemoveChartParams) -> Result<(), ToolError> {
        let _ = params;
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Get all charts on the canvas.
    async fn get_charts(&self) -> Result<Vec<ChartInfo>, ToolError> {
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Clear all charts from the canvas.
    async fn clear_charts(&self) -> Result<(), ToolError> {
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Set the time range for all charts.
    async fn set_time_range(&self, params: SetTimeRangeParams) -> Result<(), ToolError> {
        let _ = params;
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_count() {
        let tools = tool_definitions();
        assert_eq!(tools.len(), 5);
    }

    #[test]
    fn test_add_chart_definition() {
        let def = add_chart_definition();
        assert_eq!(def["name"], "canvas.addChart");
        assert!(def["inputSchema"]["properties"]["context"].is_object());
        assert!(def["inputSchema"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("context")));
    }

    #[test]
    fn test_remove_chart_definition() {
        let def = remove_chart_definition();
        assert_eq!(def["name"], "canvas.removeChart");
        assert!(def["inputSchema"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("chartId")));
    }

    #[test]
    fn test_get_charts_definition() {
        let def = get_charts_definition();
        assert_eq!(def["name"], "canvas.getCharts");
        assert!(def["inputSchema"]["required"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_clear_charts_definition() {
        let def = clear_charts_definition();
        assert_eq!(def["name"], "canvas.clearCharts");
    }

    #[test]
    fn test_set_time_range_definition() {
        let def = set_time_range_definition();
        assert_eq!(def["name"], "canvas.setTimeRange");
        let range_enum = &def["inputSchema"]["properties"]["range"]["enum"];
        assert!(range_enum.as_array().unwrap().contains(&json!("1h")));
    }

    #[test]
    fn test_all_tools_have_required_fields() {
        for tool in tool_definitions() {
            assert!(tool["name"].is_string(), "Tool missing name");
            assert!(tool["description"].is_string(), "Tool missing description");
            assert!(tool["inputSchema"].is_object(), "Tool missing inputSchema");
        }
    }

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

    #[tokio::test]
    async fn test_execute_unknown_method() {
        let tools = CanvasTools::new(
            "worker-1".to_string(),
            "space-1".to_string(),
            "room-1".to_string(),
        );
        let result = tools.execute("unknownMethod", json!({})).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ToolError::UnknownMethod(_)));
    }
}
