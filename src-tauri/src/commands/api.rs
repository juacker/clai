//! API-related Tauri commands.
//!
//! These commands expose the Netdata API client used by legacy chart/anomalies
//! surfaces to the JavaScript frontend.
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

use tauri::State;

use crate::api::client::create_client;
use crate::api::error::ApiError;
use crate::api::netdata::{ContextsQuery, DataQuery, NetdataApi};
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
