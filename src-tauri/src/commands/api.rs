//! API-related Tauri commands.
//!
//! These commands expose the Netdata Cloud API to the JavaScript frontend.
//! Each command creates a short-lived `NetdataApi` instance with the current
//! token and base URL, then makes the API call.
//!
//! # Rust Learning: Command Design
//!
//! We return `serde_json::Value` instead of specific types because:
//! 1. Tauri serializes the return value to JSON anyway
//! 2. It provides flexibility for the frontend
//! 3. It simplifies error handling across different response types
//!
//! In a larger app, you might want typed returns for better documentation.

use tauri::{AppHandle, Emitter, State};

use crate::api::client::create_client;
use crate::api::error::ApiError;
use crate::api::netdata::{ChatCompletionRequest, ContextsQuery, DataQuery, NetdataApi};
use crate::AppState;

/// Helper to create an API client with current credentials.
///
/// # Rust Learning: Async Helper Functions
///
/// This is a private helper (not `pub`) that encapsulates the common logic
/// of getting the token and base URL before making API calls.
async fn create_api(state: &State<'_, AppState>) -> Result<NetdataApi, ApiError> {
    // Get token from secure storage
    let token = state
        .token_storage
        .get_token()
        .map_err(|e| ApiError::TokenStorage(e.to_string()))?
        .ok_or(ApiError::NoToken)?;

    // Get base URL (with lock)
    let base_url = state
        .base_url
        .lock()
        .map_err(|e| ApiError::TokenStorage(format!("Lock error: {}", e)))?
        .clone();

    // Note: We create a new client here for simplicity.
    // In production, you might want to store the client in AppState.
    // However, reqwest::Client is cheap to clone if we do add it.
    Ok(NetdataApi::new(create_client(), base_url, token))
}

/// Gets information about the authenticated user.
///
/// # JavaScript Usage
///
/// ```javascript
/// import { invoke } from '@tauri-apps/api/core';
///
/// const userInfo = await invoke('api_get_user_info');
/// console.log(userInfo.name, userInfo.email);
/// ```
#[tauri::command]
pub async fn api_get_user_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_user_info()
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets all spaces the user has access to.
///
/// # JavaScript Usage
///
/// ```javascript
/// const spaces = await invoke('api_get_spaces');
/// spaces.forEach(space => console.log(space.name));
/// ```
#[tauri::command]
pub async fn api_get_spaces(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_spaces()
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets all rooms in a space.
///
/// # Arguments
///
/// * `space_id` - The ID of the space
///
/// # JavaScript Usage
///
/// ```javascript
/// const rooms = await invoke('api_get_rooms', { spaceId: 'abc123' });
/// ```
///
/// # Rust Learning: Naming Convention
///
/// Tauri automatically converts Rust's `snake_case` parameters to JavaScript's
/// `camelCase`. So `space_id` in Rust becomes `spaceId` in JavaScript.
#[tauri::command]
pub async fn api_get_rooms(
    space_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_rooms(&space_id)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets the billing plan for a space, including AI credits.
///
/// # Arguments
///
/// * `space_id` - The ID of the space
///
/// # JavaScript Usage
///
/// ```javascript
/// const plan = await invoke('api_get_billing_plan', { spaceId: 'abc123' });
/// const credits = plan.ai?.total_available_microcredits;
/// ```
#[tauri::command]
pub async fn api_get_billing_plan(
    space_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_billing_plan(&space_id)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets data with complex aggregation and filtering options.
///
/// # Arguments
///
/// * `space_id` - The ID of the space
/// * `room_id` - The ID of the room
/// * `query` - The data query parameters (see DataQuery struct)
///
/// # JavaScript Usage
///
/// ```javascript
/// const data = await invoke('api_get_data', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   query: {
///     scope: { contexts: ['system.cpu'], nodes: ['node1'] },
///     window: { after: 1234567890, before: 1234567900 },
///     aggregations: {
///       metrics: [{ aggregation: 'avg', group_by: ['dimension'] }],
///       time: { time_group: 'average', time_resampling: 60 }
///     }
///   }
/// });
/// ```
#[tauri::command]
pub async fn api_get_data(
    space_id: String,
    room_id: String,
    query: DataQuery,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_data(&space_id, &room_id, query)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets available contexts (metrics) for a space/room.
///
/// # Arguments
///
/// * `space_id` - The ID of the space
/// * `room_id` - The ID of the room
/// * `query` - The contexts query parameters (see ContextsQuery struct)
///
/// # JavaScript Usage
///
/// ```javascript
/// const contexts = await invoke('api_get_contexts', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   query: {
///     scope: { nodes: ['node1'] },
///     selectors: { contexts: ['*'], nodes: ['*'] },
///     window: { after: 1234567890, before: 1234567900 }
///   }
/// });
/// ```
#[tauri::command]
pub async fn api_get_contexts(
    space_id: String,
    room_id: String,
    query: ContextsQuery,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_contexts(&space_id, &room_id, query)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

// =============================================================================
// Conversation Commands
// =============================================================================

/// Creates a new conversation.
///
/// # JavaScript Usage
///
/// ```javascript
/// const conversation = await invoke('api_create_conversation', {
///   spaceId: 'abc123',
///   roomId: 'xyz789'
/// });
/// console.log(conversation.id);
/// ```
#[tauri::command]
pub async fn api_create_conversation(
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.create_conversation(&space_id, &room_id)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Gets a specific conversation.
///
/// # JavaScript Usage
///
/// ```javascript
/// const conversation = await invoke('api_get_conversation', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   conversationId: 'conv123'
/// });
/// ```
#[tauri::command]
pub async fn api_get_conversation(
    space_id: String,
    room_id: String,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.get_conversation(&space_id, &room_id, &conversation_id)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Lists all conversations for a room.
///
/// # JavaScript Usage
///
/// ```javascript
/// const conversations = await invoke('api_list_conversations', {
///   spaceId: 'abc123',
///   roomId: 'xyz789'
/// });
/// ```
#[tauri::command]
pub async fn api_list_conversations(
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.list_conversations(&space_id, &room_id)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Deletes a conversation.
///
/// # JavaScript Usage
///
/// ```javascript
/// await invoke('api_delete_conversation', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   conversationId: 'conv123'
/// });
/// ```
#[tauri::command]
pub async fn api_delete_conversation(
    space_id: String,
    room_id: String,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.delete_conversation(&space_id, &room_id, &conversation_id)
        .await
        .map_err(|e| e.to_string())
}

/// Creates a title for a conversation based on message content.
///
/// # JavaScript Usage
///
/// ```javascript
/// const result = await invoke('api_create_conversation_title', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   conversationId: 'conv123',
///   messageContent: "What's the current CPU usage?"
/// });
/// console.log(result.title);
/// ```
#[tauri::command]
pub async fn api_create_conversation_title(
    space_id: String,
    room_id: String,
    conversation_id: String,
    message_content: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    api.create_conversation_title(&space_id, &room_id, &conversation_id, &message_content)
        .await
        .map(|v| serde_json::to_value(v).unwrap())
        .map_err(|e| e.to_string())
}

/// Creates a chat completion with SSE streaming.
///
/// This command streams the response by emitting Tauri events for each SSE chunk.
/// The event name is `chat-completion-chunk` and contains the parsed JSON data.
///
/// # Arguments
///
/// * `space_id` - The ID of the space
/// * `room_id` - The ID of the room
/// * `conversation_id` - The ID of the conversation
/// * `message` - The user message
/// * `parent_message_id` - Optional parent message ID for threading
///
/// # JavaScript Usage
///
/// ```javascript
/// import { listen } from '@tauri-apps/api/event';
///
/// // Listen for streaming chunks
/// const unlisten = await listen('chat-completion-chunk', (event) => {
///   const chunk = event.payload;
///   if (chunk.type === 'content_block_delta') {
///     console.log(chunk.delta.text);
///   }
/// });
///
/// // Start the completion (this returns when streaming is done)
/// await invoke('api_chat_completion', {
///   spaceId: 'abc123',
///   roomId: 'xyz789',
///   conversationId: 'conv123',
///   message: 'Hello!'
/// });
///
/// // Clean up listener
/// unlisten();
/// ```
#[tauri::command]
pub async fn api_chat_completion(
    space_id: String,
    room_id: String,
    conversation_id: String,
    message: String,
    parent_message_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let api = create_api(&state).await.map_err(|e| e.to_string())?;

    let request = ChatCompletionRequest {
        message,
        tools: vec![crate::api::netdata::ChatTool {
            name: "blocks".to_string(),
            version: 0,
        }],
        parent_message_id,
    };

    api.create_chat_completion(&space_id, &room_id, &conversation_id, request, |chunk| {
        // Emit each chunk to the frontend
        let _ = app.emit("chat-completion-chunk", chunk);
    })
    .await
    .map_err(|e| e.to_string())
}
