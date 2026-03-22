use crate::assistant::providers::openai;
use crate::assistant::types::ProviderDescriptor;

pub fn supported_providers() -> Vec<ProviderDescriptor> {
    vec![openai::provider_descriptor()]
}

pub fn get_provider_descriptor(provider_id: &str) -> Option<ProviderDescriptor> {
    supported_providers()
        .into_iter()
        .find(|provider| provider.id == provider_id)
}
