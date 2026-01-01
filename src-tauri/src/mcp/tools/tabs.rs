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
use serde_json::{json, Value};

use super::ToolError;

/// Returns all tabs tool definitions in MCP-compatible format.
///
/// These tools manipulate the tile layout in the UI. When called,
/// they will be routed to the frontend via Tauri events.
pub fn tool_definitions() -> Vec<Value> {
    vec![
        split_tile_definition(),
        remove_tile_definition(),
        get_tile_layout_definition(),
    ]
}

/// Tool: tabs.splitTile
///
/// Splits an existing tile to create a new one.
fn split_tile_definition() -> Value {
    json!({
        "name": "tabs.splitTile",
        "description": "Split an existing tile to create a new tile. The parent tile will be divided either vertically (side by side) or horizontally (stacked).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "parentTileId": {
                    "type": "string",
                    "description": "The ID of the tile to split. The new tile will be created alongside this tile."
                },
                "splitType": {
                    "type": "string",
                    "enum": ["vertical", "horizontal"],
                    "description": "How to split the tile. 'vertical' creates tiles side by side, 'horizontal' creates tiles stacked."
                }
            },
            "required": ["parentTileId", "splitType"]
        }
    })
}

/// Tool: tabs.removeTile
///
/// Removes a specific tile from the current tab by its ID.
fn remove_tile_definition() -> Value {
    json!({
        "name": "tabs.removeTile",
        "description": "Remove a tile from the current tab.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tileId": {
                    "type": "string",
                    "description": "The unique ID of the tile to remove"
                }
            },
            "required": ["tileId"]
        }
    })
}

/// Tool: tabs.getTileLayout
///
/// Returns the current tile layout structure for the tab.
fn get_tile_layout_definition() -> Value {
    json!({
        "name": "tabs.getTileLayout",
        "description": "Get the current tile layout structure. Returns information about all tiles and their arrangement.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    })
}

// =============================================================================
// TabsTools Implementation
// =============================================================================

/// Parameters for splitting a tile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitTileParams {
    /// The ID of the tile to split.
    pub parent_tile_id: String,
    /// How to split: "vertical" or "horizontal".
    pub split_type: String,
}

/// Parameters for removing a tile from the tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveTileParams {
    /// The unique ID of the tile to remove.
    pub tile_id: String,
}

/// Result of splitting a tile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
pub struct TabsTools {
    /// Worker ID - identifies the worker type.
    worker_id: String,
    /// Space ID - the Netdata space this worker operates in.
    space_id: String,
    /// Room ID - the Netdata room this worker operates in.
    room_id: String,
}

impl TabsTools {
    /// Create tabs tools bound to a worker's context.
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

    /// Execute a tabs tool method.
    ///
    /// Routes to the appropriate method based on the method name.
    pub async fn execute(&self, method: &str, params: Value) -> Result<String, ToolError> {
        match method {
            "splitTile" => {
                let p: SplitTileParams = serde_json::from_value(params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?;
                let result = self.split_tile(p).await?;
                serde_json::to_string(&result)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))
            }
            "removeTile" => {
                let p: RemoveTileParams = serde_json::from_value(params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?;
                self.remove_tile(p).await?;
                Ok("Tile removed".to_string())
            }
            "getTileLayout" => {
                let layout = self.get_tile_layout().await?;
                serde_json::to_string(&layout)
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))
            }
            _ => Err(ToolError::UnknownMethod(format!("tabs.{}", method))),
        }
    }

    /// Split a tile to create a new one.
    ///
    /// Emits a Tauri event to the frontend which splits the tile.
    async fn split_tile(&self, params: SplitTileParams) -> Result<SplitTileResult, ToolError> {
        // TODO: Implement via Tauri event to frontend
        let _ = params;
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Remove a tile from the tab.
    async fn remove_tile(&self, params: RemoveTileParams) -> Result<(), ToolError> {
        let _ = params;
        Err(ToolError::ExecutionFailed(
            "JS bridge not yet implemented (Phase 6)".to_string(),
        ))
    }

    /// Get the current tile layout.
    async fn get_tile_layout(&self) -> Result<TileLayout, ToolError> {
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
        assert_eq!(tools.len(), 3);
    }

    #[test]
    fn test_split_tile_definition() {
        let def = split_tile_definition();
        assert_eq!(def["name"], "tabs.splitTile");
        assert!(def["inputSchema"]["properties"]["parentTileId"].is_object());
        assert!(def["inputSchema"]["properties"]["splitType"].is_object());

        let required = def["inputSchema"]["required"].as_array().unwrap();
        assert!(required.contains(&json!("parentTileId")));
        assert!(required.contains(&json!("splitType")));
    }

    #[test]
    fn test_split_tile_split_type_enum() {
        let def = split_tile_definition();
        let split_enum = &def["inputSchema"]["properties"]["splitType"]["enum"];
        let splits = split_enum.as_array().unwrap();
        assert!(splits.contains(&json!("vertical")));
        assert!(splits.contains(&json!("horizontal")));
        assert_eq!(splits.len(), 2);
    }

    #[test]
    fn test_remove_tile_definition() {
        let def = remove_tile_definition();
        assert_eq!(def["name"], "tabs.removeTile");
        assert!(def["inputSchema"]["required"]
            .as_array()
            .unwrap()
            .contains(&json!("tileId")));
    }

    #[test]
    fn test_get_tile_layout_definition() {
        let def = get_tile_layout_definition();
        assert_eq!(def["name"], "tabs.getTileLayout");
        assert!(def["inputSchema"]["required"].as_array().unwrap().is_empty());
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
    fn test_tabs_tools_creation() {
        let tools = TabsTools::new(
            "anomaly_investigator".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
        assert_eq!(tools.worker_id(), "anomaly_investigator");
        assert_eq!(tools.space_id(), "space-123");
        assert_eq!(tools.room_id(), "room-456");
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

    #[tokio::test]
    async fn test_execute_unknown_method() {
        let tools = TabsTools::new(
            "worker-1".to_string(),
            "space-1".to_string(),
            "room-1".to_string(),
        );
        let result = tools.execute("unknownMethod", json!({})).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ToolError::UnknownMethod(_)));
    }
}
