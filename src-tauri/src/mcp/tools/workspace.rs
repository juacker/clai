//! Workspace artifact tools for AI agents.
//!
//! These tools operate on durable workspace artifacts directly instead of going
//! through tab/tile command state. They execute via the JS bridge so the
//! frontend can reuse the existing workspace commands and file APIs.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::ToolError;
use crate::mcp::bridge::JsBridge;

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListArtifactsParams {
    /// Optional viewer/type filter (e.g. "canvas", "dashboard", "markdown", "json", "text").
    #[serde(default)]
    pub viewer: Option<String>,

    /// Optional path prefix filter within the workspace.
    #[serde(default)]
    pub path_prefix: Option<String>,

    /// Maximum number of artifacts to return.
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadArtifactParams {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCanvasArtifactParams {
    #[serde(default)]
    pub path: Option<String>,
    pub canvas: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCanvasArtifactParams {
    pub path: String,
    pub canvas: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDashboardArtifactParams {
    #[serde(default)]
    pub path: Option<String>,
    pub dashboard: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDashboardArtifactParams {
    pub path: String,
    pub dashboard: Value,
}

#[derive(Clone)]
#[allow(dead_code)]
pub struct WorkspaceTools {
    agent_id: String,
    space_id: String,
    room_id: String,
    bridge: Option<JsBridge>,
}

#[allow(dead_code)]
impl WorkspaceTools {
    pub fn new(agent_id: String, space_id: String, room_id: String) -> Self {
        Self {
            agent_id,
            space_id,
            room_id,
            bridge: None,
        }
    }

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

    fn bridge(&self) -> Result<&JsBridge, ToolError> {
        self.bridge
            .as_ref()
            .ok_or_else(|| ToolError::ExecutionFailed("JS bridge not available".to_string()))
    }

    async fn call(&self, tool: &str, params: Value) -> Result<Value, ToolError> {
        self.bridge()?
            .call_tool(&self.agent_id, &self.space_id, &self.room_id, tool, params)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    pub async fn list_artifacts(&self, params: ListArtifactsParams) -> Result<Value, ToolError> {
        self.call(
            "workspace.listArtifacts",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }

    pub async fn read_artifact(&self, params: ReadArtifactParams) -> Result<Value, ToolError> {
        self.call(
            "workspace.readArtifact",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }

    pub async fn create_canvas(
        &self,
        params: CreateCanvasArtifactParams,
    ) -> Result<Value, ToolError> {
        self.call(
            "workspace.createCanvas",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }

    pub async fn update_canvas(
        &self,
        params: UpdateCanvasArtifactParams,
    ) -> Result<Value, ToolError> {
        self.call(
            "workspace.updateCanvas",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }

    pub async fn create_dashboard(
        &self,
        params: CreateDashboardArtifactParams,
    ) -> Result<Value, ToolError> {
        self.call(
            "workspace.createDashboard",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }

    pub async fn update_dashboard(
        &self,
        params: UpdateDashboardArtifactParams,
    ) -> Result<Value, ToolError> {
        self.call(
            "workspace.updateDashboard",
            serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_workspace_tools_creation() {
        let _tools = WorkspaceTools::new(
            "anomaly_investigator".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
    }

    #[test]
    fn test_create_canvas_params() {
        let params: CreateCanvasArtifactParams = serde_json::from_value(json!({
            "path": "visualizations/system.canvas",
            "canvas": { "nodes": [], "edges": [] }
        }))
        .unwrap();

        assert_eq!(params.path.as_deref(), Some("visualizations/system.canvas"));
        assert!(params.canvas.is_object());
    }

    #[test]
    fn test_update_dashboard_params() {
        let params: UpdateDashboardArtifactParams = serde_json::from_value(json!({
            "path": "visualizations/health.dashboard.json",
            "dashboard": { "elements": [], "timeRange": "1h" }
        }))
        .unwrap();

        assert_eq!(params.path, "visualizations/health.dashboard.json");
        assert!(params.dashboard.is_object());
    }
}
