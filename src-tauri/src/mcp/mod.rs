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
//! McpToolServer
//!     ├─→ netdata.*: Execute directly in Rust via API
//!     └─→ canvas.*/tabs.*: Tauri event → Frontend → Result
//! ```
//!
//! # Tool Schema Generation
//!
//! Tool schemas are generated via rmcp's `#[tool]` macro. Parameter types
//! are defined in the tool modules with `schemars::JsonSchema` derive for
//! automatic schema generation.
//!
//! # Context Injection
//!
//! Tools are created with context (space_id, room_id) bound at creation time.
//! The AI only needs to provide tool-specific parameters.
//!
//! # MCP Server
//!
//! The `server` module provides the MCP server implementation that exposes
//! tools to AI CLIs via HTTP transport on localhost. Each worker execution
//! starts its own server on a random port. Use `McpToolServer::with_bridge()`
//! to create a server with JS bridge support for canvas/tabs tools.

pub mod bridge;
pub mod server;
pub mod tools;

// Re-export main types for convenience
pub use bridge::{
    complete_pending_request, pending_request_count, BridgeError, JsBridge, ToolRequest,
    ToolResponse, EVENT_TOOL_REQUEST,
};
pub use server::{McpServerError, McpToolServer};
pub use tools::{CanvasTools, NetdataTools, TabsTools, ToolError, WorkerTools};

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
    fn test_get_available_namespaces() {
        let namespaces = get_available_namespaces();

        assert_eq!(namespaces.len(), 3);
        assert!(namespaces.contains(&"netdata"));
        assert!(namespaces.contains(&"canvas"));
        assert!(namespaces.contains(&"tabs"));
    }
}
