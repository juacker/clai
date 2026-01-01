//! MCP (Model Context Protocol) module for AI worker tools.
//!
//! This module provides the tools that AI workers can use to interact with
//! Netdata Cloud. Tools are exposed via MCP to AI CLIs (Claude, Gemini, Codex).
//!
//! # Architecture
//!
//! ```text
//! Worker AI (claude/gemini/codex)
//!     ↓
//! MCP: netdata_query({ query: "..." })
//!     ↓
//! NetdataQueryTool.execute() - context already bound
//!     ↓
//! AiService.analyze() → Netdata Cloud AI
//!     ↓
//! Plain text response back to Worker AI
//! ```
//!
//! # Context Injection
//!
//! Tools are created with context (space_id, room_id, conversation_id) bound
//! at creation time, not at execution time. This means:
//!
//! - The AI only needs to provide the query parameter
//! - Context is hidden from the AI by design
//! - Tools are pre-configured with their execution scope
//!
//! # Example
//!
//! ```rust,ignore
//! // When worker starts, create tools bound to context
//! let tools = NetdataTools::new(
//!     ai_service,
//!     space_id,
//!     room_id,
//!     conversation_id,
//! );
//!
//! // Later, when AI calls the tool - only query needed
//! let response = tools.query.execute("What anomalies occurred?").await?;
//! ```

pub mod tools;

// Re-export main types for convenience
pub use tools::{NetdataTools, ToolError};
