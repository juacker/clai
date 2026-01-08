//! Netdata query tool implementation.
//!
//! This tool allows AI agents to query Netdata Cloud's AI for analysis
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
//! Returns plain text responses. The agent AI (Claude, Gemini, Codex) can
//! parse and understand text responses perfectly.
//!
//! # Streaming Support
//!
//! When created with a JS bridge, SSE chunks from Netdata are emitted as
//! events to the frontend for real-time display in AgentChat.

use std::sync::{Arc, Mutex};

use serde::Deserialize;

use crate::api::netdata::{ChatCompletionRequest, ChatTool, NetdataApi};
use crate::mcp::bridge::{JsBridge, ToolStreamEvent};

use super::ToolError;

// =============================================================================
// Tool Parameter Types (Single Source of Truth)
// =============================================================================

/// Parameters for netdata.query tool.
///
/// Used by both the MCP server (for schema generation) and internal execution.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[allow(dead_code)] // Fields used via MCP deserialization
pub struct NetdataQueryParams {
    /// Natural language query about your infrastructure.
    /// Examples:
    /// - "What anomalies occurred in the last hour?"
    /// - "Why is CPU high on server web-01?"
    /// - "Show me the top 5 nodes by memory usage"
    #[schemars(description = "Natural language query about your infrastructure")]
    pub query: String,
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
/// The tool is created with space_id and room_id already bound. When the AI
/// calls the tool, it only needs to provide the query - the context is already
/// known.
///
/// # Conversation Continuity
///
/// The tool maintains a conversation across multiple queries within the same
/// agent execution. The `conversation_id` is created on the first query and
/// reused for subsequent queries. Before each query, the tool fetches the
/// current conversation state to get the proper `parent_message_id` for
/// threading (in case users also interact with the conversation via UI).
///
/// When the agent stops and the tool is dropped, the conversation state is
/// lost. The next agent run creates a fresh conversation.
///
/// # Example
///
/// ```rust,ignore
/// let tool = NetdataQueryTool::new(
///     api,
///     "space-123".to_string(),
///     "room-456".to_string(),
/// );
///
/// // First query - creates conversation
/// let response = tool.query("What anomalies occurred?").await?;
///
/// // Second query - continues conversation with context
/// let response = tool.query("Tell me more about the CPU anomaly").await?;
/// ```
pub struct NetdataQueryTool {
    /// The Netdata API client.
    api: Arc<NetdataApi>,

    /// Agent ID for streaming events.
    agent_id: Option<String>,

    /// Space ID - bound at creation time.
    space_id: String,

    /// Room ID - bound at creation time.
    room_id: String,

    /// JS bridge for streaming events (optional).
    bridge: Option<JsBridge>,

    /// Conversation state (created on first query, updated after each query).
    /// Uses Mutex for interior mutability since execute takes &self.
    state: Mutex<ConversationState>,
}

/// Internal state for conversation continuity.
#[derive(Default, Clone)]
#[allow(dead_code)] // Used for conversation tracking
struct ConversationState {
    /// Conversation ID - created on first query, reused for subsequent queries.
    conversation_id: Option<String>,
    /// Current tool call ID for streaming.
    tool_call_id: Option<String>,
}

impl Clone for NetdataQueryTool {
    fn clone(&self) -> Self {
        // When cloning, we create a fresh conversation state.
        // The cloned tool will start a new conversation.
        Self {
            api: self.api.clone(),
            agent_id: self.agent_id.clone(),
            space_id: self.space_id.clone(),
            room_id: self.room_id.clone(),
            bridge: self.bridge.clone(),
            state: Mutex::new(self.state.lock().unwrap().clone()),
        }
    }
}

#[allow(dead_code)] // Methods called via MCP protocol
impl NetdataQueryTool {
    /// Create a new tool bound to a specific space/room context.
    ///
    /// The tool starts with no conversation - one will be created on the first
    /// query. Subsequent queries within the same agent execution will continue
    /// the conversation with proper message threading.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client
    /// * `space_id` - The space ID for context
    /// * `room_id` - The room ID for context
    pub fn new(api: Arc<NetdataApi>, space_id: String, room_id: String) -> Self {
        Self {
            api,
            agent_id: None,
            space_id,
            room_id,
            bridge: None,
            state: Mutex::new(ConversationState::default()),
        }
    }

    /// Create a new tool with JS bridge for streaming events.
    ///
    /// When the bridge is provided, SSE chunks from Netdata queries will be
    /// emitted as streaming events to the frontend, allowing real-time display
    /// in the AgentChat.
    pub fn with_bridge(
        api: Arc<NetdataApi>,
        agent_id: String,
        space_id: String,
        room_id: String,
        bridge: JsBridge,
    ) -> Self {
        Self {
            api,
            agent_id: Some(agent_id),
            space_id,
            room_id,
            bridge: Some(bridge),
            state: Mutex::new(ConversationState::default()),
        }
    }

    /// Execute a query and return a plain text response.
    ///
    /// The query is sent to Netdata Cloud's AI, which has access to all
    /// monitoring data for the bound space/room. The AI analyzes the data
    /// and returns a human-readable response.
    ///
    /// # Conversation Threading
    ///
    /// - First call: Creates a new conversation
    /// - Subsequent calls: Continues the conversation, using `parent_message_id`
    ///   to maintain proper threading
    ///
    /// This allows follow-up questions like "Tell me more about that anomaly"
    /// to work correctly.
    ///
    /// # Arguments
    ///
    /// * `params` - Query parameters containing the natural language query
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
    pub async fn query(&self, params: NetdataQueryParams) -> Result<String, ToolError> {
        let query = &params.query;
        // 1. Get current conversation_id from state
        let conversation_id = {
            let state = self.state.lock().unwrap();
            state.conversation_id.clone()
        };

        // 2. Get or create conversation
        let conversation_id = match conversation_id {
            Some(id) => id,
            None => {
                let conv = self
                    .api
                    .create_conversation(&self.space_id, &self.room_id)
                    .await
                    .map_err(|e| ToolError::ApiError(e.to_string()))?;

                // Create a title for the conversation using the query
                // We ignore errors here since the title is not critical
                let _ = self
                    .api
                    .create_conversation_title(&self.space_id, &self.room_id, &conv.id, query)
                    .await;

                conv.id
            }
        };

        // 3. Fetch conversation to get the current last message ID
        // This is needed because users can also interact with the conversation
        // through the UI, so we can't rely on our cached last_message_id
        let current_conversation = self
            .api
            .get_conversation(&self.space_id, &self.room_id, &conversation_id)
            .await
            .map_err(|e| ToolError::ApiError(e.to_string()))?;

        let parent_message_id = current_conversation.messages.last().map(|m| m.id.clone());

        // 4. Send message via chat completion (SSE streaming, wait for completion)
        // Prefix with [@clai] so the UI can distinguish agent queries from user messages
        // Include "blocks" tool to enable rich visualizations in the stored conversation
        let request = ChatCompletionRequest {
            message: format!("[@clai] {}", query),
            tools: vec![ChatTool {
                name: "blocks".to_string(),
                version: 0,
            }],
            parent_message_id,
        };

        // Generate tool call ID for streaming correlation
        let tool_call_id = uuid::Uuid::new_v4().to_string();

        // Store tool call ID in state
        {
            let mut state = self.state.lock().unwrap();
            state.tool_call_id = Some(tool_call_id.clone());
        }

        // Clone values for closure (if streaming is enabled)
        let bridge_for_stream = self.bridge.clone();
        let agent_id_for_stream = self.agent_id.clone();
        let space_id_for_stream = self.space_id.clone();
        let room_id_for_stream = self.room_id.clone();
        let tool_call_id_for_stream = tool_call_id.clone();

        self.api
            .create_chat_completion(
                &self.space_id,
                &self.room_id,
                &conversation_id,
                request,
                move |chunk| {
                    // Emit streaming event if bridge is available
                    if let Some(ref bridge) = bridge_for_stream {
                        if let Some(ref agent_id) = agent_id_for_stream {
                            // Extract event type from chunk
                            let event_type = chunk
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();

                            // Only emit content-related events
                            if event_type == "content_block_delta"
                                || event_type == "content_block_start"
                                || event_type == "content_block_stop"
                                || event_type == "message_start"
                                || event_type == "message_stop"
                            {
                                let event = ToolStreamEvent {
                                    tool_call_id: tool_call_id_for_stream.clone(),
                                    agent_id: agent_id.clone(),
                                    space_id: space_id_for_stream.clone(),
                                    room_id: room_id_for_stream.clone(),
                                    tool: "netdata.query".to_string(),
                                    event_type,
                                    payload: chunk.clone(),
                                };

                                // Best-effort emit - don't fail the query if emit fails
                                let _ = bridge.emit_stream_event(event);
                            }
                        }
                    }
                },
            )
            .await
            .map_err(|e| ToolError::ApiError(e.to_string()))?;

        // 5. Fetch conversation again to get the complete response
        let conversation = self
            .api
            .get_conversation(&self.space_id, &self.room_id, &conversation_id)
            .await
            .map_err(|e| ToolError::ApiError(e.to_string()))?;

        // 6. Extract response
        let (response, _last_message_id) = extract_response_and_message_id(&conversation.messages)
            .ok_or_else(|| ToolError::ExecutionFailed("No response from AI".to_string()))?;

        // 7. Update state (just conversation_id - we'll fetch fresh last_message_id each time)
        {
            let mut state = self.state.lock().unwrap();
            state.conversation_id = Some(conversation_id);
        }

        Ok(response)
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

use crate::api::netdata::ConversationMessage;

/// Extracts the formatted response and message ID from the last message.
///
/// Expects the last message to be an assistant response. Returns None if:
/// - Messages are empty
/// - Last message is not from assistant (something is off)
///
/// The formatted response includes all content blocks from the assistant message:
/// - Tool calls made by the Netdata AI (tool_use blocks)
/// - Results from those tool calls (tool_result blocks)
/// - Text responses from the AI (text blocks)
///
/// The composite format gives the agent AI full context about what analysis
/// was performed and what data was examined.
#[allow(dead_code)] // Called via MCP protocol
fn extract_response_and_message_id(messages: &[ConversationMessage]) -> Option<(String, String)> {
    // Get the last message - it should be the assistant's response
    let last_message = messages.last()?;

    // Verify it's an assistant message
    if last_message.role != "assistant" {
        // Something is off - the last message should be the assistant's response
        return None;
    }

    let mut parts: Vec<String> = Vec::new();

    for block in &last_message.content {
        match block.content_type.as_str() {
            "tool_use" => {
                // Format tool call with name and input parameters
                if let Some(name) = &block.name {
                    let mut tool_section = format!("## Tool: {}\n", name);

                    if let Some(input) = &block.input {
                        // Pretty print JSON input
                        let input_str = serde_json::to_string_pretty(input)
                            .unwrap_or_else(|_| input.to_string());
                        tool_section.push_str(&format!("Input:\n```json\n{}\n```\n", input_str));
                    }

                    parts.push(tool_section);
                }
            }
            "tool_result" => {
                // Format tool result
                if let Some(text) = &block.text {
                    parts.push(format!("Result:\n{}\n", text));
                }
            }
            "text" => {
                // Format AI response text
                if let Some(text) = &block.text {
                    if !text.trim().is_empty() {
                        parts.push(format!("## Response\n{}\n", text));
                    }
                }
            }
            _ => {
                // Unknown block type - include if it has text
                if let Some(text) = &block.text {
                    parts.push(format!("## {}\n{}\n", block.content_type, text));
                }
            }
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some((parts.join("\n"), last_message.id.clone()))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::netdata::MessageContent;

    fn make_message(id: &str, role: &str, content: Vec<MessageContent>) -> ConversationMessage {
        ConversationMessage {
            id: id.to_string(),
            parent_message_id: None,
            role: role.to_string(),
            content,
            metadata: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: None,
        }
    }

    fn make_content(
        content_type: &str,
        text: Option<&str>,
        name: Option<&str>,
        input: Option<serde_json::Value>,
    ) -> MessageContent {
        MessageContent {
            id: Some("block-1".to_string()),
            content_type: content_type.to_string(),
            text: text.map(|s| s.to_string()),
            name: name.map(|s| s.to_string()),
            input,
        }
    }

    #[test]
    fn test_netdata_query_params_deserialization() {
        let json = serde_json::json!({
            "query": "What anomalies are happening?"
        });

        let params: NetdataQueryParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.query, "What anomalies are happening?");
    }

    #[test]
    fn test_extract_text_only_response() {
        // Last message is assistant with text content
        let messages = vec![make_message(
            "msg-1",
            "assistant",
            vec![make_content(
                "text",
                Some("Everything looks good!"),
                None,
                None,
            )],
        )];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_some());
        let (text, msg_id) = result.unwrap();
        assert!(text.contains("## Response"));
        assert!(text.contains("Everything looks good!"));
        assert_eq!(msg_id, "msg-1");
    }

    #[test]
    fn test_extract_assistant_with_multiple_blocks() {
        // Single assistant message with tool_use, tool_result, and text blocks
        let messages = vec![make_message(
            "msg-1",
            "assistant",
            vec![
                make_content(
                    "tool_use",
                    None,
                    Some("get_nodes"),
                    Some(serde_json::json!({})),
                ),
                make_content("tool_result", Some("Node1, Node2, Node3"), None, None),
                make_content("text", Some("Here are your nodes."), None, None),
            ],
        )];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_some());
        let (text, msg_id) = result.unwrap();

        // Should contain tool call
        assert!(text.contains("## Tool: get_nodes"));
        assert!(text.contains("Input:"));

        // Should contain tool result
        assert!(text.contains("Result:"));
        assert!(text.contains("Node1, Node2, Node3"));

        // Should contain final response
        assert!(text.contains("## Response"));
        assert!(text.contains("Here are your nodes."));

        assert_eq!(msg_id, "msg-1");
    }

    #[test]
    fn test_extract_tool_with_input_params() {
        let messages = vec![make_message(
            "msg-1",
            "assistant",
            vec![make_content(
                "tool_use",
                None,
                Some("search_metrics"),
                Some(serde_json::json!({"similar_to": "memory", "limit": 10})),
            )],
        )];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_some());
        let (text, msg_id) = result.unwrap();

        assert!(text.contains("## Tool: search_metrics"));
        assert!(text.contains("similar_to"));
        assert!(text.contains("memory"));
        assert!(text.contains("limit"));
        assert_eq!(msg_id, "msg-1");
    }

    #[test]
    fn test_extract_fails_if_last_is_user() {
        // Last message is user - should fail
        let messages = vec![make_message(
            "msg-1",
            "user",
            vec![make_content("text", Some("What's up?"), None, None)],
        )];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_empty_messages() {
        let messages: Vec<ConversationMessage> = vec![];
        let result = extract_response_and_message_id(&messages);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_skips_empty_text() {
        let messages = vec![make_message(
            "msg-1",
            "assistant",
            vec![
                make_content("text", Some("   "), None, None), // Whitespace only
                make_content("text", Some("Real response"), None, None),
            ],
        )];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_some());
        let (text, msg_id) = result.unwrap();

        // Should only have one "## Response" section (the non-empty one)
        assert_eq!(text.matches("## Response").count(), 1);
        assert!(text.contains("Real response"));
        assert_eq!(msg_id, "msg-1");
    }

    #[test]
    fn test_extract_returns_last_message_id() {
        // Multiple messages, but we only care about the last one
        let messages = vec![
            make_message(
                "msg-1",
                "user",
                vec![make_content("text", Some("Question"), None, None)],
            ),
            make_message(
                "msg-2",
                "assistant",
                vec![make_content("text", Some("Final answer"), None, None)],
            ),
        ];

        let result = extract_response_and_message_id(&messages);
        assert!(result.is_some());
        let (text, msg_id) = result.unwrap();

        assert!(text.contains("Final answer"));
        assert_eq!(msg_id, "msg-2");
    }
}
