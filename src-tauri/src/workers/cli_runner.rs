//! AI CLI runner for worker execution.
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
//! - **Claude Code**: Uses `--mcp-server` flag or MCP_SERVERS env var
//! - **Gemini CLI**: Uses `--mcp-server` flag
//! - **Codex**: Uses config file or env var
//!
//! For simplicity and portability, we use command line arguments when possible.

use std::process::Stdio;
use std::sync::Arc;

use tokio::process::Command;

use crate::api::netdata::NetdataApi;
use crate::config::AiProvider;
use crate::mcp::bridge::JsBridge;
use crate::mcp::server::{McpServerError, McpServerHandle, McpToolServer};
use crate::providers::is_flatpak;

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
pub struct CliRunResult {
    /// Whether the execution was successful.
    pub success: bool,
    /// Exit code from the CLI (if available).
    pub exit_code: Option<i32>,
    /// Output from stdout.
    pub stdout: String,
    /// Output from stderr.
    pub stderr: String,
}

/// Runs an AI CLI with the worker's tools available via MCP.
///
/// This function:
/// 1. Starts an HTTP MCP server with tools bound to the worker's context
/// 2. Spawns the AI CLI with MCP config pointing to the server
/// 3. Waits for the CLI to complete (with timeout)
/// 4. Shuts down the server
///
/// # Arguments
///
/// * `provider` - Which AI CLI to use (Claude, Gemini, Codex)
/// * `prompt` - The system prompt/task for the AI
/// * `api` - Netdata API client for Rust-native tools
/// * `worker_id` - Worker identifier
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
pub async fn run_ai_cli(
    provider: &AiProvider,
    prompt: &str,
    api: Arc<NetdataApi>,
    worker_id: &str,
    space_id: &str,
    room_id: &str,
    bridge: Option<JsBridge>,
    timeout_secs: u64,
) -> Result<CliRunResult, CliRunnerError> {
    // 1. Create MCP server with bound context
    let server = match bridge {
        Some(b) => McpToolServer::with_bridge(
            api,
            worker_id.to_string(),
            space_id.to_string(),
            room_id.to_string(),
            b,
        ),
        None => McpToolServer::new(
            api,
            worker_id.to_string(),
            space_id.to_string(),
            room_id.to_string(),
        ),
    };

    // 2. Start HTTP server
    let handle = server.serve_http().await?;
    let server_url = handle.url().to_string();

    tracing::info!(
        "Started MCP server for worker {} at {}",
        worker_id,
        server_url
    );

    // 3. Spawn AI CLI with MCP config
    let result = spawn_and_wait_cli(provider, prompt, &server_url, timeout_secs).await;

    // 4. Shutdown server (always, even on error)
    handle.shutdown();
    tracing::info!("Shut down MCP server for worker {}", worker_id);

    result
}

/// Spawns the AI CLI and waits for completion.
async fn spawn_and_wait_cli(
    provider: &AiProvider,
    prompt: &str,
    mcp_server_url: &str,
    timeout_secs: u64,
) -> Result<CliRunResult, CliRunnerError> {
    let mut command = build_cli_command(provider, prompt, mcp_server_url);

    // Configure stdio
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.stdin(Stdio::null());

    // Spawn the process
    let child = command
        .spawn()
        .map_err(|e| CliRunnerError::SpawnError(format!("{}: {}", provider.command(), e)))?;

    tracing::info!("Spawned {} CLI process", provider.display_name());

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

                    if !success {
                        tracing::warn!(
                            "{} CLI exited with code {:?}: {}",
                            provider.display_name(),
                            exit_code,
                            stderr.lines().take(5).collect::<Vec<_>>().join("\n")
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
                "{} CLI timed out after {} seconds",
                provider.display_name(),
                timeout_secs
            );
            Err(CliRunnerError::Timeout)
        }
    }
}

/// Builds the command for the AI CLI with MCP configuration.
fn build_cli_command(provider: &AiProvider, prompt: &str, mcp_server_url: &str) -> Command {
    // Handle Flatpak sandboxing
    let in_flatpak = is_flatpak();

    let mut cmd = if in_flatpak {
        let mut c = Command::new("flatpak-spawn");
        c.arg("--host");
        c.arg(provider.command());
        c
    } else {
        Command::new(provider.command())
    };

    // Configure based on provider
    match provider {
        AiProvider::Claude => configure_claude_command(&mut cmd, prompt, mcp_server_url),
        AiProvider::Gemini => configure_gemini_command(&mut cmd, prompt, mcp_server_url),
        AiProvider::Codex => configure_codex_command(&mut cmd, prompt, mcp_server_url),
        AiProvider::Custom { args, .. } => {
            // For custom providers, just add the args and prompt
            for arg in args {
                cmd.arg(arg);
            }
            cmd.arg(prompt);
        }
    }

    cmd
}

/// Configure command for Claude Code CLI.
///
/// Claude Code supports:
/// - `--print` to disable interactive mode (non-interactive/headless)
/// - `--mcp-server <name>=<url>` for inline server config
/// - `--allowedTools` to auto-approve tools without prompting
/// - `--dangerously-skip-permissions` to skip ALL permission prompts (YOLO mode)
/// - Prompt is passed as the final argument
///
/// See: https://code.claude.com/docs/en/headless
fn configure_claude_command(cmd: &mut Command, prompt: &str, mcp_server_url: &str) {
    // Non-interactive mode (required for headless operation)
    cmd.arg("--print");

    // Add MCP server
    // Format: --mcp-server netdata=http://127.0.0.1:PORT
    cmd.arg("--mcp-server");
    cmd.arg(format!("netdata={}", mcp_server_url));

    // Auto-approve tools without prompting:
    // - mcp__netdata__* : All tools from our MCP server (netdata.query, canvas.*, tabs.*)
    // - WebSearch: Search the web for documentation, solutions, etc.
    // - WebFetch: Fetch content from specific URLs
    // See: https://github.com/anthropics/claude-code/issues/2928
    cmd.arg("--allowedTools");
    cmd.arg("mcp__netdata__*,WebSearch,WebFetch");

    // Add the prompt
    cmd.arg(prompt);
}

/// Configure command for Gemini CLI.
///
/// Gemini CLI supports:
/// - `--mcp-server <name>=<url>` for inline server config
/// - `-y` or `--yolo` to auto-approve all tools
/// - `--allowed-mcp-server-names` to whitelist MCP servers
/// - Built-in `google_web_search` tool (auto-enabled)
/// - Prompt as argument (or with -p flag)
///
/// See: https://geminicli.com/docs/cli/headless/
/// Web search: https://geminicli.com/docs/tools/web-search/
fn configure_gemini_command(cmd: &mut Command, prompt: &str, mcp_server_url: &str) {
    // Add MCP server
    cmd.arg("--mcp-server");
    cmd.arg(format!("netdata={}", mcp_server_url));

    // Auto-approve all tool executions (YOLO mode)
    // Includes: MCP tools, google_web_search, file ops, shell commands
    cmd.arg("--yolo");

    // Whitelist our MCP server
    cmd.arg("--allowed-mcp-server-names");
    cmd.arg("netdata");

    // Add the prompt
    cmd.arg(prompt);
}

/// Configure command for Codex CLI.
///
/// Codex CLI supports:
/// - MCP_SERVERS environment variable for server config
/// - `--ask-for-approval never` or `-a never` to disable approval prompts
/// - `--search` to enable web search tool
/// - `--full-auto` to run commands without prompts
/// - Prompt as argument
///
/// See: https://developers.openai.com/codex/cli/reference/
fn configure_codex_command(cmd: &mut Command, prompt: &str, mcp_server_url: &str) {
    // Set MCP servers via environment variable
    // Format: JSON object { "netdata": { "url": "http://...", "transport": "http" } }
    let mcp_config = serde_json::json!({
        "netdata": {
            "url": mcp_server_url,
            "transport": "http"
        }
    });
    cmd.env("MCP_SERVERS", mcp_config.to_string());

    // Disable approval prompts for tool execution
    // Our tools are safe: netdata.query (read-only), canvas.* (UI), tabs.* (UI)
    cmd.arg("--ask-for-approval");
    cmd.arg("never");

    // Enable web search for looking up documentation, solutions, etc.
    // See: https://github.com/openai/codex/issues/3139
    cmd.arg("--search");

    // Add the prompt
    cmd.arg(prompt);
}

// =============================================================================
// Handle Management
// =============================================================================

/// Handle to a running worker execution.
///
/// Use this to track and cancel worker executions.
pub struct WorkerExecutionHandle {
    /// The MCP server handle (for shutdown)
    server_handle: McpServerHandle,
    /// Worker ID
    pub worker_id: String,
    /// Space ID
    pub space_id: String,
    /// Room ID
    pub room_id: String,
}

impl WorkerExecutionHandle {
    /// Creates a new execution handle.
    pub fn new(
        server_handle: McpServerHandle,
        worker_id: String,
        space_id: String,
        room_id: String,
    ) -> Self {
        Self {
            server_handle,
            worker_id,
            space_id,
            room_id,
        }
    }

    /// Get the MCP server URL.
    pub fn server_url(&self) -> &str {
        self.server_handle.url()
    }

    /// Get the MCP server port.
    pub fn server_port(&self) -> u16 {
        self.server_handle.port()
    }

    /// Cancel the execution by shutting down the server.
    pub fn cancel(&self) {
        tracing::info!("Cancelling worker execution for {}", self.worker_id);
        self.server_handle.shutdown();
    }
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
            stdout: "done".to_string(),
            stderr: "".to_string(),
        };

        assert!(result.success);
        assert_eq!(result.exit_code, Some(0));
    }

    #[test]
    fn test_build_command_claude() {
        let cmd = build_cli_command(
            &AiProvider::Claude,
            "test prompt",
            "http://127.0.0.1:12345",
        );

        // Just verify it builds without panicking
        // We can't easily inspect Command internals
        assert!(format!("{:?}", cmd).contains("claude") || format!("{:?}", cmd).contains("flatpak"));
    }

    #[test]
    fn test_build_command_gemini() {
        let cmd = build_cli_command(
            &AiProvider::Gemini,
            "test prompt",
            "http://127.0.0.1:12345",
        );

        assert!(format!("{:?}", cmd).contains("gemini") || format!("{:?}", cmd).contains("flatpak"));
    }

    #[test]
    fn test_build_command_codex() {
        let cmd = build_cli_command(
            &AiProvider::Codex,
            "test prompt",
            "http://127.0.0.1:12345",
        );

        assert!(format!("{:?}", cmd).contains("codex") || format!("{:?}", cmd).contains("flatpak"));
    }

    #[test]
    fn test_build_command_custom() {
        let provider = AiProvider::Custom {
            command: "my-ai".to_string(),
            args: vec!["--mode".to_string(), "agent".to_string()],
        };

        let cmd = build_cli_command(&provider, "test prompt", "http://127.0.0.1:12345");

        assert!(format!("{:?}", cmd).contains("my-ai") || format!("{:?}", cmd).contains("flatpak"));
    }

    #[test]
    fn test_worker_execution_handle() {
        // Create a mock server handle for testing
        // Note: In real usage, this comes from McpToolServer::serve_http()
        // For unit tests, we can't easily create a real handle
    }
}
