//! Auto-pilot Tauri commands.
//!
//! These commands manage the auto-pilot feature, allowing users to enable
//! or disable AI agents for specific spaces/rooms.
//!
//! Each room can be toggled independently.

use tauri::State;

use crate::agents::init::{create_instances_for_room, remove_instances_for_room};
use crate::api::client::create_client;
use crate::api::netdata::NetdataApi;
use crate::config::{AgentInfo, AutopilotStatus, ProviderInfo};
use crate::AppState;

/// Get the auto-pilot status for a space/room.
///
/// This command:
/// 1. Loads config to check enabled rooms, provider, and agents
/// 2. Checks billing API for credits
/// 3. Returns computed status including provider and agent info
///
/// Each room can be toggled independently.
#[tauri::command]
pub async fn get_autopilot_status(
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<AutopilotStatus, String> {
    // Get provider, agent info, and room status (before any async operations)
    let (provider_info, agent_info, room_enabled) = {
        let config_manager = state.config_manager.lock().unwrap();
        let provider = config_manager.get_ai_provider();
        let provider_info = ProviderInfo::from_provider(provider.as_ref());

        // Get agent counts
        let agents = config_manager.get_agents();
        let total_count = agents.len();
        let enabled_count = config_manager.count_agents_enabled(&space_id, &room_id);
        let agent_info = AgentInfo::new(total_count, enabled_count);

        // Check if current room has auto-pilot enabled
        let space_config = config_manager.get_space_autopilot(&space_id);
        let room_enabled = space_config.is_room_enabled(&room_id);

        (provider_info, agent_info, room_enabled)
    };

    // Get token for API calls
    let token = state
        .token_storage
        .get_token()
        .map_err(|e| format!("Failed to get token: {}", e))?
        .ok_or_else(|| "Not authenticated".to_string())?;

    let base_url = state.base_url.lock().unwrap().clone();
    let api = NetdataApi::new(create_client(), base_url, token);

    // Check credits
    let billing = api
        .get_billing_plan(&space_id)
        .await
        .map_err(|e| format!("Failed to fetch billing: {}", e))?;

    let has_credits = billing
        .ai
        .and_then(|ai| ai.total_available_microcredits)
        .map(|c| c > 0)
        .unwrap_or(false);

    // No credits? Return early (but still include provider and agent info)
    if !has_credits {
        return Ok(AutopilotStatus::no_credits(provider_info, agent_info));
    }

    // Return status - each room can toggle independently
    Ok(AutopilotStatus::available(
        room_enabled,
        has_credits,
        provider_info,
        agent_info,
    ))
}

/// Enable or disable auto-pilot for a room.
///
/// Rules:
/// - Provider must be configured to enable auto-pilot
/// - Credits must be available to enable
/// - Each room can be toggled independently
#[tauri::command]
pub async fn set_autopilot_enabled(
    space_id: String,
    room_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Check provider is configured if enabling
    if enabled {
        let config_manager = state.config_manager.lock().unwrap();
        if !config_manager.has_ai_provider() {
            return Err("Cannot enable auto-pilot: no AI provider configured. Please select a provider first.".to_string());
        }
    }

    // Check credits if enabling
    if enabled {
        let token = state
            .token_storage
            .get_token()
            .map_err(|e| format!("Failed to get token: {}", e))?
            .ok_or_else(|| "Not authenticated".to_string())?;

        let base_url = state.base_url.lock().unwrap().clone();
        let api = NetdataApi::new(create_client(), base_url, token);

        let billing = api
            .get_billing_plan(&space_id)
            .await
            .map_err(|e| format!("Failed to fetch billing: {}", e))?;

        let has_credits = billing
            .ai
            .and_then(|ai| ai.total_available_microcredits)
            .map(|c| c > 0)
            .unwrap_or(false);

        if !has_credits {
            return Err("Cannot enable auto-pilot: no AI credits available".to_string());
        }
    }

    // Update config and get state for scheduler operations
    let config_for_scheduler: crate::config::ClaiConfig;

    {
        // Scope for config_manager lock - must be dropped before async operations
        let config_manager = state.config_manager.lock().unwrap();

        if enabled {
            config_manager
                .enable_autopilot(&space_id, &room_id)
                .map_err(|e| format!("Failed to enable auto-pilot: {}", e))?;
        } else {
            config_manager
                .disable_autopilot(&space_id, &room_id)
                .map_err(|e| format!("Failed to disable auto-pilot: {}", e))?;
        }

        // Clone config for scheduler operations (before dropping lock)
        config_for_scheduler = config_manager.get();
    } // config_manager lock dropped here

    // Update scheduler
    if enabled {
        create_instances_for_room(&state.scheduler, &config_for_scheduler, &space_id, &room_id)
            .await;
    } else {
        remove_instances_for_room(&state.scheduler, &space_id, &room_id).await;
    }

    Ok(())
}

/// Get all spaces/rooms where auto-pilot is enabled.
///
/// Returns a map of space_id -> list of enabled room_ids.
#[tauri::command]
pub fn get_all_autopilot_enabled(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let config_manager = state.config_manager.lock().unwrap();
    let config = config_manager.get();

    let mut result = std::collections::HashMap::new();
    for (space_id, space_config) in config.spaces {
        if !space_config.autopilot.enabled_rooms.is_empty() {
            result.insert(space_id, space_config.autopilot.enabled_rooms);
        }
    }

    Ok(result)
}
