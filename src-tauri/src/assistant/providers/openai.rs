use std::pin::Pin;

use async_trait::async_trait;
use futures::stream::Stream;
use futures::StreamExt;
use reqwest::Client;
use serde_json::json;

type Bytes = axum::body::Bytes;

use crate::assistant::auth::secrets::ProviderSecretStorage;
use crate::assistant::types::{
    AuthMode, CompletionRequest, ContentPart, MessageRole, ModelInfo, ProtocolFamily,
    ProviderDescriptor, ProviderEvent, ProviderSession, RunUsage,
};

use super::types::{ProviderAdapter, ProviderError};

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

pub struct OpenAiAdapter;

#[async_trait]
impl ProviderAdapter for OpenAiAdapter {
    fn provider_id(&self) -> &'static str {
        OPENAI_PROVIDER_ID
    }

    fn protocol_family(&self) -> ProtocolFamily {
        ProtocolFamily::OpenAiCompatible
    }

    async fn list_models(
        &self,
        session: &ProviderSession,
    ) -> Result<Vec<ModelInfo>, ProviderError> {
        let api_key = get_api_key(session)?;
        let models_url = {
            let base = session
                .base_url
                .as_deref()
                .unwrap_or("https://api.openai.com/v1")
                .trim_end_matches('/');
            if base.ends_with("/v1") {
                format!("{}/models", base)
            } else {
                format!("{}/v1/models", base)
            }
        };

        let client = Client::new();
        let resp = client
            .get(models_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| ProviderError::RequestFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::RequestFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| ProviderError::RequestFailed(e.to_string()))?;

        let models = body["data"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|m| {
                let id = m["id"].as_str()?.to_string();
                Some(ModelInfo {
                    id: id.clone(),
                    display_name: id,
                    supports_tools: true,
                })
            })
            .collect();

        Ok(models)
    }

    async fn stream_completion(
        &self,
        session: &ProviderSession,
        request: CompletionRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ProviderEvent, ProviderError>> + Send>>,
        ProviderError,
    > {
        let api_key = get_api_key(session)?;
        let url = completions_url(session);
        let body = build_request_body(&request);

        let client = Client::new();
        let resp = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| ProviderError::RequestFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError::RequestFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let byte_stream = resp.bytes_stream();
        let event_stream = sse_to_provider_events(byte_stream);

        Ok(Box::pin(event_stream))
    }
}

fn get_api_key(session: &ProviderSession) -> Result<String, ProviderError> {
    ProviderSecretStorage::get_secret(&session.secret_ref)
        .map_err(|e| ProviderError::RequestFailed(format!("Failed to read API key: {}", e)))?
        .ok_or(ProviderError::NotConfigured)
}

/// Build the full chat completions endpoint URL.
/// Handles both conventions:
///   - base_url = "https://api.openai.com"      → appends "/v1/chat/completions"
///   - base_url = "https://api.openai.com/v1"    → appends "/chat/completions"
///   - base_url = "http://localhost:8000/v1"      → appends "/chat/completions"
fn completions_url(session: &ProviderSession) -> String {
    let base = session
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1")
        .trim_end_matches('/');

    if base.ends_with("/v1") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    }
}

fn build_request_body(request: &CompletionRequest) -> serde_json::Value {
    let messages: Vec<serde_json::Value> = request
        .messages
        .iter()
        .map(|msg| {
            let role = match msg.role {
                MessageRole::System => "system",
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::Tool => "tool",
            };

            let content = msg
                .content
                .iter()
                .filter_map(|part| match part {
                    ContentPart::Text { text } => Some(text.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("");

            json!({
                "role": role,
                "content": content,
            })
        })
        .collect();

    let mut body = json!({
        "model": request.model_id,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    if let Some(temp) = request.temperature {
        body["temperature"] = json!(temp);
    }

    if let Some(max_tokens) = request.max_output_tokens {
        body["max_completion_tokens"] = json!(max_tokens);
    }

    body
}

/// Transforms a reqwest response bytes stream into a stream of ProviderEvent values
/// by parsing OpenAI SSE format.
fn sse_to_provider_events(
    byte_stream: impl Stream<Item = reqwest::Result<Bytes>> + Send + 'static,
) -> impl Stream<Item = Result<ProviderEvent, ProviderError>> + Send {
    futures::stream::unfold(
        (byte_stream.boxed(), String::new(), true),
        |(mut stream, mut buf, mut first)| async move {
            loop {
                // Check if we have a complete SSE frame in the buffer
                if let Some(pos) = buf.find("\n\n") {
                    let frame = buf[..pos].to_string();
                    buf = buf[pos + 2..].to_string();

                    let events = parse_sse_frame(&frame, &mut first);
                    if !events.is_empty() {
                        return Some((events, (stream, buf, first)));
                    }
                    continue;
                }

                // Need more data
                match stream.next().await {
                    Some(Ok(bytes)) => {
                        match String::from_utf8(bytes.to_vec()) {
                            Ok(text) => buf.push_str(&text),
                            Err(e) => {
                                return Some((
                                    vec![Err(ProviderError::RequestFailed(format!(
                                        "Invalid UTF-8 in stream: {}",
                                        e
                                    )))],
                                    (stream, buf, first),
                                ));
                            }
                        }
                    }
                    Some(Err(e)) => {
                        return Some((
                            vec![Err(ProviderError::RequestFailed(e.to_string()))],
                            (stream, buf, first),
                        ));
                    }
                    None => {
                        // Stream ended. Parse any remaining buffer.
                        if !buf.trim().is_empty() {
                            let events = parse_sse_frame(buf.trim(), &mut first);
                            buf.clear();
                            if !events.is_empty() {
                                return Some((events, (stream, buf, first)));
                            }
                        }
                        return None;
                    }
                }
            }
        },
    )
    .flat_map(|events| futures::stream::iter(events))
}

/// Parse a single SSE frame (one or more `data:` lines) into ProviderEvent values.
fn parse_sse_frame(
    frame: &str,
    is_first: &mut bool,
) -> Vec<Result<ProviderEvent, ProviderError>> {
    let mut events = Vec::new();

    for line in frame.lines() {
        let data = if let Some(stripped) = line.strip_prefix("data: ") {
            stripped.trim()
        } else if let Some(stripped) = line.strip_prefix("data:") {
            stripped.trim()
        } else {
            continue;
        };

        if data.is_empty() {
            continue;
        }

        if data == "[DONE]" {
            events.push(Ok(ProviderEvent::MessageComplete));
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(data) {
            Ok(json) => {
                if *is_first {
                    *is_first = false;
                    events.push(Ok(ProviderEvent::MessageStart));
                }

                // Extract text delta from choices[0].delta.content
                if let Some(content) = json
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !content.is_empty() {
                        events.push(Ok(ProviderEvent::TextDelta {
                            text: content.to_string(),
                        }));
                    }
                }

                // Extract usage if present
                if let Some(usage_obj) = json.get("usage") {
                    if !usage_obj.is_null() {
                        let usage = RunUsage {
                            input_tokens: usage_obj
                                .get("prompt_tokens")
                                .and_then(|v| v.as_u64()),
                            output_tokens: usage_obj
                                .get("completion_tokens")
                                .and_then(|v| v.as_u64()),
                            reasoning_tokens: usage_obj
                                .get("completion_tokens_details")
                                .and_then(|d| d.get("reasoning_tokens"))
                                .and_then(|v| v.as_u64()),
                            total_tokens: usage_obj
                                .get("total_tokens")
                                .and_then(|v| v.as_u64()),
                        };
                        events.push(Ok(ProviderEvent::Usage { usage }));
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Failed to parse SSE JSON: {} (data: {})", e, data);
            }
        }
    }

    events
}
