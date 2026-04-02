//! Agent initialization.
//!
//! This module handles initializing the scheduler with agent definitions
//! and managing agent instances based on configuration.
//!
//! Agent definitions are loaded from `ConfigManager` (user-configurable agents).

use crate::agents::{AgentDefinition, SharedScheduler};
use crate::auth::TokenStorage;
use crate::config::{AgentConfig, ConfigManager};

// =============================================================================
// Helpers
// =============================================================================

/// Converts an `AgentConfig` (persisted) to `AgentDefinition` (runtime).
///
/// The definition is used by the scheduler for instance creation.
/// The prompt is generated from the description using the template system.
fn agent_config_to_definition(config: &AgentConfig) -> AgentDefinition {
    AgentDefinition::new(
        &config.id,
        &config.name,
        (config.interval_minutes as u64) * 60 * 1000, // Convert minutes to ms
    )
    .with_description(&config.description)
    .with_prompt(&config.generate_prompt())
    .with_tools(config.required_tools())
}

fn agent_scope(config: &AgentConfig) -> Option<(String, String)> {
    config
        .assigned_room()
        .map(|room| (room.space_id.clone(), room.room_id.clone()))
}

// =============================================================================
// Initialization
// =============================================================================

/// Initializes the scheduler with agent definitions and optionally restores instances.
///
/// This should be called once at app startup. It:
/// 1. Registers all user-configured agents as definitions
/// 2. If user is logged in, restores agent instances for rooms where:
///    - The agent is assigned to the room (agent.enabled_rooms)
///    - Autopilot is enabled for that room (space.autopilot.enabled_rooms)
pub fn initialize_scheduler(
    scheduler: &SharedScheduler,
    config_manager: &ConfigManager,
    _token_storage: &TokenStorage,
) {
    let mut scheduler = scheduler.blocking_lock();

    // Get config and register agent definitions
    let config = config_manager.get();
    for agent_config in &config.agents {
        let definition = agent_config_to_definition(agent_config);
        scheduler.register_definition(definition);
    }

    for agent_config in &config.agents {
        if !agent_config.enabled {
            continue;
        }

        if let Some((space_id, room_id)) = agent_scope(agent_config) {
            scheduler.create_instance(&agent_config.id, space_id, room_id);
        } else {
            scheduler.create_instance(&agent_config.id, "", "");
        }
    }
}

/// Restores agent instances from config.
///
/// Called after user logs in (if they weren't logged in at app startup).
/// Takes the config directly to avoid holding locks across await points.
///
/// This registers all agent definitions and creates instances for rooms where:
/// 1. The agent is assigned to the room (agent.enabled_rooms)
/// 2. Autopilot is enabled for that room (space.autopilot.enabled_rooms)
pub async fn restore_instances_from_config(
    scheduler: &SharedScheduler,
    config: crate::config::ClaiConfig,
) {
    let mut scheduler = scheduler.lock().await;

    // Register definitions and create instances for each agent's enabled rooms
    for agent_config in &config.agents {
        let definition = agent_config_to_definition(agent_config);
        scheduler.register_definition(definition);

        if !agent_config.enabled {
            continue;
        }

        if let Some((space_id, room_id)) = agent_scope(agent_config) {
            scheduler.create_instance(&agent_config.id, space_id, room_id);
        } else {
            scheduler.create_instance(&agent_config.id, "", "");
        }
    }
}

/// Clears all agent instances.
///
/// Called when user logs out.
pub async fn clear_all_instances(scheduler: &SharedScheduler) {
    let mut scheduler = scheduler.lock().await;

    // Collect all instance IDs
    let instance_ids: Vec<String> = scheduler
        .all_instances()
        .map(|i| i.instance_id.clone())
        .collect();

    // Remove each instance
    for instance_id in instance_ids {
        scheduler.remove_instance(&instance_id);
    }
}

/// Creates a scheduler instance for a specific agent in a room.
///
/// Called when an agent is enabled for a room.
/// Note: The agent definition must already be registered with the scheduler.
#[allow(dead_code)] // May be used in future for single-agent operations
pub async fn create_instance_for_agent(
    scheduler: &SharedScheduler,
    agent_id: &str,
    space_id: &str,
    room_id: &str,
) {
    let mut scheduler = scheduler.lock().await;
    scheduler.create_instance(agent_id, space_id, room_id);
}

/// Creates scheduler instances for agents assigned to a room.
///
/// Only creates instances for agents that have the room in their `enabled_rooms`.
/// Called when auto-pilot is toggled ON for a room.
pub async fn create_instances_for_room(
    scheduler: &SharedScheduler,
    config: &crate::config::ClaiConfig,
    space_id: &str,
    room_id: &str,
) {
    let mut scheduler = scheduler.lock().await;

    for agent_config in &config.agents {
        // Only create instance if agent is assigned to this room
        if !agent_config.is_enabled_for(space_id, room_id) {
            continue;
        }

        // Register definition if not already registered
        let definition = agent_config_to_definition(agent_config);
        scheduler.register_definition(definition);

        // Create instance
        scheduler.create_instance(&agent_config.id, space_id, room_id);
    }
}

/// Removes all agent instances for a room.
///
/// Called when auto-pilot is disabled for a room.
pub async fn remove_instances_for_room(scheduler: &SharedScheduler, space_id: &str, room_id: &str) {
    let mut scheduler = scheduler.lock().await;

    // Collect instance IDs to remove
    let instances_to_remove: Vec<String> = scheduler
        .all_instances()
        .filter(|i| i.space_id == space_id && i.room_id == room_id)
        .map(|i| i.instance_id.clone())
        .collect();

    // Remove each instance
    for instance_id in instances_to_remove {
        scheduler.remove_instance(&instance_id);
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::create_shared_scheduler;
    use crate::config::types::DEFAULT_AGENT_ID;

    fn create_test_agent_config() -> AgentConfig {
        AgentConfig::new("Test Agent".to_string(), "Test description".to_string(), 5)
    }

    #[test]
    fn test_agent_config_to_definition() {
        let agent = create_test_agent_config();
        let definition = agent_config_to_definition(&agent);

        assert_eq!(definition.id, agent.id);
        assert_eq!(definition.name, "Test Agent");
        assert_eq!(definition.interval_ms, 5 * 60 * 1000); // 5 minutes in ms
        assert!(!definition.prompt.is_empty());
        assert_eq!(
            definition.required_tools,
            vec!["netdata", "dashboard", "tabs"]
        );
    }

    #[test]
    fn test_default_agent_to_definition() {
        let agent = AgentConfig::default_agent();
        let definition = agent_config_to_definition(&agent);

        assert_eq!(definition.id, DEFAULT_AGENT_ID);
        assert_eq!(definition.name, "Infrastructure Health Monitor");
        assert_eq!(definition.interval_ms, 5 * 60 * 1000);
    }

    #[tokio::test]
    async fn test_create_and_remove_instance_for_agent() {
        let scheduler = create_shared_scheduler();

        // Register definition first
        let agent = create_test_agent_config();
        {
            let mut s = scheduler.lock().await;
            s.register_definition(agent_config_to_definition(&agent));
        }

        // Create instance for agent
        create_instance_for_agent(&scheduler, &agent.id, "space-1", "room-1").await;

        // Verify instance exists
        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 1);
            let instance_id = format!("{}:space-1:room-1", agent.id);
            let instance = s.get_instance(&instance_id);
            assert!(instance.is_some());
        }

        // Remove instances for room
        remove_instances_for_room(&scheduler, "space-1", "room-1").await;

        // Verify instances removed
        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 0);
        }
    }

    #[tokio::test]
    async fn test_clear_all_instances() {
        let scheduler = create_shared_scheduler();

        // Register and create multiple instances
        let agent = create_test_agent_config();
        {
            let mut s = scheduler.lock().await;
            s.register_definition(agent_config_to_definition(&agent));
        }

        create_instance_for_agent(&scheduler, &agent.id, "space-1", "room-1").await;
        create_instance_for_agent(&scheduler, &agent.id, "space-2", "room-2").await;

        // Verify instances exist
        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 2);
        }

        // Clear all
        clear_all_instances(&scheduler).await;

        // Verify all removed
        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 0);
        }
    }
}
