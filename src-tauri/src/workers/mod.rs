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
//! │  │  Definition  │───▶│   Instance   │───▶│  CLI Runner  │     │
//! │  │  (template)  │    │ (per space)  │    │  (AI CLI)    │     │
//! │  └──────────────┘    └──────────────┘    └──────────────┘     │
//! │                              │                   │              │
//! │                              ▼                   ▼              │
//! │                      ┌──────────────┐    ┌──────────────┐     │
//! │                      │  Scheduler   │    │  MCP Server  │     │
//! │                      │ (when to run)│    │  (tools)     │     │
//! │                      └──────────────┘    └──────────────┘     │
//! └─────────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Components
//!
//! - **types** - Core type definitions (WorkerDefinition, WorkerInstance)
//! - **definitions** - Worker definitions (prompts, intervals, tools)
//! - **scheduler** - Manages when workers should run (one at a time)
//! - **cli_runner** - Spawns AI CLIs with MCP server
//! - **runner** - Background loop that checks scheduler and runs workers

pub mod cli_runner;
pub mod definitions;
pub mod init;
pub mod runner;
pub mod scheduler;
pub mod types;

// Re-export main types for convenience
pub use types::WorkerDefinition;

// Scheduler exports (used by lib.rs and runner)
pub use scheduler::{create_shared_scheduler, SchedulerState, SharedScheduler};

// Runner export (used by lib.rs)
pub use runner::start_worker_runner;
