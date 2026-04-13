//! MCP (Model Context Protocol) module for AI agent tools.
//!
//! This module provides the tools that AI agents can use to interact with
//! Netdata Cloud and the UI. Tools are exposed via MCP to AI CLIs.
//!
//! # Tool Types
//!
//! - **Workspace-backed / JS-bridge** (`workspace.*`): Defined in Rust and
//!   executed via workspace file APIs or the frontend bridge
//!
//! # Architecture
//!
//! ```text
//! Agent AI (claude/gemini/codex)
//!     ↓
//! MCP: tool_name({ params })
//!     ↓
//! McpToolServer
//!     └─→ workspace.*: Tauri / workspace bridge → Frontend → Result
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
//! tools to AI CLIs via HTTP transport on localhost. Each agent execution
//! starts its own server on a random port. Use `McpToolServer::with_bridge()`
//! to create a server with workspace bridge support.

pub mod bridge;
pub mod client;
pub mod server;
pub mod tools;

// Re-export types used by commands/bridge.rs
pub use bridge::{complete_pending_request, ToolResponse};
