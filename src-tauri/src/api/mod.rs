//! API module for Netdata Cloud communication.
//!
//! This module contains:
//! - `client` - HTTP client configuration
//! - `error` - API error types
//! - `netdata` - Netdata Cloud API implementation
//! - `ai` - AI Service for worker analysis

pub mod ai;
pub mod client;
pub mod error;
pub mod netdata;
