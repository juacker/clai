//! Netdata query tool implementation.
//!
//! This tool allows AI workers to query Netdata Cloud's AI for analysis
//! of metrics, alerts, anomalies, and infrastructure health.
//!
//! # Design
//!
//! The tool is bound to a specific execution context (space_id, room_id) at
//! creation time. This means:
//!
//! - The AI only provides the query parameter
//! - Context is hidden from the AI
//! - The tool knows its scope from construction
//!
//! # Response Format
//!
//! Returns plain text responses. The worker AI (Claude, Gemini, Codex) can
//! parse and understand text responses perfectly.

use std::sync::Arc;

use serde_json::json;

use crate::api::ai::{AiService, AnalyzeParams};

use super::ToolError;

// =============================================================================
// Tool Definition
// =============================================================================

/// Returns the MCP-compatible tool definition for `netdata_query`.
///
/// This definition is used when generating the MCP configuration for AI CLIs.
/// The tool accepts a single `query` parameter and returns plain text.
pub fn tool_definition() -> serde_json::Value {
    json!({
        "name": "netdata.query",
        "description": "Query Netdata Cloud AI for analysis of metrics, alerts, anomalies, and infrastructure health. Returns a text response with the analysis. The AI has access to all monitoring data and can answer questions, investigate issues, and provide recommendations.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language query about your infrastructure (e.g., 'What anomalies occurred in the last hour?', 'Why is CPU high on server X?', 'Show me disk usage trends')"
                }
            },
            "required": ["query"]
        }
    })
}

// =============================================================================
// NetdataQueryTool
// =============================================================================

/// Netdata query tool with context bound at creation time.
///
/// This tool uses Netdata Cloud's AI to analyze monitoring data and answer
/// questions about infrastructure health, anomalies, alerts, and trends.
///
/// # Context Binding
///
/// The tool is created with space_id, room_id, and optionally conversation_id
/// already bound. When the AI calls the tool, it only needs to provide the
/// query - the context is already known.
///
/// # Conversation Continuity
///
/// If a conversation_id is provided, queries will continue in that conversation,
/// allowing the AI to maintain context across multiple queries. The tool can
/// also update its conversation_id after queries to enable this continuity.
///
/// # Example
///
/// ```rust,ignore
/// let tool = NetdataQueryTool::new(
///     ai_service,
///     "space-123".to_string(),
///     "room-456".to_string(),
///     None,  // New conversation
/// );
///
/// // Execute a query
/// let response = tool.execute("What anomalies occurred in the last hour?").await?;
/// println!("{}", response);  // Plain text analysis
/// ```
pub struct NetdataQueryTool {
    /// The AI service for chat completion.
    ai_service: Arc<AiService>,

    /// Space ID - bound at creation time.
    space_id: String,

    /// Room ID - bound at creation time.
    room_id: String,

    /// Optional conversation ID for continuing conversations.
    conversation_id: Option<String>,
}

impl NetdataQueryTool {
    /// Create a new tool bound to a specific space/room context.
    ///
    /// # Arguments
    ///
    /// * `ai_service` - The AI service for chat completion
    /// * `space_id` - The space ID for context
    /// * `room_id` - The room ID for context
    /// * `conversation_id` - Optional conversation ID for continuing conversations
    pub fn new(
        ai_service: Arc<AiService>,
        space_id: String,
        room_id: String,
        conversation_id: Option<String>,
    ) -> Self {
        Self {
            ai_service,
            space_id,
            room_id,
            conversation_id,
        }
    }

    /// Execute a query and return a plain text response.
    ///
    /// The query is sent to Netdata Cloud's AI, which has access to all
    /// monitoring data for the bound space/room. The AI analyzes the data
    /// and returns a human-readable response.
    ///
    /// # Arguments
    ///
    /// * `query` - Natural language query about the infrastructure
    ///
    /// # Returns
    ///
    /// Plain text response from Netdata Cloud's AI, or an error.
    ///
    /// # Example Queries
    ///
    /// - "What anomalies occurred in the last hour?"
    /// - "Why is CPU high on server web-01?"
    /// - "Show me the top 5 nodes by memory usage"
    /// - "Are there any alerts I should be concerned about?"
    /// - "Explain the disk usage trend for the database cluster"
    pub async fn execute(&self, query: &str) -> Result<String, ToolError> {
        let params = AnalyzeParams {
            space_id: self.space_id.clone(),
            room_id: self.room_id.clone(),
            prompt: query.to_string(),
            response_schema: None, // Plain text, no JSON schema
            conversation_id: self.conversation_id.clone(),
            parent_message_id: None,
        };

        let result = self
            .ai_service
            .analyze(params)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        // Return plain text response
        Ok(result.raw_response)
    }

    /// Get the current conversation ID.
    ///
    /// Returns the conversation ID if one was set, either at creation
    /// or via `set_conversation_id`.
    pub fn conversation_id(&self) -> Option<&str> {
        self.conversation_id.as_deref()
    }

    /// Update the conversation ID for continuing conversations.
    ///
    /// Call this after a query to store the conversation ID from the
    /// response, enabling conversation continuity across multiple queries.
    pub fn set_conversation_id(&mut self, id: String) {
        self.conversation_id = Some(id);
    }

    /// Get the bound space ID.
    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    /// Get the bound room ID.
    pub fn room_id(&self) -> &str {
        &self.room_id
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definition_schema() {
        let def = tool_definition();

        // Check name uses dot notation
        assert_eq!(def["name"], "netdata.query");

        // Check description exists
        assert!(def["description"].as_str().is_some());

        // Check input schema
        let schema = &def["inputSchema"];
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["query"].is_object());
        assert_eq!(schema["required"][0], "query");
    }

    #[test]
    fn test_tool_definition_query_property() {
        let def = tool_definition();
        let query_prop = &def["inputSchema"]["properties"]["query"];

        assert_eq!(query_prop["type"], "string");
        assert!(query_prop["description"].as_str().is_some());
    }
}
