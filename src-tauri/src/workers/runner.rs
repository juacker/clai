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
    tracing::info!(
        check_interval_secs = CHECK_INTERVAL_SECS,
        "Starting worker runner"
    );

    // Use Tauri's async runtime to spawn the background task
    tauri::async_runtime::spawn(async move {
        tracing::info!("Worker runner background task started");
        loop {
            // Sleep first to avoid running immediately on startup
            tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;

            tracing::debug!("Checking for ready workers...");

            // Check for and run workers
            if let Err(e) = run_next_worker(&app_handle, &scheduler).await {
                tracing::error!(error = %e, "Worker runner error");
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
    let token = state.token_storage.get_token().ok().flatten();

    let token = match token {
        Some(t) => t,
        None => {
            tracing::debug!("No token available, skipping worker check");
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
            tracing::debug!("No AI provider configured, skipping worker check");
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
        tracing::debug!(
            instance_count,
            scheduler_state = ?state,
            running_worker = ?running_worker,
            "Scheduler status"
        );

        // Check if scheduler is paused
        if matches!(state, SchedulerState::Paused { .. }) {
            tracing::debug!("Scheduler is paused");
            return Ok(());
        }

        sched.next_ready()
    };

    let instance_id = match instance_id {
        Some(id) => id,
        None => {
            tracing::debug!("No workers ready");
            return Ok(());
        }
    };

    tracing::info!(instance_id = %instance_id, "Running worker");

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

    tracing::debug!(
        worker_id = %worker_id,
        space_id = %space_id,
        room_id = %room_id,
        "Got worker instance"
    );

    // Get the worker definition
    let definition = definitions::get_definition(&worker_id)
        .ok_or_else(|| RunnerError::DefinitionNotFound(worker_id.clone()))?;

    tracing::debug!(definition_name = %definition.name, "Got worker definition");

    // Get base URL
    let base_url = {
        let url = state.base_url.lock().unwrap();
        url.clone()
    };

    tracing::debug!(base_url = %base_url, "Using API base URL");

    // Create API client
    let client = Client::new();
    let api = std::sync::Arc::new(NetdataApi::new(client, base_url, token));

    // Create JS bridge for UI tools
    let bridge = JsBridge::new(app_handle.clone());

    // Setup worker tab BEFORE starting CLI (avoids race conditions)
    tracing::debug!("Setting up worker tab...");
    let tab_id = bridge
        .setup_worker_tab(&definition.id, &definition.name, &space_id, &room_id)
        .await
        .map_err(|e| RunnerError::TabSetupFailed(e.to_string()))?;

    tracing::debug!(tab_id = %tab_id, "Worker tab ready");

    tracing::info!(provider = ?provider, "Starting CLI");

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

    tracing::debug!("CLI finished");

    // Mark worker complete
    let success = match &result {
        Ok(run_result) => {
            if run_result.success {
                tracing::info!(instance_id = %instance_id, "Worker completed successfully");
                true
            } else {
                tracing::warn!(
                    instance_id = %instance_id,
                    exit_code = ?run_result.exit_code,
                    "Worker failed"
                );
                // Log stderr for debugging
                if !run_result.stderr.is_empty() {
                    tracing::warn!(stderr = %run_result.stderr, "Worker stderr output");
                }
                false
            }
        }
        Err(e) => {
            tracing::error!(instance_id = %instance_id, error = %e, "Worker execution error");
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
            tracing::info!(
                instance_id = %instance_id,
                seconds_until_next,
                minutes_until_next = seconds_until_next / 60,
                "Scheduled next worker run"
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
    /// Failed to setup worker tab.
    TabSetupFailed(String),
}

impl std::fmt::Display for RunnerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RunnerError::InstanceNotFound(id) => write!(f, "Worker instance not found: {}", id),
            RunnerError::DefinitionNotFound(id) => write!(f, "Worker definition not found: {}", id),
            RunnerError::TabSetupFailed(msg) => write!(f, "Failed to setup worker tab: {}", msg),
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
