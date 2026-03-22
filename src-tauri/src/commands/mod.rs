//! Tauri commands module.
//!
//! This module exposes Rust functionality to the JavaScript frontend.
//! Each submodule contains related commands grouped by functionality.

pub mod agents;
pub mod api;
pub mod assistant;
pub mod auth;
pub mod autopilot;
pub mod bridge;
pub mod provider;
pub mod provider_sessions;
pub mod workspace;
