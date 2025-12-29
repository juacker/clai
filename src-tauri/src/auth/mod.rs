//! Authentication module for secure token management.
//!
//! This module handles secure storage of API tokens using the OS keychain.

pub mod token;

// Re-export the main type
pub use token::TokenStorage;
