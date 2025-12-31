//! AI Provider Tauri commands.
//!
//! These commands manage AI provider selection and detection.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config::AiProvider;
use crate::providers::{get_available_providers, validate_provider, AvailableProvider};
use crate::AppState;

// =============================================================================
// Response Types
// =============================================================================

/// Response for get_ai_provider command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    /// Currently configured provider (if any)
    pub provider: Option<AiProvider>,

    /// Human-readable name of the provider
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Whether a provider is configured
    pub is_configured: bool,
}

// =============================================================================
// Commands
// =============================================================================

/// Gets the currently configured AI provider.
///
/// Returns information about the current provider, including whether one is set.
#[tauri::command]
pub fn get_ai_provider(state: State<'_, AppState>) -> Result<ProviderInfo, String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let provider = config_manager.get_ai_provider();

    Ok(ProviderInfo {
        name: provider.as_ref().map(|p| p.display_name().to_string()),
        is_configured: provider.is_some(),
        provider,
    })
}

/// Sets the AI provider.
///
/// Validates that the provider is available before setting it.
/// Returns the validated provider information.
#[tauri::command]
pub fn set_ai_provider(
    provider: AiProvider,
    state: State<'_, AppState>,
) -> Result<AvailableProvider, String> {
    // First validate the provider is available
    let info = validate_provider(&provider).map_err(|e| e)?;

    // Then save to config
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    config_manager
        .set_ai_provider(provider)
        .map_err(|e| format!("Failed to save provider: {}", e))?;

    Ok(info)
}

/// Clears the AI provider configuration.
#[tauri::command]
pub fn clear_ai_provider(state: State<'_, AppState>) -> Result<(), String> {
    let config_manager = state
        .config_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    config_manager
        .clear_ai_provider()
        .map_err(|e| format!("Failed to clear provider: {}", e))
}

/// Gets all known AI providers with their availability status.
///
/// This checks the system for installed CLI tools (claude, gemini, codex)
/// and returns their availability status.
#[tauri::command]
pub fn get_available_ai_providers() -> Vec<AvailableProvider> {
    get_available_providers()
}

/// Validates that a specific provider is available.
///
/// Returns detailed information about the provider if available,
/// or an error message if not.
#[tauri::command]
pub fn validate_ai_provider(provider: AiProvider) -> Result<AvailableProvider, String> {
    validate_provider(&provider)
}
