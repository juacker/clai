use serde::Deserialize;
use tauri::State;

use crate::assistant::auth::ProviderSecretStorage;
use crate::assistant::providers;
use crate::assistant::repository;
use crate::assistant::repository::UpsertProviderSessionParams;
use crate::assistant::types::{AuthMode, ModelInfo, ProviderDescriptor, ProviderSession};
use crate::db::DbPool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectProviderApiKeyRequest {
    pub provider_id: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub account_label: Option<String>,
}

#[tauri::command]
pub async fn provider_list_available() -> Result<Vec<ProviderDescriptor>, String> {
    Ok(providers::supported_providers())
}

#[tauri::command]
pub async fn provider_connect_api_key(
    request: ConnectProviderApiKeyRequest,
    pool: State<'_, DbPool>,
) -> Result<ProviderSession, String> {
    let descriptor = providers::get_provider_descriptor(&request.provider_id)
        .ok_or_else(|| format!("Unsupported provider: {}", request.provider_id))?;

    if !descriptor
        .supported_auth_modes
        .contains(&AuthMode::DeveloperApiKey)
    {
        return Err(format!(
            "Provider '{}' does not support developer API keys",
            request.provider_id
        ));
    }

    let secret_ref = format!("provider-session::{}", request.provider_id);
    ProviderSecretStorage::set_secret(&secret_ref, &request.api_key)
        .map_err(|e| format!("Failed to store provider credential: {}", e))?;

    repository::upsert_provider_session(
        pool.inner(),
        UpsertProviderSessionParams {
            provider_id: request.provider_id,
            auth_mode: AuthMode::DeveloperApiKey,
            base_url: request.base_url,
            secret_ref,
            account_label: request.account_label,
            expires_at: None,
        },
    )
    .await
}

#[tauri::command]
pub async fn provider_disconnect(
    provider_id: String,
    pool: State<'_, DbPool>,
) -> Result<bool, String> {
    if let Some(provider_session) =
        repository::get_provider_session(pool.inner(), &provider_id).await?
    {
        ProviderSecretStorage::clear_secret(&provider_session.secret_ref)
            .map_err(|e| format!("Failed to clear provider credential: {}", e))?;
    }

    repository::delete_provider_session(pool.inner(), &provider_id).await
}

#[tauri::command]
pub async fn provider_get_active_session(
    provider_id: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Option<ProviderSession>, String> {
    match provider_id {
        Some(provider_id) => repository::get_provider_session(pool.inner(), &provider_id).await,
        None => Ok(repository::list_provider_sessions(pool.inner())
            .await?
            .into_iter()
            .next()),
    }
}

#[tauri::command]
pub async fn provider_list_sessions(
    pool: State<'_, DbPool>,
) -> Result<Vec<ProviderSession>, String> {
    repository::list_provider_sessions(pool.inner()).await
}

#[tauri::command]
pub async fn provider_list_models(
    provider_id: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<ModelInfo>, String> {
    let provider_session = repository::get_provider_session(pool.inner(), &provider_id)
        .await?
        .ok_or_else(|| format!("Provider session not found: {}", provider_id))?;

    let adapter = providers::resolve_adapter(&provider_id).map_err(|e| e.to_string())?;
    adapter
        .list_models(&provider_session)
        .await
        .map_err(|e| e.to_string())
}
