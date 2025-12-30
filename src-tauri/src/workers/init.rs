//! Worker initialization.
//!
//! This module handles initializing the scheduler with default worker
//! definitions and restoring worker instances from saved configuration.

use crate::config::ConfigManager;
use crate::workers::{SharedScheduler, WorkerDefinition};

// =============================================================================
// Default Worker Definitions
// =============================================================================

/// Default interval for the anomaly investigator worker (5 minutes).
const ANOMALY_INVESTIGATOR_INTERVAL_MS: u64 = 5 * 60 * 1000;

/// Creates the default worker definitions.
///
/// Currently includes:
/// - **anomaly-investigator**: Monitors alerts and investigates anomalies
pub fn default_definitions() -> Vec<WorkerDefinition> {
    vec![WorkerDefinition::new(
        "anomaly-investigator",
        "Anomaly Investigator",
        ANOMALY_INVESTIGATOR_INTERVAL_MS,
    )
    .with_description("Monitors alerts and investigates anomalies in metrics")]
}

// =============================================================================
// Initialization
// =============================================================================

/// Initializes the scheduler with default definitions and restores instances.
///
/// This should be called once at app startup. It:
/// 1. Registers all default worker definitions
/// 2. Creates worker instances for rooms with auto-pilot enabled
pub fn initialize_scheduler(scheduler: &SharedScheduler, config_manager: &ConfigManager) {
    let mut scheduler = scheduler.blocking_lock();

    // Register default worker definitions
    for definition in default_definitions() {
        scheduler.register_definition(definition);
    }

    // Restore worker instances from config
    let config = config_manager.get();
    for (space_id, space_config) in config.spaces {
        for room_id in space_config.autopilot.enabled_rooms {
            // Create an instance for each default worker
            for definition in default_definitions() {
                scheduler.create_instance(&definition.id, space_id.clone(), room_id.clone());
            }
        }
    }
}

/// Creates worker instances for a room.
///
/// Called when auto-pilot is enabled for a room.
pub fn create_instances_for_room(scheduler: &SharedScheduler, space_id: &str, room_id: &str) {
    let mut scheduler = scheduler.blocking_lock();

    for definition in default_definitions() {
        scheduler.create_instance(&definition.id, space_id.to_string(), room_id.to_string());
    }
}

/// Removes all worker instances for a room.
///
/// Called when auto-pilot is disabled for a room.
pub fn remove_instances_for_room(scheduler: &SharedScheduler, space_id: &str, room_id: &str) {
    let mut scheduler = scheduler.blocking_lock();

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
    use crate::workers::create_shared_scheduler;

    #[test]
    fn test_default_definitions() {
        let definitions = default_definitions();

        assert!(!definitions.is_empty());

        // Verify anomaly investigator exists
        let anomaly = definitions
            .iter()
            .find(|d| d.id == "anomaly-investigator");
        assert!(anomaly.is_some());

        let anomaly = anomaly.unwrap();
        assert_eq!(anomaly.name, "Anomaly Investigator");
        assert_eq!(anomaly.interval_ms, 5 * 60 * 1000);
    }

    #[test]
    fn test_create_and_remove_instances_for_room() {
        let scheduler = create_shared_scheduler();

        // Register definitions first
        {
            let mut s = scheduler.blocking_lock();
            for def in default_definitions() {
                s.register_definition(def);
            }
        }

        // Create instances
        create_instances_for_room(&scheduler, "space-1", "room-1");

        // Verify instances exist
        {
            let s = scheduler.blocking_lock();
            assert!(s.instance_count() > 0);
            let instance = s.get_instance("anomaly-investigator:space-1:room-1");
            assert!(instance.is_some());
        }

        // Remove instances
        remove_instances_for_room(&scheduler, "space-1", "room-1");

        // Verify instances removed
        {
            let s = scheduler.blocking_lock();
            assert_eq!(s.instance_count(), 0);
        }
    }
}
