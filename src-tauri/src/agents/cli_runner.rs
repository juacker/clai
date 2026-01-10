//! AI CLI runner for agent execution.
//!
//! This module handles spawning AI CLIs (Claude Code, Gemini CLI, Codex) with
//! MCP configuration pointing to our HTTP server.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────────┐
//! │                     CLI Runner                                   │
//! │                                                                  │
//! │  1. Start MCP HTTP Server (127.0.0.1:PORT)                      │
//! │                      │                                           │
//! │  2. Spawn AI CLI ◄───┴───► MCP Server                           │
//! │                      │                                           │
//! │  3. Wait for completion                                         │
//! │                      │                                           │
//! │  4. Shutdown server                                              │
//! └─────────────────────────────────────────────────────────────────┘
//! ```
//!
//! # AI CLI Configuration
//!
//! Each AI CLI is configured differently:
//!
//! - **Claude Code**: Uses `--mcp-config` flag with inline JSON
//! - **Gemini CLI**: Uses `.gemini/settings.json` file (no CLI flag support)
//! - **Codex**: Uses MCP_SERVERS env var
//!
//! For simplicity and portability, we use command line arguments when possible.

use std::process::Stdio;
use std::sync::Arc;

use tokio::process::Command;

use crate::api::netdata::NetdataApi;
use crate::config::AiProvider;
use crate::mcp::bridge::JsBridge;
use crate::mcp::server::{McpServerError, McpToolServer};
use crate::providers::{is_flatpak, resolve_command_path};

// =============================================================================
// Error Types
// =============================================================================

/// Errors that can occur during CLI execution.
#[derive(Debug, Clone)]
pub enum CliRunnerError {
    /// Failed to start MCP server.
    ServerError(String),
    /// Failed to spawn CLI process.
    SpawnError(String),
    /// CLI process exited with error.
    ExecutionError(String),
    /// Timeout waiting for CLI.
    Timeout,
}

impl std::fmt::Display for CliRunnerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CliRunnerError::ServerError(msg) => write!(f, "MCP server error: {}", msg),
            CliRunnerError::SpawnError(msg) => write!(f, "Failed to spawn CLI: {}", msg),
            CliRunnerError::ExecutionError(msg) => write!(f, "CLI execution failed: {}", msg),
            CliRunnerError::Timeout => write!(f, "CLI execution timed out"),
        }
    }
}

impl std::error::Error for CliRunnerError {}

impl From<McpServerError> for CliRunnerError {
    fn from(e: McpServerError) -> Self {
        CliRunnerError::ServerError(e.to_string())
    }
}

// =============================================================================
// CLI Runner
// =============================================================================

/// Result of a CLI execution.
#[derive(Debug, Clone)]
#[allow(dead_code)] // stdout may be used for logging/debugging in the future
pub struct CliRunResult {
    /// Whether the execution was successful.
    pub success: bool,
    /// Exit code from the CLI (if available).
    pub exit_code: Option<i32>,
    /// Output from stdout (Claude's response in --print mode).
    pub stdout: String,
    /// Output from stderr.
    pub stderr: String,
}

/// Runs an AI CLI with the agent's tools available via MCP.
///
/// This function:
/// 1. Starts an HTTP MCP server with tools bound to the agent's context
/// 2. Spawns the AI CLI with MCP config pointing to the server
/// 3. Waits for the CLI to complete (with timeout)
/// 4. Shuts down the server
///
/// # Arguments
///
/// * `provider` - Which AI CLI to use (Claude, Gemini, Codex)
/// * `prompt` - The system prompt/task for the AI
/// * `api` - Netdata API client for Rust-native tools
/// * `agent_id` - Agent identifier
/// * `space_id` - Space context
/// * `room_id` - Room context
/// * `bridge` - JS bridge for UI tools (optional)
/// * `timeout_secs` - Maximum execution time in seconds
///
/// # Example
///
/// ```rust,ignore
/// let result = run_ai_cli(
///     &AiProvider::Claude,
///     "Check for anomalies and report findings",
///     api,
///     "anomaly-investigator",
///     "space-123",
///     "room-456",
///     Some(bridge),
///     300, // 5 minutes
/// ).await?;
/// ```
#[allow(clippy::too_many_arguments)]
pub async fn run_ai_cli(
    provider: &AiProvider,
    prompt: &str,
    api: Arc<NetdataApi>,
    agent_id: &str,
    space_id: &str,
    room_id: &str,
    bridge: Option<JsBridge>,
    timeout_secs: u64,
) -> Result<CliRunResult, CliRunnerError> {
    tracing::debug!(agent_id = %agent_id, "Creating MCP server for agent");

    // 1. Create MCP server with bound context
    let server = match bridge {
        Some(b) => McpToolServer::with_bridge(
            api,
            agent_id.to_string(),
            space_id.to_string(),
            room_id.to_string(),
            b,
        ),
        None => McpToolServer::new(
            api,
            agent_id.to_string(),
            space_id.to_string(),
            room_id.to_string(),
        ),
    };

    tracing::debug!("Starting HTTP server...");

    // 2. Start HTTP server
    let handle = server.serve_http().await?;
    let server_url = handle.url().to_string();

    tracing::info!(server_url = %server_url, "MCP server started");

    // 3. Spawn AI CLI with MCP config
    tracing::debug!("Spawning CLI...");
    let result = spawn_and_wait_cli(provider, prompt, &server_url, timeout_secs).await;
    tracing::debug!(success = result.is_ok(), "CLI finished");

    // 4. Shutdown server (always, even on error)
    handle.shutdown();
    tracing::debug!("MCP server shut down");

    result
}

/// Spawns the AI CLI and waits for completion.
async fn spawn_and_wait_cli(
    provider: &AiProvider,
    prompt: &str,
    mcp_server_url: &str,
    timeout_secs: u64,
) -> Result<CliRunResult, CliRunnerError> {
    let mut command = build_cli_command(provider, mcp_server_url);

    tracing::debug!(command = ?command, "Built CLI command");

    // Configure stdio - use piped stdin to pass the prompt
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.stdin(Stdio::piped());

    // Spawn the process
    tracing::debug!("Spawning process...");
    let mut child = command
        .spawn()
        .map_err(|e| CliRunnerError::SpawnError(format!("{}: {}", provider.command(), e)))?;

    // Write prompt to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        if let Err(e) = stdin.write_all(prompt.as_bytes()).await {
            return Err(CliRunnerError::SpawnError(format!(
                "Failed to write prompt to stdin: {}",
                e
            )));
        }
        // Close stdin to signal end of input
        drop(stdin);
    }

    tracing::debug!(timeout_secs, "Process spawned, waiting...");

    // Wait with timeout using select
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(timeout_secs));
    tokio::pin!(timeout);

    // wait_with_output() consumes self, so we can't kill after timeout
    // Instead, spawn a task and use select
    let output_future = child.wait_with_output();

    tokio::select! {
        result = output_future => {
            match result {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let success = output.status.success();
                    let exit_code = output.status.code();

                    // Log Claude's response (stdout in --print mode)
                    if !stdout.is_empty() {
                        // Print first 500 chars to avoid flooding logs
                        let preview: String = stdout.chars().take(500).collect();
                        let truncated = stdout.len() > 500;
                        tracing::debug!(
                            stdout_len = stdout.len(),
                            truncated,
                            preview = %preview,
                            "CLI stdout"
                        );
                    } else {
                        tracing::debug!("CLI stdout: (empty)");
                    }

                    if !success {
                        let stderr_preview: String = stderr.lines().take(5).collect::<Vec<_>>().join("\n");
                        tracing::warn!(
                            provider = %provider.display_name(),
                            exit_code = ?exit_code,
                            stderr = %stderr_preview,
                            "CLI exited with error"
                        );
                    }

                    Ok(CliRunResult {
                        success,
                        exit_code,
                        stdout,
                        stderr,
                    })
                }
                Err(e) => Err(CliRunnerError::ExecutionError(e.to_string())),
            }
        }
        _ = &mut timeout => {
            // Timeout - the process will be dropped and cleaned up
            // Note: wait_with_output consumed the child, but select! ensures
            // the future is cancelled, which should clean up the process
            tracing::warn!(
                provider = %provider.display_name(),
                timeout_secs,
                "CLI timed out"
            );
            Err(CliRunnerError::Timeout)
        }
    }
}

/// Builds the command for the AI CLI with MCP configuration.
///
/// Note: The prompt is passed via stdin, not as a command argument.
/// This handles long multi-line prompts more reliably.
fn build_cli_command(provider: &AiProvider, mcp_server_url: &str) -> Command {
    // Handle Flatpak sandboxing
    let in_flatpak = is_flatpak();

    // Resolve the full path to the command (checks PATH + user directories)
    let cmd_path = resolve_command_path(provider.command());

    let mut cmd = if in_flatpak {
        let mut c = Command::new("flatpak-spawn");
        c.arg("--host");
        c.arg(&cmd_path);
        c
    } else {
        Command::new(&cmd_path)
    };

    // Configure based on provider
    match provider {
        AiProvider::OpenCode { model } => {
            configure_opencode_command(&mut cmd, mcp_server_url, model.as_deref())
        }
        AiProvider::Claude { model } => {
            configure_claude_command(&mut cmd, mcp_server_url, model.as_deref())
        }
        AiProvider::Gemini { model } => {
            configure_gemini_command(&mut cmd, mcp_server_url, model.as_deref())
        }
        AiProvider::Codex { model } => {
            configure_codex_command(&mut cmd, mcp_server_url, model.as_deref())
        }
        AiProvider::Custom { args, .. } => {
            // For custom providers, just add the args (prompt via stdin)
            for arg in args {
                cmd.arg(arg);
            }
        }
    }

    cmd
}

/// Configure command for OpenCode CLI.
///
/// OpenCode supports:
/// - `run` subcommand for non-interactive execution
/// - `--model provider/model` to select a specific model (e.g., "anthropic/claude-sonnet-4-5")
/// - `--format json` for JSON output
/// - MCP servers via config file (similar to Gemini)
/// - Prompt via stdin or as argument
///
/// MCP Configuration:
/// OpenCode requires MCP servers to be configured in a JSON config file.
/// We create a config file at `~/.config/clai/tmp/opencode-<id>.json` and
/// pass it via the `OPENCODE_CONFIG` environment variable.
///
/// See: https://opencode.ai/docs/cli/
/// See: https://opencode.ai/docs/config/
fn configure_opencode_command(cmd: &mut Command, mcp_server_url: &str, model: Option<&str>) {
    // Get the clai tmp directory, fallback to system temp if unavailable
    let base_dir = get_clai_tmp_dir().unwrap_or_else(std::env::temp_dir);

    // Ensure the directory exists
    if let Err(e) = std::fs::create_dir_all(&base_dir) {
        tracing::error!(error = %e, path = %base_dir.display(), "Failed to create MCP servers directory");
    }

    // Create unique config file per request since multiple MCP servers can run concurrently
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let config_path = base_dir.join(format!(
        "opencode-{}-{}.json",
        std::process::id(),
        unique_id
    ));

    // Write config file with MCP server config
    // OpenCode uses similar format to Gemini for MCP servers
    let config = serde_json::json!({
        "mcp": {
            "netdata": {
                "type": "remote",
                "url": mcp_server_url,
                "enabled": true
            }
        }
    });

    if let Err(e) = std::fs::write(&config_path, config.to_string()) {
        tracing::error!(error = %e, path = %config_path.display(), "Failed to write OpenCode config");
    } else {
        tracing::debug!(path = %config_path.display(), "Created OpenCode MCP config");
        // Pass config via OPENCODE_CONFIG environment variable
        cmd.env("OPENCODE_CONFIG", &config_path);
    }

    // Use 'run' subcommand for non-interactive execution
    cmd.arg("run");

    // Set model if specified (format: provider/model)
    if let Some(model_name) = model {
        cmd.arg("--model");
        cmd.arg(model_name);
    }

    // Prompt will be provided as argument after 'run' subcommand
    // Note: OpenCode run accepts prompt as positional argument, not stdin
}

/// Configure command for Claude Code CLI.
///
/// Claude Code supports:
/// - `--print` to disable interactive mode (non-interactive/headless)
/// - `--mcp-config <path>` to specify MCP config file
/// - `--allowedTools` to auto-approve tools without prompting
/// - `--model` to select a specific model
/// - Prompt is passed via stdin (piped)
///
/// For MCP servers, we pass the config via JSON file or inline JSON.
/// See: https://code.claude.com/docs/en/mcp
fn configure_claude_command(cmd: &mut Command, mcp_server_url: &str, model: Option<&str>) {
    // Non-interactive mode (required for headless operation)
    // Prompt will be provided via stdin
    cmd.arg("--print");

    // Set model if specified
    if let Some(model_name) = model {
        cmd.arg("--model");
        cmd.arg(model_name);
    }

    // Add MCP server config via JSON
    // Format: {"mcpServers": {"netdata": {"type": "http", "url": "<url>"}}}
    let mcp_config = serde_json::json!({
        "mcpServers": {
            "netdata": {
                "type": "http",
                "url": mcp_server_url
            }
        }
    });
    cmd.arg("--mcp-config");
    cmd.arg(mcp_config.to_string());

    // Auto-approve tools without prompting:
    // - mcp__netdata__* : All tools from our MCP server (netdata.query, canvas.*, tabs.*)
    // - WebSearch: Search the web for documentation, solutions, etc.
    // - WebFetch: Fetch content from specific URLs
    cmd.arg("--allowedTools");
    cmd.arg("mcp__netdata__*,WebSearch,WebFetch");
}

/// Gets the clai temp directory for ephemeral files (MCP configs, etc).
///
/// Structure:
/// - Linux: `~/.config/clai/tmp/`
/// - macOS: `~/Library/Application Support/clai/tmp/`
/// - Windows: `%APPDATA%/clai/tmp/`
///
/// This directory is cleared on application startup.
fn get_clai_tmp_dir() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("clai").join("tmp"))
}

/// Clears the clai temp directory.
///
/// Call this on application startup to clean up ephemeral files from previous runs
/// (MCP config files, etc). Safe to call even if the directory doesn't exist.
pub fn clear_tmp_dir() {
    if let Some(tmp_dir) = get_clai_tmp_dir() {
        if tmp_dir.exists() {
            match std::fs::remove_dir_all(&tmp_dir) {
                Ok(_) => tracing::debug!(path = %tmp_dir.display(), "Cleared clai tmp directory"),
                Err(e) => {
                    tracing::warn!(error = %e, path = %tmp_dir.display(), "Failed to clear clai tmp directory")
                }
            }
        }
    }
}

/// Configure command for Gemini CLI.
///
/// Gemini CLI supports:
/// - MCP servers via `settings.json` file (NOT command-line args)
/// - `-y` or `--yolo` to auto-approve all tools
/// - `--allowed-mcp-server-names` to whitelist MCP servers
/// - `--model` or GEMINI_MODEL env var to select model
/// - Built-in `google_web_search` tool (auto-enabled)
/// - Prompt via stdin or as argument
///
/// MCP Configuration:
/// Gemini CLI requires MCP servers to be configured in a settings.json file.
/// We create a config file at `~/.config/clai/tmp/gemini-<id>.json` and
/// pass it via the `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` environment variable.
///
/// See: https://geminicli.com/docs/tools/mcp-server/
/// Web search: https://geminicli.com/docs/tools/web-search/
fn configure_gemini_command(cmd: &mut Command, mcp_server_url: &str, model: Option<&str>) {
    // Get the clai tmp directory, fallback to system temp if unavailable
    let base_dir = get_clai_tmp_dir().unwrap_or_else(std::env::temp_dir);

    // Ensure the directory exists
    if let Err(e) = std::fs::create_dir_all(&base_dir) {
        tracing::error!(error = %e, path = %base_dir.display(), "Failed to create MCP servers directory");
    }

    // Create unique config file per request since multiple MCP servers can run concurrently
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let config_path = base_dir.join(format!("gemini-{}-{}.json", std::process::id(), unique_id));

    // Write settings.json with MCP server config
    let settings = serde_json::json!({
        "mcpServers": {
            "netdata": {
                "httpUrl": mcp_server_url,
                "trust": true
            }
        }
    });

    if let Err(e) = std::fs::write(&config_path, settings.to_string()) {
        tracing::error!(error = %e, path = %config_path.display(), "Failed to write Gemini config");
    } else {
        tracing::debug!(path = %config_path.display(), "Created Gemini MCP config");
        // Pass config via GEMINI_CLI_SYSTEM_DEFAULTS_PATH environment variable
        cmd.env("GEMINI_CLI_SYSTEM_DEFAULTS_PATH", &config_path);
    }

    // Set model via environment variable (more reliable than --model flag)
    if let Some(model_name) = model {
        cmd.env("GEMINI_MODEL", model_name);
    }

    // Auto-approve all tool executions (YOLO mode)
    // Includes: MCP tools, google_web_search, file ops, shell commands
    cmd.arg("--yolo");

    // Whitelist our MCP server
    cmd.arg("--allowed-mcp-server-names");
    cmd.arg("netdata");

    // Prompt will be provided via stdin
}

/// Configure command for Codex CLI.
///
/// Codex CLI supports:
/// - MCP_SERVERS environment variable for server config
/// - `--ask-for-approval never` or `-a never` to disable approval prompts
/// - `--search` to enable web search tool
/// - `--model` to select a specific model
/// - `--full-auto` to run commands without prompts
/// - Prompt via stdin or as argument
///
/// See: https://developers.openai.com/codex/cli/reference/
fn configure_codex_command(cmd: &mut Command, mcp_server_url: &str, model: Option<&str>) {
    // Set MCP servers via environment variable
    // Format: JSON object { "netdata": { "url": "http://...", "transport": "http" } }
    let mcp_config = serde_json::json!({
        "netdata": {
            "url": mcp_server_url,
            "transport": "http"
        }
    });
    cmd.env("MCP_SERVERS", mcp_config.to_string());

    // Set model if specified
    if let Some(model_name) = model {
        cmd.arg("--model");
        cmd.arg(model_name);
    }

    // Disable approval prompts for tool execution
    // Our tools are safe: netdata.query (read-only), canvas.* (UI), tabs.* (UI)
    cmd.arg("--ask-for-approval");
    cmd.arg("never");

    // Enable web search for looking up documentation, solutions, etc.
    // See: https://github.com/openai/codex/issues/3139
    cmd.arg("--search");

    // Prompt will be provided via stdin
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_runner_error_display() {
        let err = CliRunnerError::ServerError("bind failed".to_string());
        assert!(err.to_string().contains("MCP server error"));

        let err = CliRunnerError::SpawnError("command not found".to_string());
        assert!(err.to_string().contains("spawn CLI"));

        let err = CliRunnerError::Timeout;
        assert!(err.to_string().contains("timed out"));
    }

    #[test]
    fn test_cli_run_result() {
        let result = CliRunResult {
            success: true,
            exit_code: Some(0),
            stdout: "Claude's response".to_string(),
            stderr: "".to_string(),
        };

        assert!(result.success);
        assert_eq!(result.exit_code, Some(0));
        assert!(!result.stdout.is_empty());
    }

    #[test]
    fn test_build_command_opencode() {
        let cmd = build_cli_command(
            &AiProvider::OpenCode { model: None },
            "http://127.0.0.1:12345",
        );

        // Verify it builds without panicking
        assert!(
            format!("{:?}", cmd).contains("opencode") || format!("{:?}", cmd).contains("flatpak")
        );
    }

    #[test]
    fn test_build_command_opencode_with_model() {
        let cmd = build_cli_command(
            &AiProvider::OpenCode {
                model: Some("anthropic/claude-sonnet-4-5".to_string()),
            },
            "http://127.0.0.1:12345",
        );

        // Verify it builds and contains model argument
        let cmd_str = format!("{:?}", cmd);
        assert!(cmd_str.contains("opencode") || cmd_str.contains("flatpak"));
    }

    #[test]
    fn test_build_command_claude() {
        let cmd = build_cli_command(
            &AiProvider::Claude { model: None },
            "http://127.0.0.1:12345",
        );

        // Just verify it builds without panicking
        // We can't easily inspect Command internals
        assert!(
            format!("{:?}", cmd).contains("claude") || format!("{:?}", cmd).contains("flatpak")
        );
    }

    #[test]
    fn test_build_command_claude_with_model() {
        let cmd = build_cli_command(
            &AiProvider::Claude {
                model: Some("sonnet".to_string()),
            },
            "http://127.0.0.1:12345",
        );

        // Verify it builds and contains model argument
        let cmd_str = format!("{:?}", cmd);
        assert!(cmd_str.contains("claude") || cmd_str.contains("flatpak"));
    }

    #[test]
    fn test_build_command_gemini() {
        let cmd = build_cli_command(
            &AiProvider::Gemini { model: None },
            "http://127.0.0.1:12345",
        );

        assert!(
            format!("{:?}", cmd).contains("gemini") || format!("{:?}", cmd).contains("flatpak")
        );
    }

    #[test]
    fn test_build_command_codex() {
        let cmd = build_cli_command(&AiProvider::Codex { model: None }, "http://127.0.0.1:12345");

        assert!(format!("{:?}", cmd).contains("codex") || format!("{:?}", cmd).contains("flatpak"));
    }

    #[test]
    fn test_build_command_custom() {
        let provider = AiProvider::Custom {
            command: "my-ai".to_string(),
            args: vec!["--mode".to_string(), "agent".to_string()],
            model: None,
        };

        let cmd = build_cli_command(&provider, "http://127.0.0.1:12345");

        assert!(format!("{:?}", cmd).contains("my-ai") || format!("{:?}", cmd).contains("flatpak"));
    }
}
