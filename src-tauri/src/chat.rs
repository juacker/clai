use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// Represents a message content block (text, tool_use, or tool_result)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: Vec<ToolResultContent>,
    },
}

/// Tool result content can be text or other types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolResultContent {
    Text { text: String },
}

/// Represents a single message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: String, // "user" or "assistant"
    pub content: Vec<ContentBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
    pub created_at: String,
}

/// Represents a conversation with its messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub messages: Vec<Message>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request to create a new conversation
#[derive(Debug, Deserialize)]
pub struct CreateConversationRequest {
    #[serde(default)]
    pub title: String,
}

/// Request to send a message in a conversation
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
}

/// Request to update conversation title
#[derive(Debug, Deserialize)]
pub struct UpdateTitleRequest {
    pub message_content: String,
}

/// Response for title update
#[derive(Debug, Serialize)]
pub struct TitleResponse {
    pub title: String,
}

/// In-memory chat storage (will be replaced with real persistence later)
pub struct ChatStorage {
    pub conversations: Mutex<Vec<Conversation>>,
}

impl ChatStorage {
    pub fn new() -> Self {
        Self {
            conversations: Mutex::new(Vec::new()),
        }
    }
}

/// List all conversations
#[tauri::command]
pub async fn list_chats(storage: State<'_, ChatStorage>) -> Result<Vec<Conversation>, String> {
    let conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    Ok(conversations.clone())
}

/// Get a specific conversation by ID
#[tauri::command]
pub async fn get_chat(
    conversation_id: String,
    storage: State<'_, ChatStorage>,
) -> Result<Conversation, String> {
    let conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    conversations
        .iter()
        .find(|c| c.id == conversation_id)
        .cloned()
        .ok_or_else(|| format!("Conversation not found: {}", conversation_id))
}

/// Create a new conversation
#[tauri::command]
pub async fn create_chat(
    request: CreateConversationRequest,
    storage: State<'_, ChatStorage>,
) -> Result<Conversation, String> {
    let mut conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let conversation = Conversation {
        id: uuid::Uuid::new_v4().to_string(),
        title: if request.title.is_empty() {
            format!("Chat {}", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S"))
        } else {
            request.title
        },
        messages: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    conversations.push(conversation.clone());
    Ok(conversation)
}

/// Delete a conversation
#[tauri::command]
pub async fn delete_chat(
    conversation_id: String,
    storage: State<'_, ChatStorage>,
) -> Result<(), String> {
    let mut conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    let index = conversations
        .iter()
        .position(|c| c.id == conversation_id)
        .ok_or_else(|| format!("Conversation not found: {}", conversation_id))?;

    conversations.remove(index);
    Ok(())
}

/// Update conversation title based on message content
#[tauri::command]
pub async fn update_chat_title(
    conversation_id: String,
    request: UpdateTitleRequest,
    storage: State<'_, ChatStorage>,
) -> Result<TitleResponse, String> {
    let mut conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    let conversation = conversations
        .iter_mut()
        .find(|c| c.id == conversation_id)
        .ok_or_else(|| format!("Conversation not found: {}", conversation_id))?;

    // For now, just generate a simple title from the message content
    // In a real implementation, this would call an LLM to generate a good title
    let title = generate_title_from_content(&request.message_content);
    conversation.title = title.clone();
    conversation.updated_at = chrono::Utc::now().to_rfc3339();

    Ok(TitleResponse { title })
}

/// Send a message and get a response (stub implementation)
#[tauri::command]
pub async fn send_message(
    conversation_id: String,
    request: SendMessageRequest,
    storage: State<'_, ChatStorage>,
) -> Result<Message, String> {
    let mut conversations = storage
        .conversations
        .lock()
        .map_err(|e| format!("Failed to lock storage: {}", e))?;

    let conversation = conversations
        .iter_mut()
        .find(|c| c.id == conversation_id)
        .ok_or_else(|| format!("Conversation not found: {}", conversation_id))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Add user message
    let user_message = Message {
        id: uuid::Uuid::new_v4().to_string(),
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: request.message.clone(),
        }],
        parent_message_id: request.parent_message_id.clone(),
        created_at: now.clone(),
    };
    conversation.messages.push(user_message.clone());

    // Generate stub assistant response
    let assistant_message = Message {
        id: uuid::Uuid::new_v4().to_string(),
        role: "assistant".to_string(),
        content: vec![ContentBlock::Text {
            text: format!(
                "This is a stub response. You said: '{}'. Real implementation coming soon!",
                request.message
            ),
        }],
        parent_message_id: Some(user_message.id),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    conversation.messages.push(assistant_message.clone());
    conversation.updated_at = chrono::Utc::now().to_rfc3339();

    Ok(assistant_message)
}

/// Helper function to generate a title from message content
fn generate_title_from_content(content: &str) -> String {
    // Simple implementation: take first 50 chars and add ellipsis if needed
    let max_len = 50;
    if content.len() <= max_len {
        content.to_string()
    } else {
        format!("{}...", &content[..max_len])
    }
}

