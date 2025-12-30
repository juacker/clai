//! Worker scheduler.
//!
//! A simple scheduler that manages worker instances and determines
//! when they should run. Only one worker runs at a time.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                         SCHEDULER                               │
//! │                                                                 │
//! │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
//! │  │  Definitions │    │  Instances   │    │  next_ready  │     │
//! │  │  (templates) │───▶│ (per space)  │───▶│  (find work) │     │
//! │  └──────────────┘    └──────────────┘    └──────────────┘     │
//! └─────────────────────────────────────────────────────────────────┘
//! ```

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::Mutex;

use super::types::{WorkerDefinition, WorkerInstance};

// =============================================================================
// Scheduler State
// =============================================================================

/// Current state of the scheduler.
#[derive(Debug, Clone, PartialEq)]
pub enum SchedulerState {
    /// Scheduler is running normally.
    Running,
    /// Scheduler is paused (e.g., no connectivity).
    Paused { reason: String },
    /// Scheduler is stopped.
    Stopped,
}

// =============================================================================
// Scheduler
// =============================================================================

/// The worker scheduler.
///
/// Manages worker definitions and instances. Finds the next worker
/// that is ready to run. Only one worker can run at a time.
pub struct Scheduler {
    /// Current scheduler state.
    state: SchedulerState,

    /// Worker definitions (templates).
    definitions: HashMap<String, WorkerDefinition>,

    /// Worker instances (per space/room).
    instances: HashMap<String, WorkerInstance>,

    /// Currently running instance ID (only one at a time).
    running: Option<String>,
}

impl Scheduler {
    /// Creates a new scheduler.
    pub fn new() -> Self {
        Self {
            state: SchedulerState::Running,
            definitions: HashMap::new(),
            instances: HashMap::new(),
            running: None,
        }
    }

    // =========================================================================
    // Registration
    // =========================================================================

    /// Registers a worker definition.
    pub fn register_definition(&mut self, definition: WorkerDefinition) {
        self.definitions.insert(definition.id.clone(), definition);
    }

    /// Gets a worker definition.
    pub fn get_definition(&self, worker_id: &str) -> Option<&WorkerDefinition> {
        self.definitions.get(worker_id)
    }

    /// Creates and registers a worker instance for a space/room.
    ///
    /// Returns `None` if:
    /// - The worker definition doesn't exist
    /// - An instance already exists for this worker/space/room combination
    pub fn create_instance(
        &mut self,
        worker_id: &str,
        space_id: String,
        room_id: String,
    ) -> Option<String> {
        let definition = self.definitions.get(worker_id)?;
        let instance = WorkerInstance::new(definition, space_id, room_id);
        let instance_id = instance.instance_id.clone();

        // Don't overwrite existing instances
        if self.instances.contains_key(&instance_id) {
            return Some(instance_id);
        }

        self.instances.insert(instance_id.clone(), instance);

        Some(instance_id)
    }

    /// Removes a worker instance.
    pub fn remove_instance(&mut self, instance_id: &str) {
        self.instances.remove(instance_id);
        if self.running.as_ref() == Some(&instance_id.to_string()) {
            self.running = None;
        }
    }

    // =========================================================================
    // Scheduling
    // =========================================================================

    /// Gets the next worker that is ready to run.
    ///
    /// Returns `None` if:
    /// - Scheduler is paused/stopped
    /// - A worker is already running
    /// - No workers are ready
    pub fn next_ready(&mut self) -> Option<String> {
        // Check scheduler state
        if self.state != SchedulerState::Running {
            return None;
        }

        // Only one worker at a time
        if self.running.is_some() {
            return None;
        }

        let now = Instant::now();

        // Find first ready instance
        for instance in self.instances.values_mut() {
            if instance.is_ready(now) {
                instance.is_running = true;
                self.running = Some(instance.instance_id.clone());
                return Some(instance.instance_id.clone());
            }
        }

        None
    }

    /// Marks a worker as completed and schedules its next run.
    pub fn complete_worker(&mut self, instance_id: &str, success: bool) {
        if let Some(instance) = self.instances.get_mut(instance_id) {
            instance.is_running = false;

            // Get interval from definition
            if let Some(definition) = self.definitions.get(&instance.worker_id) {
                // Schedule next run
                instance.schedule_next(definition.interval_ms);
            }

            if !success {
                // Could track consecutive failures here if needed
            }
        }

        if self.running.as_ref() == Some(&instance_id.to_string()) {
            self.running = None;
        }
    }

    // =========================================================================
    // State Management
    // =========================================================================

    /// Pauses the scheduler.
    pub fn pause(&mut self, reason: String) {
        self.state = SchedulerState::Paused { reason };
    }

    /// Resumes the scheduler.
    pub fn resume(&mut self) {
        self.state = SchedulerState::Running;
    }

    /// Stops the scheduler.
    pub fn stop(&mut self) {
        self.state = SchedulerState::Stopped;
    }

    /// Gets the current scheduler state.
    pub fn state(&self) -> &SchedulerState {
        &self.state
    }

    /// Returns whether a worker is currently running.
    pub fn is_running(&self) -> bool {
        self.running.is_some()
    }

    /// Gets the currently running instance ID.
    pub fn running_instance(&self) -> Option<&String> {
        self.running.as_ref()
    }

    // =========================================================================
    // Instance Access
    // =========================================================================

    /// Gets a reference to a worker instance.
    pub fn get_instance(&self, instance_id: &str) -> Option<&WorkerInstance> {
        self.instances.get(instance_id)
    }

    /// Gets a mutable reference to a worker instance.
    pub fn get_instance_mut(&mut self, instance_id: &str) -> Option<&mut WorkerInstance> {
        self.instances.get_mut(instance_id)
    }

    /// Gets all instances for a space.
    pub fn get_instances_for_space(&self, space_id: &str) -> Vec<&WorkerInstance> {
        self.instances
            .values()
            .filter(|i| i.space_id == space_id)
            .collect()
    }

    /// Gets the count of all registered instances.
    pub fn instance_count(&self) -> usize {
        self.instances.len()
    }

    /// Gets all instances.
    pub fn all_instances(&self) -> impl Iterator<Item = &WorkerInstance> {
        self.instances.values()
    }

    /// Enables or disables a worker instance.
    pub fn set_instance_enabled(&mut self, instance_id: &str, enabled: bool) {
        if let Some(instance) = self.instances.get_mut(instance_id) {
            instance.enabled = enabled;
        }
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe scheduler wrapped in Arc<Mutex>.
pub type SharedScheduler = Arc<Mutex<Scheduler>>;

/// Creates a new shared scheduler.
pub fn create_shared_scheduler() -> SharedScheduler {
    Arc::new(Mutex::new(Scheduler::new()))
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_definition() -> WorkerDefinition {
        WorkerDefinition::new("test-worker", "Test Worker", 60_000)
            .with_description("A test worker")
    }

    #[test]
    fn test_scheduler_creation() {
        let scheduler = Scheduler::new();

        assert_eq!(scheduler.state(), &SchedulerState::Running);
        assert!(!scheduler.is_running());
        assert_eq!(scheduler.instance_count(), 0);
    }

    #[test]
    fn test_register_and_create_instance() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());

        let instance_id = scheduler
            .create_instance("test-worker", "space1".to_string(), "room1".to_string())
            .unwrap();

        assert_eq!(instance_id, "test-worker:space1:room1");
        assert_eq!(scheduler.instance_count(), 1);

        let instance = scheduler.get_instance(&instance_id).unwrap();
        assert_eq!(instance.space_id, "space1");
        assert_eq!(instance.room_id, "room1");
    }

    #[test]
    fn test_scheduler_pause_resume() {
        let mut scheduler = Scheduler::new();

        assert_eq!(scheduler.state(), &SchedulerState::Running);

        scheduler.pause("Testing".to_string());
        assert!(matches!(scheduler.state(), SchedulerState::Paused { .. }));

        scheduler.resume();
        assert_eq!(scheduler.state(), &SchedulerState::Running);
    }

    #[test]
    fn test_next_ready_basic() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());
        scheduler.create_instance("test-worker", "space1".to_string(), "room1".to_string());

        // First call should return the instance
        let next = scheduler.next_ready();
        assert_eq!(next, Some("test-worker:space1:room1".to_string()));

        // Second call should return None (worker is running)
        let next = scheduler.next_ready();
        assert!(next.is_none());

        // After completion, should be scheduled for later (not immediately ready)
        scheduler.complete_worker("test-worker:space1:room1", true);
        let next = scheduler.next_ready();
        assert!(next.is_none()); // Scheduled for 60 seconds later
    }

    #[test]
    fn test_only_one_worker_at_a_time() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());
        scheduler.create_instance("test-worker", "space1".to_string(), "room1".to_string());
        scheduler.create_instance("test-worker", "space2".to_string(), "room1".to_string());

        // First should succeed
        let first = scheduler.next_ready();
        assert!(first.is_some());

        // Second should fail (only one at a time)
        let second = scheduler.next_ready();
        assert!(second.is_none());

        // Complete first
        scheduler.complete_worker(&first.unwrap(), true);

        // Now second should work (but it's scheduled for later)
        // Both instances were scheduled, so they'll run based on next_run_at
        assert!(!scheduler.is_running());
    }

    #[test]
    fn test_paused_scheduler_returns_none() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());
        scheduler.create_instance("test-worker", "space1".to_string(), "room1".to_string());

        scheduler.pause("Maintenance".to_string());

        let next = scheduler.next_ready();
        assert!(next.is_none());

        scheduler.resume();

        let next = scheduler.next_ready();
        assert!(next.is_some());
    }

    #[test]
    fn test_remove_instance() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());
        let instance_id = scheduler
            .create_instance("test-worker", "space1".to_string(), "room1".to_string())
            .unwrap();

        assert_eq!(scheduler.instance_count(), 1);

        scheduler.remove_instance(&instance_id);
        assert_eq!(scheduler.instance_count(), 0);
    }

    #[test]
    fn test_enable_disable_instance() {
        let mut scheduler = Scheduler::new();

        scheduler.register_definition(create_test_definition());
        scheduler.create_instance("test-worker", "space1".to_string(), "room1".to_string());

        // Disable the instance
        scheduler.set_instance_enabled("test-worker:space1:room1", false);

        // Should not be ready
        let next = scheduler.next_ready();
        assert!(next.is_none());

        // Re-enable
        scheduler.set_instance_enabled("test-worker:space1:room1", true);

        // Should be ready now
        let next = scheduler.next_ready();
        assert!(next.is_some());
    }
}
