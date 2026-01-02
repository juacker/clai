//! Agent Definitions Registry
//!
//! This module contains all agent definitions. Each agent is defined in its
//! own submodule, making it easy to add new agents.
//!
//! # Adding a New Agent
//!
//! 1. Create a new file: `src/agents/definitions/my_agent.rs`
//! 2. Define the agent (see `anomaly_investigator.rs` as a template):
//!    - Constants: ID, NAME, DESCRIPTION, INTERVAL_MS, REQUIRED_TOOLS
//!    - PROMPT: The system prompt for the AI
//!    - `definition()` function that returns `AgentDefinition`
//! 3. Add the module here:
//!    ```ignore
//!    pub mod my_agent;
//!    ```
//! 4. Include it in `all_definitions()`:
//!    ```ignore
//!    vec![
//!        anomaly_investigator::definition(),
//!        my_agent::definition(),  // Add this
//!    ]
//!    ```
//!
//! That's it! The agent will be automatically registered on app startup.

// =============================================================================
// Agent Modules
// =============================================================================

pub mod anomaly_investigator;

// Future agents:
// pub mod capacity_planner;
// pub mod alert_summarizer;
// pub mod trend_analyzer;

// =============================================================================
// Registry
// =============================================================================

use crate::agents::AgentDefinition;

/// Returns all available agent definitions.
///
/// This is called during app initialization to register all agents
/// with the scheduler.
pub fn all_definitions() -> Vec<AgentDefinition> {
    vec![
        anomaly_investigator::definition(),
        // Add new agents here
    ]
}

/// Returns an agent definition by ID.
pub fn get_definition(id: &str) -> Option<AgentDefinition> {
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
        assert_eq!(ids.len(), original_len, "Agent IDs must be unique");
    }

    #[test]
    fn test_get_definition_found() {
        let def = get_definition("anomaly-investigator");
        assert!(def.is_some());
        assert_eq!(def.unwrap().id, "anomaly-investigator");
    }

    #[test]
    fn test_get_definition_not_found() {
        let def = get_definition("nonexistent-agent");
        assert!(def.is_none());
    }
}
