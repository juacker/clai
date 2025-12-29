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

use tauri::State;

use crate::api::client::create_client;
use crate::api::error::ApiError;
use crate::api::netdata::NetdataApi;
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
