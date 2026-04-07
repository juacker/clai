pub mod anthropic;
pub mod openai;
pub mod registry;
pub mod types;

pub use registry::{get_provider_descriptor, resolve_adapter, supported_providers};
