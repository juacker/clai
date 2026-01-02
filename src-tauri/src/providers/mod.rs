//! AI Provider detection and validation.
//!
//! This module handles detecting which AI CLI tools are available on the system
//! and validating that they can be executed.
//!
//! # Platform Support
//!
//! - **Linux/macOS**: Uses `which` to check command availability
//! - **Windows**: Uses `where` to check command availability
//! - **Flatpak**: Uses `flatpak-spawn --host` to access host binaries

use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::config::AiProvider;

// =============================================================================
// Available Provider Info
// =============================================================================

/// Information about an available AI provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableProvider {
    /// The provider type
    pub provider: AiProvider,

    /// Human-readable name
    pub name: String,

    /// CLI command
    pub command: String,

    /// Version string (if detected)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// Whether the provider is available and working
    pub available: bool,

    /// Error message if not available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AvailableProvider {
    /// Creates info for an available provider.
    fn available(provider: AiProvider, version: Option<String>) -> Self {
        Self {
            name: provider.display_name().to_string(),
            command: provider.command().to_string(),
            provider,
            version,
            available: true,
            error: None,
        }
    }

    /// Creates info for an unavailable provider.
    fn unavailable(provider: AiProvider, error: String) -> Self {
        Self {
            name: provider.display_name().to_string(),
            command: provider.command().to_string(),
            provider,
            version: None,
            available: false,
            error: Some(error),
        }
    }
}

// =============================================================================
// Detection
// =============================================================================

/// Checks if we're running inside a Flatpak sandbox.
pub fn is_flatpak() -> bool {
    std::path::Path::new("/.flatpak-info").exists()
}

/// Checks if we're running inside a Snap sandbox.
#[allow(dead_code)]
pub fn is_snap() -> bool {
    std::env::var("SNAP").is_ok()
}

/// Gets a command that can run on the host system.
///
/// In Flatpak, this wraps the command with `flatpak-spawn --host`.
fn get_host_command(cmd: &str) -> Command {
    if is_flatpak() {
        let mut command = Command::new("flatpak-spawn");
        command.arg("--host").arg(cmd);
        command
    } else {
        Command::new(cmd)
    }
}

/// Checks if a command exists on the system.
fn command_exists(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    let check_cmd = "where";

    #[cfg(not(target_os = "windows"))]
    let check_cmd = "which";

    let mut command = get_host_command(check_cmd);
    command.arg(cmd);

    match command.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

/// Gets the version of a command by running `<cmd> --version`.
fn get_command_version(cmd: &str) -> Option<String> {
    let mut command = get_host_command(cmd);
    command.arg("--version");

    match command.output() {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            // Take first line, trim whitespace
            version.lines().next().map(|s| s.trim().to_string())
        }
        _ => None,
    }
}

/// Checks if a provider is available and can be executed.
pub fn check_provider(provider: &AiProvider) -> AvailableProvider {
    let cmd = provider.command();

    // First check if command exists
    if !command_exists(cmd) {
        return AvailableProvider::unavailable(
            provider.clone(),
            format!("Command '{}' not found. Please install {}.", cmd, provider.display_name()),
        );
    }

    // Try to get version to verify it's executable
    let version = get_command_version(cmd);

    // If we got a version, it's available
    // If not, it might still work but we couldn't get version
    AvailableProvider::available(provider.clone(), version)
}

/// Gets all known providers with their availability status.
/// Uses parallel threads for faster detection.
pub fn get_available_providers() -> Vec<AvailableProvider> {
    use std::thread;

    let known_providers = vec![
        AiProvider::Claude,
        AiProvider::Gemini,
        AiProvider::Codex,
    ];

    // Check providers in parallel using threads
    let handles: Vec<_> = known_providers
        .into_iter()
        .map(|provider| {
            thread::spawn(move || check_provider(&provider))
        })
        .collect();

    // Collect results
    handles
        .into_iter()
        .map(|h| h.join().unwrap_or_else(|_| {
            AvailableProvider::unavailable(
                AiProvider::Claude, // fallback
                "Failed to check provider".to_string(),
            )
        }))
        .collect()
}

/// Validates that a specific provider is available.
pub fn validate_provider(provider: &AiProvider) -> Result<AvailableProvider, String> {
    let info = check_provider(provider);
    if info.available {
        Ok(info)
    } else {
        Err(info.error.unwrap_or_else(|| "Provider not available".to_string()))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_flatpak() {
        // This test just verifies the function runs
        // In a real Flatpak environment, it would return true
        let _ = is_flatpak();
    }

    #[test]
    fn test_available_provider_creation() {
        let provider = AiProvider::Claude;

        let available = AvailableProvider::available(provider.clone(), Some("1.0.0".to_string()));
        assert!(available.available);
        assert_eq!(available.name, "Claude Code");
        assert_eq!(available.version, Some("1.0.0".to_string()));

        let unavailable = AvailableProvider::unavailable(
            provider,
            "Not found".to_string(),
        );
        assert!(!unavailable.available);
        assert_eq!(unavailable.error, Some("Not found".to_string()));
    }

    #[test]
    fn test_get_available_providers() {
        // This will check for real CLI tools on the system
        // In CI, they likely won't be installed, which is fine
        let providers = get_available_providers();

        // Should always return 3 providers (available or not)
        assert_eq!(providers.len(), 3);

        // Each should have a name and command
        for p in providers {
            assert!(!p.name.is_empty());
            assert!(!p.command.is_empty());
        }
    }

    #[test]
    fn test_ai_provider_methods() {
        assert_eq!(AiProvider::Claude.command(), "claude");
        assert_eq!(AiProvider::Gemini.command(), "gemini");
        assert_eq!(AiProvider::Codex.command(), "codex");

        let custom = AiProvider::Custom {
            command: "my-ai".to_string(),
            args: vec![],
        };
        assert_eq!(custom.command(), "my-ai");
    }
}
