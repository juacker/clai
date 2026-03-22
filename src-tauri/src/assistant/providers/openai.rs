use crate::assistant::types::{AuthMode, ProtocolFamily, ProviderDescriptor};

pub const OPENAI_PROVIDER_ID: &str = "openai";

pub fn provider_descriptor() -> ProviderDescriptor {
    ProviderDescriptor {
        id: OPENAI_PROVIDER_ID.to_string(),
        display_name: "OpenAI-Compatible".to_string(),
        protocol_family: ProtocolFamily::OpenAiCompatible,
        supported_auth_modes: vec![AuthMode::DeveloperApiKey],
        configurable_base_url: true,
    }
}
