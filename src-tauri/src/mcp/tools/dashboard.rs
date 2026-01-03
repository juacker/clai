//! Dashboard tools for AI agents.
//!
//! These tools allow AI agents to manipulate charts and visualizations
//! on the dashboard. They are defined in Rust but execute via JS bridge
//! (Tauri events to the frontend).
//!
//! # Available Tools
//!
//! - `dashboard.addChart` - Add a metric chart to the dashboard
//! - `dashboard.removeChart` - Remove a chart by ID
//! - `dashboard.getCharts` - List all charts on the dashboard
//! - `dashboard.clearCharts` - Remove all charts
//! - `dashboard.setTimeRange` - Set the time range for all charts
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

/// Parameters for adding a chart to the dashboard.
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

/// Parameters for removing a chart from the dashboard.
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
#[allow(dead_code)] // Used via MCP tool responses
pub struct AddChartResult {
    /// The ID of the newly created chart.
    pub chart_id: String,
}

/// Information about a chart on the dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Used via MCP tool responses
pub struct ChartInfo {
    /// The chart's unique ID.
    pub chart_id: String,
    /// The metric context being displayed.
    pub context: String,
}

/// Dashboard tools with agent context bound at creation time.
///
/// These tools manipulate charts on the dashboard. They execute via Tauri
/// events to the frontend, which handles the actual UI operations.
///
/// # Context Binding
///
/// The tool is created with agent context (agent_id, space_id, room_id).
/// When a dashboard tool is called, the frontend will:
/// 1. Find or create a tab owned by this agent
/// 2. Execute the operation on that tab's dashboard
///
/// This allows lazy tab creation - agents only get a tab when they
/// actually need to display something.
///
/// # Tab Ownership
///
/// Each agent can own at most one tab. The tab is identified by:
/// - agent_id: The type of agent (e.g., "anomaly_investigator")
/// - space_id: The Netdata space
/// - room_id: The Netdata room
///
/// # Bridge
///
/// The optional `JsBridge` enables actual tool execution. If not provided
/// (e.g., in tests), tools will return an error indicating the bridge
/// is not available.
#[derive(Clone)]
#[allow(dead_code)] // Fields and methods used via MCP
pub struct DashboardTools {
    /// Agent ID - identifies the agent type.
    agent_id: String,
    /// Space ID - the Netdata space this agent operates in.
    space_id: String,
    /// Room ID - the Netdata room this agent operates in.
    room_id: String,
    /// JS bridge for tool execution (optional for testing).
    bridge: Option<JsBridge>,
}

#[allow(dead_code)] // Methods called via MCP protocol
impl DashboardTools {
    /// Create dashboard tools bound to an agent's context (without bridge).
    ///
    /// This constructor creates tools without a JS bridge, useful for testing.
    /// Tools will return an error when executed.
    pub fn new(agent_id: String, space_id: String, room_id: String) -> Self {
        Self {
            agent_id,
            space_id,
            room_id,
            bridge: None,
        }
    }

    /// Create dashboard tools with a JS bridge for actual execution.
    ///
    /// The tab will be created lazily when the first UI operation is performed.
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

    /// Add a chart to the dashboard.
    ///
    /// Calls the JS bridge to create the chart in the frontend.
    pub async fn add_chart(&self, params: AddChartParams) -> Result<AddChartResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "dashboard.addChart",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Remove a chart from the dashboard.
    pub async fn remove_chart(&self, params: RemoveChartParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "dashboard.removeChart",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Get all charts on the dashboard.
    pub async fn get_charts(&self) -> Result<Vec<ChartInfo>, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "dashboard.getCharts",
                serde_json::json!({}),
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Clear all charts from the dashboard.
    pub async fn clear_charts(&self) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "dashboard.clearCharts",
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
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "dashboard.setTimeRange",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
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
    fn test_dashboard_tools_creation() {
        // Just verify construction succeeds
        let _tools = DashboardTools::new(
            "anomaly_investigator".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
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
