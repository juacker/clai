//! Tabs/Tile tools for AI workers.
//!
//! These tools allow AI workers to manage the tile layout within their tab.
//! They are defined in Rust but execute via JS bridge (Tauri events to the frontend).
//!
//! # Available Tools
//!
//! - `tabs.splitTile` - Split an existing tile to create a new one
//! - `tabs.removeTile` - Remove a tile by ID
//! - `tabs.getTileLayout` - Get the current tile layout structure
//!
//! # Execution
//!
//! These tools don't execute directly in Rust. Instead, they emit Tauri
//! events to the frontend which handles the actual UI manipulation.

use serde::{Deserialize, Serialize};

use super::ToolError;
use crate::mcp::bridge::JsBridge;

// =============================================================================
// Tool Parameter Types (Single Source of Truth)
// =============================================================================

/// Parameters for splitting a tile.
///
/// Used by both the MCP server (for schema generation) and the bridge
/// (for serialization).
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SplitTileParams {
    /// The ID of the tile to split.
    #[schemars(description = "The ID of the tile to split")]
    pub parent_tile_id: String,

    /// How to split: "vertical" (side by side) or "horizontal" (stacked).
    #[schemars(description = "Split type: 'vertical' or 'horizontal'")]
    pub split_type: String,
}

/// Parameters for removing a tile from the tab.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RemoveTileParams {
    /// The unique ID of the tile to remove.
    #[schemars(description = "The unique ID of the tile to remove")]
    pub tile_id: String,
}

/// Result of splitting a tile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Used via MCP tool responses
pub struct SplitTileResult {
    /// The ID of the newly created tile.
    pub tile_id: String,
}

/// A node in the tile tree.
///
/// Tiles are organized as a tree. Each node is either:
/// - A **leaf tile**: Has no children, displays content
/// - A **split container**: Has children arranged vertically or horizontally
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Used via MCP tool responses
pub struct TileNode {
    /// The tile's unique ID.
    pub tile_id: String,

    /// How this tile is split. None for leaf tiles.
    /// - "vertical": Children are arranged side by side
    /// - "horizontal": Children are stacked top to bottom
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_type: Option<String>,

    /// Child tiles. Empty for leaf tiles.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TileNode>,
    // Future: dimensions (width/height percentages)
}

/// Tile layout tree structure.
///
/// Example response:
/// ```json
/// {
///   "root": {
///     "tileId": "tile-1",
///     "splitType": "vertical",
///     "children": [
///       { "tileId": "tile-2" },
///       { "tileId": "tile-3", "splitType": "horizontal", "children": [...] }
///     ]
///   }
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Used via MCP tool responses
pub struct TileLayout {
    /// The root tile node of the tree.
    pub root: TileNode,
}

/// Tabs tools with worker context bound at creation time.
///
/// These tools manipulate the tile layout. They execute via Tauri
/// events to the frontend, which handles the actual UI operations.
///
/// # Context Binding
///
/// The tool is created with worker context (worker_id, space_id, room_id).
/// When a tabs tool is called, the frontend will:
/// 1. Find or create a tab owned by this worker
/// 2. Execute the operation on that tab's layout
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
#[allow(dead_code)] // Fields and methods used via MCP
pub struct TabsTools {
    /// Worker ID - identifies the worker type.
    worker_id: String,
    /// Space ID - the Netdata space this worker operates in.
    space_id: String,
    /// Room ID - the Netdata room this worker operates in.
    room_id: String,
    /// JS bridge for tool execution (optional for testing).
    bridge: Option<JsBridge>,
}

#[allow(dead_code)] // Methods called via MCP protocol
impl TabsTools {
    /// Create tabs tools bound to a worker's context (without bridge).
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

    /// Create tabs tools with a JS bridge for actual execution.
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

    /// Get a reference to the bridge (if available).
    fn bridge(&self) -> Result<&JsBridge, ToolError> {
        self.bridge
            .as_ref()
            .ok_or_else(|| ToolError::ExecutionFailed("JS bridge not available".to_string()))
    }

    /// Split a tile to create a new one.
    ///
    /// Calls the JS bridge to split the tile in the frontend.
    pub async fn split_tile(&self, params: SplitTileParams) -> Result<SplitTileResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "tabs.splitTile",
                serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        serde_json::from_value(result).map_err(|e| ToolError::ExecutionFailed(e.to_string()))
    }

    /// Remove a tile from the tab.
    pub async fn remove_tile(&self, params: RemoveTileParams) -> Result<(), ToolError> {
        let bridge = self.bridge()?;
        bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "tabs.removeTile",
                serde_json::to_value(&params).map_err(|e| ToolError::InvalidParams(e.to_string()))?,
            )
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
        Ok(())
    }

    /// Get the current tile layout.
    pub async fn get_tile_layout(&self) -> Result<TileLayout, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.worker_id,
                &self.space_id,
                &self.room_id,
                "tabs.getTileLayout",
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
    fn test_tabs_tools_creation() {
        // Just verify construction succeeds
        let _tools = TabsTools::new(
            "anomaly_investigator".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
    }

    #[test]
    fn test_split_tile_params_vertical() {
        let json = json!({
            "parentTileId": "tile-123",
            "splitType": "vertical"
        });

        let params: SplitTileParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.parent_tile_id, "tile-123");
        assert_eq!(params.split_type, "vertical");
    }

    #[test]
    fn test_split_tile_params_horizontal() {
        let json = json!({
            "parentTileId": "tile-456",
            "splitType": "horizontal"
        });

        let params: SplitTileParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.parent_tile_id, "tile-456");
        assert_eq!(params.split_type, "horizontal");
    }

    #[test]
    fn test_remove_tile_params() {
        let json = json!({
            "tileId": "tile-789"
        });

        let params: RemoveTileParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.tile_id, "tile-789");
    }

}
