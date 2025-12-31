//! Auto-pilot Tauri commands.
//!
//! These commands manage the auto-pilot feature, allowing users to enable
//! or disable AI workers for specific spaces/rooms.

use tauri::State;

use crate::api::client::create_client;
use crate::api::netdata::NetdataApi;
use crate::config::AutopilotStatus;
use crate::workers::init::{create_instances_for_room, remove_instances_for_room};
use crate::AppState;

/// Name of the "All Nodes" room in Netdata Cloud.
const ALL_NODES_ROOM_NAME: &str = "All nodes";

/// Get the auto-pilot status for a space/room.
///
/// This command:
/// 1. Loads config to check enabled rooms
/// 2. Fetches rooms to find "All Nodes" room
/// 3. Checks billing API for credits
/// 4. Returns computed status
#[tauri::command]
pub async fn get_autopilot_status(
    space_id: String,
    room_id: String,
    state: State<'_, AppState>,
) -> Result<AutopilotStatus, String> {
    // Get token for API calls
    let token = state
        .token_storage
        .get_token()
        .map_err(|e| format!("Failed to get token: {}", e))?
        .ok_or_else(|| "Not authenticated".to_string())?;

    let base_url = state.base_url.lock().unwrap().clone();
    let api = NetdataApi::new(create_client(), base_url, token);

    // Fetch rooms to find "All Nodes"
    let rooms = api
        .get_rooms(&space_id)
        .await
        .map_err(|e| format!("Failed to fetch rooms: {}", e))?;

    let all_nodes_room = rooms.iter().find(|r| r.name == ALL_NODES_ROOM_NAME);
    let all_nodes_room_id = all_nodes_room.map(|r| r.id.clone());
    let is_all_nodes_room = all_nodes_room_id.as_ref() == Some(&room_id);

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

    // No credits? Return early
    if !has_credits {
        return Ok(AutopilotStatus::no_credits());
    }

    // Get config
    let config_manager = state.config_manager.lock().unwrap();
    let space_config = config_manager.get_space_autopilot(&space_id);

    // Check if All Nodes has auto-pilot enabled
    let all_nodes_enabled = all_nodes_room_id
        .as_ref()
        .map(|id| space_config.is_room_enabled(id))
        .unwrap_or(false);

    // Check if current room has auto-pilot enabled
    let current_room_enabled = space_config.is_room_enabled(&room_id);

    // Determine status based on context
    if is_all_nodes_room {
        // In All Nodes room - can toggle directly
        Ok(AutopilotStatus::available(all_nodes_enabled, has_credits))
    } else if all_nodes_enabled {
        // In other room, but All Nodes is enabled - inherited, can't toggle here
        Ok(AutopilotStatus::via_all_nodes(has_credits))
    } else {
        // In other room, All Nodes is not enabled - can toggle for this room
        Ok(AutopilotStatus::available(current_room_enabled, has_credits))
    }
}

/// Enable or disable auto-pilot for a room.
///
/// Rules:
/// - If enabling All Nodes, it will cover the entire space
/// - If All Nodes is enabled, cannot enable other rooms (must disable All Nodes first)
/// - Disabling a room only affects that room
#[tauri::command]
pub async fn set_autopilot_enabled(
    space_id: String,
    room_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Get token for API calls
    let token = state
        .token_storage
        .get_token()
        .map_err(|e| format!("Failed to get token: {}", e))?
        .ok_or_else(|| "Not authenticated".to_string())?;

    let base_url = state.base_url.lock().unwrap().clone();
    let api = NetdataApi::new(create_client(), base_url, token);

    // Fetch rooms to find "All Nodes"
    let rooms = api
        .get_rooms(&space_id)
        .await
        .map_err(|e| format!("Failed to fetch rooms: {}", e))?;

    let all_nodes_room = rooms.iter().find(|r| r.name == ALL_NODES_ROOM_NAME);
    let all_nodes_room_id = all_nodes_room.map(|r| r.id.clone());
    let is_all_nodes_room = all_nodes_room_id.as_ref() == Some(&room_id);

    // Check credits if enabling
    if enabled {
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

    // Collect rooms to update scheduler (do config operations first, then async scheduler ops)
    let rooms_to_remove: Vec<String>;
    let room_to_add: Option<String>;

    {
        // Scope for config_manager lock - must be dropped before async operations
        let config_manager = state.config_manager.lock().unwrap();

        if enabled {
            // Check if All Nodes is already enabled (and we're not in All Nodes)
            if !is_all_nodes_room {
                if let Some(ref all_nodes_id) = all_nodes_room_id {
                    if config_manager.is_autopilot_enabled(&space_id, all_nodes_id) {
                        return Err(
                            "Cannot enable auto-pilot: All Nodes is already enabled. Disable it first."
                                .to_string(),
                        );
                    }
                }
            }

            // If enabling All Nodes, disable other rooms first
            if is_all_nodes_room {
                let enabled_rooms = config_manager.get_enabled_rooms(&space_id);
                rooms_to_remove = enabled_rooms
                    .into_iter()
                    .filter(|r| Some(r) != all_nodes_room_id.as_ref())
                    .collect();

                // Disable other rooms in config
                for other_room_id in &rooms_to_remove {
                    config_manager
                        .disable_autopilot(&space_id, other_room_id)
                        .map_err(|e| format!("Failed to disable room {}: {}", other_room_id, e))?;
                }
            } else {
                rooms_to_remove = vec![];
            }

            // Enable in config
            config_manager
                .enable_autopilot(&space_id, &room_id)
                .map_err(|e| format!("Failed to enable auto-pilot: {}", e))?;

            room_to_add = Some(room_id.clone());
        } else {
            // Disable in config
            config_manager
                .disable_autopilot(&space_id, &room_id)
                .map_err(|e| format!("Failed to disable auto-pilot: {}", e))?;

            rooms_to_remove = vec![room_id.clone()];
            room_to_add = None;
        }
    } // config_manager lock dropped here

    // Now do async scheduler operations (lock is released)
    for other_room_id in rooms_to_remove {
        remove_instances_for_room(&state.scheduler, &space_id, &other_room_id).await;
    }

    if let Some(room) = room_to_add {
        create_instances_for_room(&state.scheduler, &space_id, &room).await;
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
