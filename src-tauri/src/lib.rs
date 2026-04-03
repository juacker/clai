//! CLAI backend runtime.
//!
//! This is the Rust backend for the Tauri-based desktop application.
//! It handles:
//! - Secure token storage via OS keychain
//! - HTTP communication with backend APIs and provider services
//! - Exposing functionality to the JavaScript frontend
//! - Scheduled automations with MCP tool integration
//!
//! # Automation Architecture
//!
//! When an automation is enabled, the app runs it through the assistant engine:
//! 1. Start an HTTP MCP server on localhost (127.0.0.1:PORT)
//! 2. Spawn an AI CLI (Claude Code, Gemini CLI, or Codex) with the server URL
//! 3. The AI CLI connects and uses the available built-in and MCP tools
//! 4. When complete, the server shuts down
//!
//! See `agents::cli_runner` for the execution flow.
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
mod agents;
mod api;
mod assistant;
mod auth;
mod commands;
mod config;
mod db;
mod mcp;
mod providers;

// Re-export for agent execution and testing
pub use mcp::server::McpToolServer;

use std::sync::Mutex;

use agents::SharedScheduler;
use auth::TokenStorage;
use config::ConfigManager;
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

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
    /// Configuration manager for providers, automations, and MCP servers.
    pub config_manager: Mutex<ConfigManager>,
    /// External MCP client registry.
    pub mcp_client_manager: AsyncMutex<mcp::client::McpClientManager>,
    /// Agent scheduler (manages agent instances)
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
    // Initialize tracing (structured logging)
    // In development, this outputs to stderr with colors
    // RUST_LOG env var can control log levels (e.g., RUST_LOG=debug)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("CLAI starting up...");

    // Clear temp directory from previous runs (MCP configs, etc)
    agents::clear_tmp_dir();

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
    let initial_config = config_manager.get();

    // Initialize agent scheduler
    let scheduler = agents::create_shared_scheduler();

    // Register default automation definitions and restore enabled instances
    agents::init::initialize_scheduler(&scheduler, &config_manager, &token_storage);

    // Clone scheduler before moving into state (needed for runner)
    let runner_scheduler = scheduler.clone();

    // Create the shared application state
    let state = AppState {
        token_storage,
        base_url: Mutex::new(DEFAULT_BASE_URL.to_string()),
        config_manager: Mutex::new(config_manager),
        mcp_client_manager: AsyncMutex::new({
            let mut manager = mcp::client::McpClientManager::new();
            manager.sync_from_config(&initial_config);
            manager
        }),
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
            // Initialize database for workspace state persistence
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match db::init_db().await {
                    Ok(pool) => {
                        tracing::info!("Database initialized successfully");
                        app_handle.manage(pool);
                    }
                    Err(e) => {
                        tracing::error!("Failed to initialize database: {}", e);
                        // Database is optional - app can still work without persistence
                    }
                }
            });

            // Start the agent runner background task
            let app_handle = app.handle().clone();
            agents::start_agent_runner(app_handle, runner_scheduler);
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
            // Legacy chart/anomalies API commands
            commands::api::api_get_data,
            commands::api::api_get_contexts,
            // Conversation commands
            commands::api::api_create_conversation,
            commands::api::api_get_conversation,
            commands::api::api_list_conversations,
            commands::api::api_delete_conversation,
            commands::api::api_create_conversation_title,
            commands::api::api_chat_completion,
            // Assistant runtime commands
            commands::assistant::assistant_create_session,
            commands::assistant::assistant_get_session,
            commands::assistant::assistant_list_sessions,
            commands::assistant::assistant_delete_session,
            commands::assistant::assistant_attach_session_to_tab,
            commands::assistant::assistant_load_session_messages,
            commands::assistant::assistant_list_runs,
            commands::assistant::assistant_list_tool_calls,
            commands::assistant::assistant_send_message,
            commands::assistant::assistant_retry_run,
            commands::assistant::assistant_cancel_run,
            commands::assistant::assistant_get_default_model,
            commands::assistant::assistant_set_default_model,
            // Agent commands
            commands::agents::get_agents,
            commands::agents::get_agent,
            commands::agents::create_agent,
            commands::agents::update_agent,
            commands::agents::set_agent_enabled,
            commands::agents::delete_agent,
            // MCP server commands
            commands::mcp_servers::get_mcp_servers,
            commands::mcp_servers::get_mcp_server,
            commands::mcp_servers::create_mcp_server,
            commands::mcp_servers::update_mcp_server,
            commands::mcp_servers::delete_mcp_server,
            // Provider commands
            commands::provider::get_ai_provider,
            commands::provider::set_ai_provider,
            commands::provider::clear_ai_provider,
            commands::provider::get_available_ai_providers,
            commands::provider::validate_ai_provider,
            commands::provider::get_provider_models,
            // Provider session commands for app-owned assistant runtime
            commands::provider_sessions::provider_list_available,
            commands::provider_sessions::provider_connect_api_key,
            commands::provider_sessions::provider_disconnect,
            commands::provider_sessions::provider_get_active_session,
            commands::provider_sessions::provider_list_sessions,
            commands::provider_sessions::provider_list_models,
            // Agent tool bridge commands
            commands::bridge::agent_tool_result,
            commands::bridge::agent_bridge_ready,
            // Workspace state persistence commands
            commands::workspace::load_workspace_state,
            commands::workspace::save_workspace_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
