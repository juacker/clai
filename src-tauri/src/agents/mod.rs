//! AI Agents infrastructure.
//!
//! This module provides the core infrastructure for autonomous AI agents
//! that can monitor Netdata spaces, analyze data, and present insights.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                        AGENT SYSTEM                             │
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
//! - **types** - Core type definitions (AgentDefinition, AgentInstance)
//! - **definitions** - Agent definitions (prompts, intervals, tools)
//! - **scheduler** - Manages when agents should run (one at a time)
//! - **cli_runner** - Spawns AI CLIs with MCP server
//! - **runner** - Background loop that checks scheduler and runs agents

pub mod cli_runner;
pub mod definitions;
pub mod init;
pub mod runner;
pub mod scheduler;
pub mod template;
pub mod types;

// Re-export main types for convenience
pub use types::AgentDefinition;

// Scheduler exports (used by lib.rs and runner)
pub use scheduler::{create_shared_scheduler, SchedulerState, SharedScheduler};

// Runner export (used by lib.rs)
pub use runner::start_agent_runner;
