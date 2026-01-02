//! Worker Runner - Background task that executes workers.
//!
//! This module provides the background loop that:
//! 1. Periodically checks the scheduler for ready workers
//! 2. Executes workers using the configured AI CLI
//! 3. Handles completion and errors
//!
//! # Starting the Runner
//!
//! The runner is started during app initialization via `start_worker_runner()`.
//! It runs continuously in the background, checking for work every 30 seconds.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                      WORKER RUNNER                               │
//! │                                                                  │
//! │  loop {                                                          │
//! │      sleep(CHECK_INTERVAL)                                       │
//! │           │                                                      │
//! │           ▼                                                      │
//! │      scheduler.next_ready()                                      │
//! │           │                                                      │
//! │           ▼ (if Some)                                            │
//! │      get definition + instance                                   │
//! │           │                                                      │
//! │           ▼                                                      │
//! │      run_ai_cli(provider, prompt, api, ...)                      │
//! │           │                                                      │
//! │           ▼                                                      │
//! │      scheduler.complete_worker(success)                          │
//! │  }                                                               │
//! └─────────────────────────────────────────────────────────────────┘
//! ```

use std::time::Duration;

use reqwest::Client;
use tauri::{AppHandle, Manager};

use crate::api::netdata::NetdataApi;
use crate::mcp::bridge::JsBridge;
use crate::workers::{cli_runner, definitions, SchedulerState, SharedScheduler};
use crate::AppState;

// =============================================================================
// Configuration
// =============================================================================

/// How often to check for ready workers (in seconds).
const CHECK_INTERVAL_SECS: u64 = 5;

/// Default timeout for worker execution (in seconds).
const WORKER_TIMEOUT_SECS: u64 = 5 * 60; // 5 minutes

// =============================================================================
// Runner
// =============================================================================

/// Starts the worker runner background task.
///
/// This spawns a tokio task that runs indefinitely, periodically checking
/// for workers that need to run and executing them.
///
/// # Arguments
///
/// * `app_handle` - Tauri app handle for accessing state and emitting events
/// * `scheduler` - The shared worker scheduler
///
/// # Returns
///
/// A handle to the spawned task (can be used to abort if needed).
pub fn start_worker_runner(app_handle: AppHandle, scheduler: SharedScheduler) {
    println!("[WorkerRunner] Starting worker runner (check interval: {}s)", CHECK_INTERVAL_SECS);

    // Use Tauri's async runtime to spawn the background task
    tauri::async_runtime::spawn(async move {
        println!("[WorkerRunner] Background task started");
        loop {
            // Sleep first to avoid running immediately on startup
            tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;

            println!("[WorkerRunner] Checking for ready workers...");

            // Check for and run workers
            if let Err(e) = run_next_worker(&app_handle, &scheduler).await {
                println!("[WorkerRunner] Error: {}", e);
            }
        }
    });
}

/// Checks for and runs the next ready worker.
///
/// This is called periodically by the runner loop. It:
/// 1. Checks if the scheduler is paused
/// 2. Gets the next ready worker (if any)
/// 3. Executes the worker
/// 4. Marks it complete
async fn run_next_worker(
    app_handle: &AppHandle,
    scheduler: &SharedScheduler,
) -> Result<(), RunnerError> {
    // Get app state
    let state = app_handle.state::<AppState>();

    // Check if we have a token (user is logged in)
    let token = state
        .token_storage
        .get_token()
        .ok()
        .flatten();

    let token = match token {
        Some(t) => t,
        None => {
            println!("[WorkerRunner] No token, skipping");
            return Ok(());
        }
    };

    // Get the AI provider from config
    let provider = {
        let config = state.config_manager.lock().unwrap();
        config.get().ai_provider.clone()
    };

    let provider = match provider {
        Some(p) => p,
        None => {
            println!("[WorkerRunner] No AI provider configured, skipping");
            return Ok(());
        }
    };

    // Check for a ready worker
    let instance_id = {
        let mut sched = scheduler.lock().await;

        // Log scheduler state
        let instance_count = sched.instance_count();
        let state = sched.state();
        let running_worker = sched.running_instance();
        println!(
            "[WorkerRunner] Scheduler: {} instances, scheduler_state={:?}, running_worker={:?}",
            instance_count,
            state,
            running_worker
        );

        // Check if scheduler is paused
        if matches!(state, SchedulerState::Paused { .. }) {
            println!("[WorkerRunner] Scheduler is paused");
            return Ok(());
        }

        sched.next_ready()
    };

    let instance_id = match instance_id {
        Some(id) => id,
        None => {
            println!("[WorkerRunner] No workers ready");
            return Ok(());
        }
    };

    println!("[WorkerRunner] Running worker: {}", instance_id);

    // Get the instance details
    let (worker_id, space_id, room_id) = {
        let sched = scheduler.lock().await;
        let instance = sched
            .get_instance(&instance_id)
            .ok_or_else(|| RunnerError::InstanceNotFound(instance_id.clone()))?;

        (
            instance.worker_id.clone(),
            instance.space_id.clone(),
            instance.room_id.clone(),
        )
    };

    println!("[WorkerRunner] Got instance: worker={}, space={}, room={}", worker_id, space_id, room_id);

    // Get the worker definition
    let definition = definitions::get_definition(&worker_id)
        .ok_or_else(|| RunnerError::DefinitionNotFound(worker_id.clone()))?;

    println!("[WorkerRunner] Got definition: {}", definition.name);

    // Get base URL
    let base_url = {
        let url = state.base_url.lock().unwrap();
        url.clone()
    };

    println!("[WorkerRunner] Base URL: {}", base_url);

    // Create API client
    let client = Client::new();
    let api = std::sync::Arc::new(NetdataApi::new(client, base_url, token));

    // Create JS bridge for UI tools
    let bridge = JsBridge::new(app_handle.clone());

    println!("[WorkerRunner] Starting CLI with provider: {:?}", provider);

    // Run the worker
    let result = cli_runner::run_ai_cli(
        &provider,
        &definition.prompt,
        api,
        &definition.id,
        &space_id,
        &room_id,
        Some(bridge),
        WORKER_TIMEOUT_SECS,
    )
    .await;

    println!("[WorkerRunner] CLI finished");

    // Mark worker complete
    let success = match &result {
        Ok(run_result) => {
            if run_result.success {
                println!("[WorkerRunner] Worker {} completed successfully", instance_id);
                true
            } else {
                println!(
                    "[WorkerRunner] Worker {} failed with exit code {:?}",
                    instance_id,
                    run_result.exit_code
                );
                // Log stderr for debugging
                if !run_result.stderr.is_empty() {
                    println!("[WorkerRunner] stderr: {}", run_result.stderr);
                }
                false
            }
        }
        Err(e) => {
            println!("[WorkerRunner] Worker {} error: {}", instance_id, e);
            false
        }
    };

    // Update scheduler
    {
        let mut sched = scheduler.lock().await;
        sched.complete_worker(&instance_id, success);

        // Log next run time
        if let Some(instance) = sched.get_instance(&instance_id) {
            let seconds_until_next = instance.seconds_until_next_run();
            println!(
                "[WorkerRunner] Next run for {} in {} seconds (~{} minutes)",
                instance_id,
                seconds_until_next,
                seconds_until_next / 60
            );
        }
    }

    Ok(())
}

// =============================================================================
// Errors
// =============================================================================

/// Errors that can occur in the worker runner.
#[derive(Debug)]
pub enum RunnerError {
    /// Worker instance not found.
    InstanceNotFound(String),
    /// Worker definition not found.
    DefinitionNotFound(String),
}

impl std::fmt::Display for RunnerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunnerError::InstanceNotFound(id) => write!(f, "Worker instance not found: {}", id),
            RunnerError::DefinitionNotFound(id) => write!(f, "Worker definition not found: {}", id),
        }
    }
}

impl std::error::Error for RunnerError {}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runner_error_display() {
        let err = RunnerError::InstanceNotFound("test-id".to_string());
        assert!(err.to_string().contains("test-id"));

        let err = RunnerError::DefinitionNotFound("test-def".to_string());
        assert!(err.to_string().contains("test-def"));
    }

    #[test]
    fn test_check_interval() {
        // Verify the check interval is reasonable
        assert!(CHECK_INTERVAL_SECS >= 1, "Check interval too short");
        assert!(CHECK_INTERVAL_SECS <= 120, "Check interval too long");
    }

    #[test]
    fn test_worker_timeout() {
        // Verify timeout is reasonable
        assert!(WORKER_TIMEOUT_SECS >= 60, "Timeout too short");
        assert!(WORKER_TIMEOUT_SECS <= 30 * 60, "Timeout too long");
    }
}
