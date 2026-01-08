//! Chat tools for AI agents.
//!
//! These tools allow AI agents to send messages to the user through the
//! AgentChat UI. They are defined in Rust but execute via JS bridge.
//!
//! # Available Tools
//!
//! - `chat.message` - Send a text message to the user

use serde::{Deserialize, Serialize};

use super::ToolError;
use crate::mcp::bridge::JsBridge;

// =============================================================================
// Tool Parameter Types
// =============================================================================

/// Parameters for sending a chat message.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageParams {
    /// The message content (supports markdown).
    #[schemars(description = "Message content to display (supports markdown)")]
    pub message: String,

    /// Optional message type for styling.
    #[schemars(description = "Message type: info, question, result, error (default: info)")]
    #[serde(default)]
    pub message_type: Option<String>,
}

// =============================================================================
// Result Types
// =============================================================================

/// Result of sending a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResult {
    /// Whether the message was displayed.
    pub success: bool,
}

// =============================================================================
// Chat Tools
// =============================================================================

/// Chat tools with agent context bound at creation time.
///
/// These tools allow agents to communicate text messages to users.
/// They execute via Tauri events to the frontend.
#[derive(Clone)]
#[allow(dead_code)]
pub struct ChatTools {
    /// Agent ID - identifies the agent type.
    agent_id: String,
    /// Space ID - the Netdata space this agent operates in.
    space_id: String,
    /// Room ID - the Netdata room this agent operates in.
    room_id: String,
    /// JS bridge for tool execution (optional for testing).
    bridge: Option<JsBridge>,
}

#[allow(dead_code)]
impl ChatTools {
    /// Create chat tools bound to an agent's context (without bridge).
    pub fn new(agent_id: String, space_id: String, room_id: String) -> Self {
        Self {
            agent_id,
            space_id,
            room_id,
            bridge: None,
        }
    }

    /// Create chat tools with a JS bridge for actual execution.
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

    /// Send a message to the user.
    pub async fn send_message(
        &self,
        params: SendMessageParams,
    ) -> Result<SendMessageResult, ToolError> {
        let bridge = self.bridge()?;
        let result = bridge
            .call_tool(
                &self.agent_id,
                &self.space_id,
                &self.room_id,
                "chat.message",
                serde_json::to_value(&params)
                    .map_err(|e| ToolError::InvalidParams(e.to_string()))?,
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
    fn test_chat_tools_creation() {
        let _tools = ChatTools::new(
            "test_agent".to_string(),
            "space-123".to_string(),
            "room-456".to_string(),
        );
    }

    #[test]
    fn test_send_message_params() {
        let json = json!({
            "message": "Hello, this is a test message!",
            "messageType": "info"
        });

        let params: SendMessageParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.message, "Hello, this is a test message!");
        assert_eq!(params.message_type, Some("info".to_string()));
    }

    #[test]
    fn test_send_message_params_minimal() {
        let json = json!({
            "message": "Just the message"
        });

        let params: SendMessageParams = serde_json::from_value(json).unwrap();
        assert_eq!(params.message, "Just the message");
        assert_eq!(params.message_type, None);
    }
}
