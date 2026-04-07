use crate::assistant::providers::{anthropic, openai};
use crate::assistant::types::ProviderDescriptor;

use super::anthropic::AnthropicAdapter;
use super::openai::OpenAiAdapter;
use super::types::{ProviderAdapter, ProviderError};

pub fn supported_providers() -> Vec<ProviderDescriptor> {
    vec![
        openai::provider_descriptor(),
        anthropic::provider_descriptor(),
    ]
}

pub fn get_provider_descriptor(provider_id: &str) -> Option<ProviderDescriptor> {
    supported_providers()
        .into_iter()
        .find(|provider| provider.id == provider_id)
}

pub fn resolve_adapter(provider_id: &str) -> Result<Box<dyn ProviderAdapter>, ProviderError> {
    match provider_id {
        openai::OPENAI_PROVIDER_ID => Ok(Box::new(OpenAiAdapter)),
        anthropic::ANTHROPIC_PROVIDER_ID => Ok(Box::new(AnthropicAdapter)),
        _ => Err(ProviderError::NotConfigured),
    }
}
