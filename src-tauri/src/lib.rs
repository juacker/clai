//! CLAI - Netdata AI Desktop Application
//!
//! This is the Rust backend for the Tauri-based desktop application.
//! It handles:
//! - Secure token storage via OS keychain
//! - HTTP communication with Netdata Cloud API
//! - Exposing functionality to the JavaScript frontend
//! - AI Workers with MCP tool integration
//!
//! # AI Workers Architecture
//!
//! When auto-pilot is enabled, the app runs AI workers that:
//! 1. Start an HTTP MCP server on localhost (127.0.0.1:PORT)
//! 2. Spawn an AI CLI (Claude Code, Gemini CLI, or Codex) with the server URL
//! 3. The AI CLI connects and uses tools (netdata.query, canvas.*, tabs.*)
//! 4. When complete, the server shuts down
//!
//! See `workers::cli_runner` for the execution flow.
//!
//! # Rust Learning: Module System
//!
//! Rust organizes code into modules. This file (`lib.rs`) is the crate root
//! for library code. We declare submodules with `mod`, making their contents
//! available under `crate::module_name`.
//!
//! ```ignore
//! mod api;  // Declares src/api/mod.rs as a module
//!           // Contents accessible as crate::api::*
//! ```

// Declare our modules
mod api;
mod auth;
mod commands;
mod config;
mod mcp;
mod providers;
mod workers;

// Re-export for worker execution and testing
pub use mcp::server::McpToolServer;

use std::sync::Mutex;

use auth::TokenStorage;
use config::ConfigManager;
use workers::SharedScheduler;

/// Shared application state accessible from all commands.
///
/// This struct holds all the shared resources that commands need access to.
/// It's registered with Tauri via `.manage()` and injected into commands
/// via `State<'_, AppState>`.
pub struct AppState {
    /// Secure token storage backed by OS keychain
    pub token_storage: TokenStorage,
    /// Current API base URL (protected by mutex for thread safety)
    pub base_url: Mutex<String>,
    /// Configuration manager (auto-pilot settings, etc.)
    pub config_manager: Mutex<ConfigManager>,
    /// Worker scheduler (manages worker instances)
    pub scheduler: SharedScheduler,
}

/// Default base URL for Netdata Cloud API.
const DEFAULT_BASE_URL: &str = "https://app.netdata.cloud";

/// Entry point for the Tauri application.
///
/// # Rust Learning: Conditional Compilation
///
/// `#[cfg_attr(mobile, tauri::mobile_entry_point)]` applies the
/// `mobile_entry_point` attribute only when compiling for mobile.
/// This is how Rust handles platform-specific code.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize token storage (uses OS keychain)
    // If this fails, the app cannot function, so we panic.
    let token_storage = TokenStorage::new().expect(
        "Failed to initialize secure token storage. \
         On Linux, ensure libsecret is installed.",
    );

    // Initialize config manager (loads config from disk or creates default)
    let config_manager = ConfigManager::new().expect(
        "Failed to initialize configuration manager. \
         Check that the config directory is accessible.",
    );

    // Initialize worker scheduler
    let scheduler = workers::create_shared_scheduler();

    // Register default worker definitions and restore instances if logged in
    workers::init::initialize_scheduler(&scheduler, &config_manager, &token_storage);

    // Clone scheduler before moving into state (needed for runner)
    let runner_scheduler = scheduler.clone();

    // Create the shared application state
    let state = AppState {
        token_storage,
        base_url: Mutex::new(DEFAULT_BASE_URL.to_string()),
        config_manager: Mutex::new(config_manager),
        scheduler,
    };

    // Build and run the Tauri application
    tauri::Builder::default()
        // Register Tauri plugins
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Make our state available to all commands
        // Commands can access it via State<'_, AppState>
        .manage(state)
        // Setup hook - runs after app is built, gives us AppHandle
        .setup(move |app| {
            // Start the worker runner background task
            let app_handle = app.handle().clone();
            workers::start_worker_runner(app_handle, runner_scheduler);
            Ok(())
        })
        // Register our custom commands
        // These become available to JS via invoke()
        .invoke_handler(tauri::generate_handler![
            // Authentication commands
            commands::auth::set_token,
            commands::auth::has_token,
            commands::auth::clear_token,
            commands::auth::set_base_url,
            commands::auth::get_base_url,
            // API commands
            commands::api::api_get_user_info,
            commands::api::api_get_spaces,
            commands::api::api_get_rooms,
            commands::api::api_get_billing_plan,
            commands::api::api_get_data,
            commands::api::api_get_contexts,
            // Conversation commands
            commands::api::api_create_conversation,
            commands::api::api_get_conversation,
            commands::api::api_list_conversations,
            commands::api::api_delete_conversation,
            commands::api::api_create_conversation_title,
            commands::api::api_chat_completion,
            // Auto-pilot commands
            commands::autopilot::get_autopilot_status,
            commands::autopilot::set_autopilot_enabled,
            commands::autopilot::get_all_autopilot_enabled,
            // Provider commands
            commands::provider::get_ai_provider,
            commands::provider::set_ai_provider,
            commands::provider::clear_ai_provider,
            commands::provider::get_available_ai_providers,
            commands::provider::validate_ai_provider,
            // Worker tool bridge commands
            commands::bridge::worker_tool_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
