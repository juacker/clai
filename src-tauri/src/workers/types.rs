//! Worker type definitions.
//!
//! Simplified worker types for the initial implementation.

use serde::{Deserialize, Serialize};
use std::time::Instant;

// =============================================================================
// Worker Definition
// =============================================================================

/// Definition of a worker type.
///
/// This is a template that describes what a worker does and how often it runs.
/// Multiple `WorkerInstance`s can be created from a single `WorkerDefinition`.
///
/// # Fields
///
/// - `id`: Unique identifier (e.g., "anomaly-investigator")
/// - `name`: Human-readable name for UI
/// - `description`: Description of what this worker does
/// - `interval_ms`: How often to run (in milliseconds)
/// - `prompt`: System prompt for the AI (sent to AI CLI)
/// - `required_tools`: Tool namespaces this worker needs (e.g., ["netdata", "canvas"])
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerDefinition {
    /// Unique identifier for this worker type (e.g., "anomaly-investigator").
    pub id: String,

    /// Human-readable name.
    pub name: String,

    /// Description of what this worker does.
    #[serde(default)]
    pub description: String,

    /// How often to run this worker (in milliseconds).
    pub interval_ms: u64,

    /// System prompt for the AI.
    ///
    /// This is the main instruction set that tells the AI what to do.
    /// It should describe the worker's purpose, available tools, and
    /// expected behavior.
    #[serde(default)]
    pub prompt: String,

    /// List of tool namespaces this worker needs (e.g., ["netdata", "canvas", "tabs"]).
    ///
    /// The executor will only expose tools from these namespaces to the AI.
    /// Available namespaces: "netdata", "canvas", "tabs"
    #[serde(default)]
    pub required_tools: Vec<String>,
}

impl WorkerDefinition {
    /// Creates a new worker definition.
    pub fn new(id: &str, name: &str, interval_ms: u64) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: String::new(),
            interval_ms,
            prompt: String::new(),
            required_tools: vec![],
        }
    }

    /// Sets the description.
    pub fn with_description(mut self, description: &str) -> Self {
        self.description = description.to_string();
        self
    }

    /// Sets the system prompt for the AI.
    pub fn with_prompt(mut self, prompt: &str) -> Self {
        self.prompt = prompt.to_string();
        self
    }

    /// Sets the required tools.
    pub fn with_tools(mut self, tools: Vec<&str>) -> Self {
        self.required_tools = tools.into_iter().map(String::from).collect();
        self
    }
}

// =============================================================================
// Worker Instance
// =============================================================================

/// A running instance of a worker for a specific space/room.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerInstance {
    /// Reference to the worker definition ID.
    pub worker_id: String,

    /// Unique instance ID (e.g., "anomaly-investigator:space123:room456").
    pub instance_id: String,

    /// Space this worker is monitoring.
    pub space_id: String,

    /// Room this worker is monitoring.
    pub room_id: String,

    /// Tab ID where this worker's output is displayed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,

    /// Whether the worker is currently running.
    #[serde(default)]
    pub is_running: bool,

    /// Whether this instance is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Conversation ID from the last run (for viewing history).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_conversation_id: Option<String>,

    /// When this worker should run next (not serialized).
    #[serde(skip)]
    pub next_run_at: Option<Instant>,
}

fn default_true() -> bool {
    true
}

impl WorkerInstance {
    /// Creates a new worker instance.
    pub fn new(definition: &WorkerDefinition, space_id: String, room_id: String) -> Self {
        let instance_id = format!("{}:{}:{}", definition.id, space_id, room_id);

        Self {
            worker_id: definition.id.clone(),
            instance_id,
            space_id,
            room_id,
            tab_id: None,
            is_running: false,
            enabled: true,
            last_conversation_id: None,
            next_run_at: None,
        }
    }

    /// Sets the tab ID for this worker instance.
    pub fn with_tab_id(mut self, tab_id: String) -> Self {
        self.tab_id = Some(tab_id);
        self
    }

    /// Returns true if this worker is ready to run.
    pub fn is_ready(&self, now: Instant) -> bool {
        self.enabled && !self.is_running && self.next_run_at.map(|t| t <= now).unwrap_or(true)
    }

    /// Schedules the next run based on the interval.
    pub fn schedule_next(&mut self, interval_ms: u64) {
        self.next_run_at = Some(Instant::now() + std::time::Duration::from_millis(interval_ms));
    }

    /// Returns seconds until the next scheduled run (0 if ready now or no schedule).
    pub fn seconds_until_next_run(&self) -> u64 {
        match self.next_run_at {
            Some(next) => {
                let now = Instant::now();
                if next > now {
                    next.duration_since(now).as_secs()
                } else {
                    0
                }
            }
            None => 0,
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worker_definition_creation() {
        let def = WorkerDefinition::new("test-worker", "Test Worker", 60_000)
            .with_description("A test worker")
            .with_tools(vec!["canvas", "tabs"]);

        assert_eq!(def.id, "test-worker");
        assert_eq!(def.name, "Test Worker");
        assert_eq!(def.interval_ms, 60_000);
        assert_eq!(def.required_tools, vec!["canvas", "tabs"]);
    }

    #[test]
    fn test_worker_instance_creation() {
        let def = WorkerDefinition::new("test-worker", "Test Worker", 60_000);
        let instance = WorkerInstance::new(&def, "space1".to_string(), "room1".to_string());

        assert_eq!(instance.worker_id, "test-worker");
        assert_eq!(instance.instance_id, "test-worker:space1:room1");
        assert_eq!(instance.space_id, "space1");
        assert_eq!(instance.room_id, "room1");
        assert!(!instance.is_running);
        assert!(instance.enabled);
    }

    #[test]
    fn test_worker_instance_is_ready() {
        let def = WorkerDefinition::new("test-worker", "Test Worker", 60_000);
        let mut instance = WorkerInstance::new(&def, "space1".to_string(), "room1".to_string());
        let now = Instant::now();

        // Initially ready (no next_run_at set)
        assert!(instance.is_ready(now));

        // Not ready when running
        instance.is_running = true;
        assert!(!instance.is_ready(now));
        instance.is_running = false;

        // Not ready when disabled
        instance.enabled = false;
        assert!(!instance.is_ready(now));
        instance.enabled = true;

        // Not ready when scheduled for future
        instance.next_run_at = Some(now + std::time::Duration::from_secs(60));
        assert!(!instance.is_ready(now));

        // Ready when scheduled time has passed
        instance.next_run_at = Some(now - std::time::Duration::from_secs(1));
        assert!(instance.is_ready(now));
    }
}
