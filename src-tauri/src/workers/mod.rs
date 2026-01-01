//! AI Workers infrastructure.
//!
//! This module provides the core infrastructure for autonomous AI workers
//! that can monitor Netdata spaces, analyze data, and present insights.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                        WORKER SYSTEM                            │
//! │                                                                 │
//! │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
//! │  │  Definition  │───▶│   Instance   │───▶│   Executor   │     │
//! │  │  (template)  │    │ (per space)  │    │  (runs work) │     │
//! │  └──────────────┘    └──────────────┘    └──────────────┘     │
//! │                              │                   │              │
//! │                              ▼                   ▼              │
//! │                      ┌──────────────┐    ┌──────────────┐     │
//! │                      │  Scheduler   │    │  AI Service  │     │
//! │                      │ (when to run)│    │  (analysis)  │     │
//! │                      └──────────────┘    └──────────────┘     │
//! └─────────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Components
//!
//! - **types** - Core type definitions (WorkerDefinition, WorkerInstance, WorkerResult)
//! - **scheduler** - Manages when workers should run (one at a time)
//! - **executor** - Executes worker logic via WorkerHandler trait
//!
//! # Example
//!
//! ```rust,ignore
//! // Create a worker definition
//! let definition = WorkerDefinition::new("anomaly-investigator", "Anomaly Investigator", 60_000)
//!     .with_description("Investigates anomalies in metrics")
//!     .with_tools(vec!["canvas", "notifications"]);
//!
//! // Register with scheduler
//! scheduler.register_definition(definition);
//!
//! // Create an instance for a specific space/room
//! let instance_id = scheduler.create_instance("anomaly-investigator", space_id, room_id);
//!
//! // Check for ready workers and execute
//! if let Some(instance_id) = scheduler.next_ready() {
//!     let instance = scheduler.get_instance(&instance_id).unwrap();
//!     let result = executor.execute(instance, &context).await;
//!     scheduler.complete_worker(&instance_id, result.success);
//! }
//! ```

pub mod cli_runner;
pub mod executor;
pub mod init;
pub mod scheduler;
pub mod types;

// Re-export main types for convenience
pub use types::{WorkerDefinition, WorkerInstance, WorkerResult};

pub use scheduler::{create_shared_scheduler, Scheduler, SchedulerState, SharedScheduler};

pub use executor::{Executor, ToolInvocation, ToolResult, WorkerHandler, WorkerRunContext};

pub use cli_runner::{run_ai_cli, CliRunResult, CliRunnerError, WorkerExecutionHandle};
