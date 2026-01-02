//! Worker Definitions Registry
//!
//! This module contains all worker definitions. Each worker is defined in its
//! own submodule, making it easy to add new workers.
//!
//! # Adding a New Worker
//!
//! 1. Create a new file: `src/workers/definitions/my_worker.rs`
//! 2. Define the worker (see `anomaly_investigator.rs` as a template):
//!    - Constants: ID, NAME, DESCRIPTION, INTERVAL_MS, REQUIRED_TOOLS
//!    - PROMPT: The system prompt for the AI
//!    - `definition()` function that returns `WorkerDefinition`
//! 3. Add the module here:
//!    ```ignore
//!    pub mod my_worker;
//!    ```
//! 4. Include it in `all_definitions()`:
//!    ```ignore
//!    vec![
//!        anomaly_investigator::definition(),
//!        my_worker::definition(),  // Add this
//!    ]
//!    ```
//!
//! That's it! The worker will be automatically registered on app startup.

// =============================================================================
// Worker Modules
// =============================================================================

pub mod anomaly_investigator;

// Future workers:
// pub mod capacity_planner;
// pub mod alert_summarizer;
// pub mod trend_analyzer;

// =============================================================================
// Registry
// =============================================================================

use crate::workers::WorkerDefinition;

/// Returns all available worker definitions.
///
/// This is called during app initialization to register all workers
/// with the scheduler.
pub fn all_definitions() -> Vec<WorkerDefinition> {
    vec![
        anomaly_investigator::definition(),
        // Add new workers here
    ]
}

/// Returns a worker definition by ID.
pub fn get_definition(id: &str) -> Option<WorkerDefinition> {
    all_definitions().into_iter().find(|d| d.id == id)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_definitions_not_empty() {
        let definitions = all_definitions();
        assert!(!definitions.is_empty());
    }

    #[test]
    fn test_all_definitions_have_unique_ids() {
        let definitions = all_definitions();
        let mut ids: Vec<_> = definitions.iter().map(|d| &d.id).collect();
        let original_len = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), original_len, "Worker IDs must be unique");
    }

    #[test]
    fn test_get_definition_found() {
        let def = get_definition("anomaly-investigator");
        assert!(def.is_some());
        assert_eq!(def.unwrap().id, "anomaly-investigator");
    }

    #[test]
    fn test_get_definition_not_found() {
        let def = get_definition("nonexistent-worker");
        assert!(def.is_none());
    }
}
