//! MCP (Model Context Protocol) module for AI worker tools.
//!
//! This module provides the tools that AI workers can use to interact with
//! Netdata Cloud and the UI. Tools are exposed via MCP to AI CLIs.
//!
//! # Tool Types
//!
//! - **Rust-native** (`netdata.*`): Execute directly in Rust
//! - **JS-bridge** (`canvas.*`, `tabs.*`): Defined in Rust, execute via Tauri events
//!
//! # Architecture
//!
//! ```text
//! Worker AI (claude/gemini/codex)
//!     ↓
//! MCP: tool_name({ params })
//!     ↓
//! Tool Router
//!     ├─→ netdata.*: Execute directly in Rust
//!     └─→ canvas.*/tabs.*: Tauri event → Frontend → Result
//! ```
//!
//! # Tool Definitions
//!
//! All tool definitions are static and defined in Rust. Workers request
//! tools by namespace, and the definitions are collected at compile time.
//!
//! ```rust,ignore
//! // Get tools for a worker that needs netdata and canvas
//! let tools = collect_tools_for_dependencies(&["netdata", "canvas"]);
//! ```
//!
//! # Context Injection
//!
//! Tools are created with context (space_id, room_id) bound at creation time.
//! The AI only needs to provide tool-specific parameters.

pub mod tools;

// Re-export main types for convenience
pub use tools::{CanvasTools, NetdataTools, TabsTools, ToolError, WorkerTools};

// =============================================================================
// Tool Collection
// =============================================================================

/// Collect all tool definitions for a set of namespace dependencies.
///
/// All tools are statically defined in Rust. This function collects the
/// definitions for the requested namespaces.
///
/// # Arguments
///
/// * `dependencies` - List of namespace names (e.g., ["netdata", "canvas", "tabs"])
///
/// # Returns
///
/// All tool definitions from matching namespaces, in MCP-compatible format.
///
/// # Example
///
/// ```rust,ignore
/// // Worker needs netdata and canvas tools
/// let tools = collect_tools_for_dependencies(&["netdata", "canvas"]);
/// // Returns: [netdata.query, canvas.addChart, canvas.removeChart, ...]
/// ```
pub fn collect_tools_for_dependencies(dependencies: &[&str]) -> Vec<serde_json::Value> {
    let mut all_tools = Vec::new();

    for namespace in dependencies {
        match *namespace {
            "netdata" => {
                all_tools.extend(NetdataTools::tool_definitions());
            }
            "canvas" => {
                all_tools.extend(tools::canvas::tool_definitions());
            }
            "tabs" => {
                all_tools.extend(tools::tabs::tool_definitions());
            }
            // Unknown namespaces are silently ignored
            _ => {}
        }
    }

    all_tools
}

/// Get all available tool definitions.
///
/// Returns all tools from all namespaces. Used for debugging or listing.
pub fn get_all_tool_definitions() -> Vec<serde_json::Value> {
    let mut all_tools = Vec::new();

    // netdata.* tools
    all_tools.extend(NetdataTools::tool_definitions());

    // canvas.* tools
    all_tools.extend(tools::canvas::tool_definitions());

    // tabs.* tools
    all_tools.extend(tools::tabs::tool_definitions());

    all_tools
}

/// Get all available namespace names.
pub fn get_available_namespaces() -> Vec<&'static str> {
    vec!["netdata", "canvas", "tabs"]
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collect_netdata_tools() {
        let tools = collect_tools_for_dependencies(&["netdata"]);

        assert!(!tools.is_empty());
        assert!(tools.iter().any(|t| t["name"] == "netdata.query"));
    }

    #[test]
    fn test_collect_canvas_tools() {
        let tools = collect_tools_for_dependencies(&["canvas"]);

        assert_eq!(tools.len(), 5);
        assert!(tools.iter().any(|t| t["name"] == "canvas.addChart"));
        assert!(tools.iter().any(|t| t["name"] == "canvas.removeChart"));
        assert!(tools.iter().any(|t| t["name"] == "canvas.getCharts"));
        assert!(tools.iter().any(|t| t["name"] == "canvas.clearCharts"));
        assert!(tools.iter().any(|t| t["name"] == "canvas.setTimeRange"));
    }

    #[test]
    fn test_collect_tabs_tools() {
        let tools = collect_tools_for_dependencies(&["tabs"]);

        assert_eq!(tools.len(), 3);
        assert!(tools.iter().any(|t| t["name"] == "tabs.splitTile"));
        assert!(tools.iter().any(|t| t["name"] == "tabs.removeTile"));
        assert!(tools.iter().any(|t| t["name"] == "tabs.getTileLayout"));
    }

    #[test]
    fn test_collect_mixed_dependencies() {
        let tools = collect_tools_for_dependencies(&["netdata", "canvas"]);

        // Should have netdata.query + 5 canvas tools
        assert!(tools.iter().any(|t| t["name"] == "netdata.query"));
        assert!(tools.iter().any(|t| t["name"] == "canvas.addChart"));
    }

    #[test]
    fn test_collect_all_dependencies() {
        let tools = collect_tools_for_dependencies(&["netdata", "canvas", "tabs"]);

        // netdata: 1, canvas: 5, tabs: 3 = 9 total
        assert_eq!(tools.len(), 9);
    }

    #[test]
    fn test_collect_unknown_namespace() {
        let tools = collect_tools_for_dependencies(&["unknown_namespace"]);
        assert!(tools.is_empty());
    }

    #[test]
    fn test_get_all_tool_definitions() {
        let all_tools = get_all_tool_definitions();

        // Should have all tools: netdata (1) + canvas (5) + tabs (3) = 9
        assert_eq!(all_tools.len(), 9);
        assert!(all_tools.iter().any(|t| t["name"] == "netdata.query"));
        assert!(all_tools.iter().any(|t| t["name"] == "canvas.addChart"));
        assert!(all_tools.iter().any(|t| t["name"] == "tabs.splitTile"));
    }

    #[test]
    fn test_get_available_namespaces() {
        let namespaces = get_available_namespaces();

        assert_eq!(namespaces.len(), 3);
        assert!(namespaces.contains(&"netdata"));
        assert!(namespaces.contains(&"canvas"));
        assert!(namespaces.contains(&"tabs"));
    }
}
