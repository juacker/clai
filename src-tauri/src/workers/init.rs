//! Worker initialization.
//!
//! This module handles initializing the scheduler with default worker
//! definitions and restoring worker instances from saved configuration.

use crate::auth::TokenStorage;
use crate::config::ConfigManager;
use crate::workers::{SharedScheduler, WorkerDefinition};

// =============================================================================
// Default Worker Definitions
// =============================================================================

/// Default interval for the anomaly investigator worker (5 minutes).
const ANOMALY_INVESTIGATOR_INTERVAL_MS: u64 = 5 * 60 * 1000;

/// System prompt for the anomaly investigator worker.
const ANOMALY_INVESTIGATOR_PROMPT: &str = r#"You are an AI assistant monitoring infrastructure health for Netdata.

Your task is to check for anomalies and investigate any issues found.

## Available Tools

- `netdata.query` - Ask questions about metrics, alerts, anomalies, and infrastructure health
- `canvas.addChart` - Add a metric chart to visualize data
- `canvas.removeChart` - Remove a chart
- `canvas.clearCharts` - Remove all charts
- `canvas.setTimeRange` - Change the time window for charts
- `tabs.splitTile` - Split the view to create new panels
- `tabs.removeTile` - Remove a panel
- `tabs.getTileLayout` - Get the current layout structure

## Instructions

1. First, use `netdata.query` to check for recent anomalies or alerts
2. If anomalies are found:
   - Investigate the root cause using follow-up queries
   - Use `canvas.addChart` to display relevant metrics
   - Provide a brief summary of findings
3. If no anomalies are found:
   - Report that the infrastructure is healthy
   - Optionally show key health metrics

Be concise but thorough. Focus on actionable insights.
"#;

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
    .with_description("Monitors alerts and investigates anomalies in metrics")
    .with_prompt(ANOMALY_INVESTIGATOR_PROMPT)
    .with_tools(vec!["netdata", "canvas", "tabs"])]
}

// =============================================================================
// Initialization
// =============================================================================

/// Initializes the scheduler with default definitions and optionally restores instances.
///
/// This should be called once at app startup. It:
/// 1. Registers all default worker definitions
/// 2. If user is logged in, restores worker instances for rooms with auto-pilot enabled
pub fn initialize_scheduler(
    scheduler: &SharedScheduler,
    config_manager: &ConfigManager,
    token_storage: &TokenStorage,
) {
    let mut scheduler = scheduler.blocking_lock();

    // Register default worker definitions
    for definition in default_definitions() {
        scheduler.register_definition(definition);
    }

    // Only restore instances if user is logged in
    let has_token = token_storage.get_token().map(|t| t.is_some()).unwrap_or(false);
    if !has_token {
        return;
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

/// Restores worker instances from config.
///
/// Called after user logs in (if they weren't logged in at app startup).
/// Takes the config directly to avoid holding locks across await points.
pub async fn restore_instances_from_config(
    scheduler: &SharedScheduler,
    config: crate::config::ClaiConfig,
) {
    let mut scheduler = scheduler.lock().await;

    for (space_id, space_config) in config.spaces {
        for room_id in space_config.autopilot.enabled_rooms {
            for definition in default_definitions() {
                scheduler.create_instance(&definition.id, space_id.clone(), room_id.clone());
            }
        }
    }
}

/// Clears all worker instances.
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

/// Creates worker instances for a room.
///
/// Called when auto-pilot is enabled for a room.
pub async fn create_instances_for_room(scheduler: &SharedScheduler, space_id: &str, room_id: &str) {
    let mut scheduler = scheduler.lock().await;

    for definition in default_definitions() {
        scheduler.create_instance(&definition.id, space_id.to_string(), room_id.to_string());
    }
}

/// Removes all worker instances for a room.
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

    #[tokio::test]
    async fn test_create_and_remove_instances_for_room() {
        let scheduler = create_shared_scheduler();

        // Register definitions first
        {
            let mut s = scheduler.lock().await;
            for def in default_definitions() {
                s.register_definition(def);
            }
        }

        // Create instances
        create_instances_for_room(&scheduler, "space-1", "room-1").await;

        // Verify instances exist
        {
            let s = scheduler.lock().await;
            assert!(s.instance_count() > 0);
            let instance = s.get_instance("anomaly-investigator:space-1:room-1");
            assert!(instance.is_some());
        }

        // Remove instances
        remove_instances_for_room(&scheduler, "space-1", "room-1").await;

        // Verify instances removed
        {
            let s = scheduler.lock().await;
            assert_eq!(s.instance_count(), 0);
        }
    }
}
