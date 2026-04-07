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
    ProviderConnection, ProviderDescriptor, ProviderEvent, RunUsage, ToolInvocationDraft,
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
        connection: &ProviderConnection,
    ) -> Result<Vec<ModelInfo>, ProviderError> {
        let api_key = get_api_key(connection)?;
        let models_url = {
            let base = connection
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

        tracing::info!(
            url = %models_url,
            provider_id = %connection.provider_id,
            "Fetching models from provider"
        );

        let client = Client::new();
        let resp = client
            .get(&models_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| {
                tracing::error!(url = %models_url, error = %e, "HTTP request failed");
                ProviderError::RequestFailed(e.to_string())
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(
                url = %models_url,
                status = %status,
                body = %body,
                "Provider returned error"
            );
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
        connection: &ProviderConnection,
        request: CompletionRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<ProviderEvent, ProviderError>> + Send>>,
        ProviderError,
    > {
        let api_key = get_api_key(connection)?;
        let url = completions_url(connection);
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

fn get_api_key(connection: &ProviderConnection) -> Result<String, ProviderError> {
    ProviderSecretStorage::get_secret(&connection.secret_ref)
        .map_err(|e| ProviderError::RequestFailed(format!("Failed to read API key: {}", e)))?
        .ok_or(ProviderError::NotConfigured)
}

fn completions_url(connection: &ProviderConnection) -> String {
    let base = connection
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

// =============================================================================
// Request Building
// =============================================================================

fn build_request_body(request: &CompletionRequest) -> serde_json::Value {
    let messages: Vec<serde_json::Value> = request.messages.iter().map(build_message).collect();

    let mut body = json!({
        "model": request.model_id,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    // Add tools if present
    if !request.tools.is_empty() {
        let tools: Vec<serde_json::Value> = request
            .tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = json!(tools);
    }

    if let Some(temp) = request.temperature {
        body["temperature"] = json!(temp);
    }

    if let Some(max_tokens) = request.max_output_tokens {
        body["max_completion_tokens"] = json!(max_tokens);
    }

    body
}

/// Build a single OpenAI message from a ProviderInputMessage.
/// Handles text, tool_use (assistant with tool_calls), and tool_result (role: tool).
fn build_message(msg: &crate::assistant::types::ProviderInputMessage) -> serde_json::Value {
    let role = match msg.role {
        MessageRole::System => "system",
        MessageRole::User => "user",
        MessageRole::Assistant => "assistant",
        MessageRole::Tool => "tool",
    };

    // Check if this message contains tool uses (assistant calling tools)
    let tool_uses: Vec<&ContentPart> = msg
        .content
        .iter()
        .filter(|p| matches!(p, ContentPart::ToolUse { .. }))
        .collect();

    // Check if this is a tool result message
    if let Some(ContentPart::ToolResult {
        tool_call_id,
        payload,
        started_at,
        completed_at,
    }) = msg.content.first()
    {
        if msg.role == MessageRole::Tool {
            let content = serde_json::json!({
                "startedAt": started_at.and_then(format_timestamp_millis_as_rfc3339),
                "completedAt": completed_at.and_then(format_timestamp_millis_as_rfc3339),
                "payload": payload,
            });
            return json!({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": content.to_string(),
            });
        }
    }

    // If assistant message has tool calls, format with tool_calls array
    if msg.role == MessageRole::Assistant && !tool_uses.is_empty() {
        let text_content: String = msg
            .content
            .iter()
            .filter_map(|p| match p {
                ContentPart::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        let tool_calls: Vec<serde_json::Value> = tool_uses
            .iter()
            .map(|p| match p {
                ContentPart::ToolUse {
                    tool_call_id,
                    tool_name,
                    arguments,
                } => json!({
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": arguments.to_string(),
                    }
                }),
                _ => json!(null),
            })
            .collect();

        let mut message = json!({
            "role": "assistant",
            "tool_calls": tool_calls,
        });
        if !text_content.is_empty() {
            message["content"] = json!(text_content);
        }
        return message;
    }

    // Default: text content
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
}

fn format_timestamp_millis_as_rfc3339(timestamp_ms: i64) -> Option<String> {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(timestamp_ms).map(|dt| dt.to_rfc3339())
}

// =============================================================================
// SSE Stream Parsing
// =============================================================================

/// State for accumulating partial tool calls across SSE frames.
#[derive(Default, Clone)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

/// Full state carried through the SSE stream unfold.
struct SseState {
    stream: Pin<Box<dyn Stream<Item = reqwest::Result<Bytes>> + Send>>,
    buf: String,
    is_first: bool,
    tool_calls: Vec<PartialToolCall>,
}

fn sse_to_provider_events(
    byte_stream: impl Stream<Item = reqwest::Result<Bytes>> + Send + 'static,
) -> impl Stream<Item = Result<ProviderEvent, ProviderError>> + Send {
    let state = SseState {
        stream: byte_stream.boxed(),
        buf: String::new(),
        is_first: true,
        tool_calls: Vec::new(),
    };

    futures::stream::unfold(state, |mut state| async move {
        loop {
            // Check if we have a complete SSE frame in the buffer
            if let Some(pos) = state.buf.find("\n\n") {
                let frame = state.buf[..pos].to_string();
                state.buf = state.buf[pos + 2..].to_string();

                let events = parse_sse_frame(&frame, &mut state.is_first, &mut state.tool_calls);
                if !events.is_empty() {
                    return Some((events, state));
                }
                continue;
            }

            // Need more data
            match state.stream.next().await {
                Some(Ok(bytes)) => match String::from_utf8(bytes.to_vec()) {
                    Ok(text) => state.buf.push_str(&text),
                    Err(e) => {
                        return Some((
                            vec![Err(ProviderError::RequestFailed(format!(
                                "Invalid UTF-8 in stream: {}",
                                e
                            )))],
                            state,
                        ));
                    }
                },
                Some(Err(e)) => {
                    return Some((
                        vec![Err(ProviderError::RequestFailed(e.to_string()))],
                        state,
                    ));
                }
                None => {
                    // Stream ended. Parse any remaining buffer.
                    if !state.buf.trim().is_empty() {
                        let events = parse_sse_frame(
                            state.buf.trim(),
                            &mut state.is_first,
                            &mut state.tool_calls,
                        );
                        state.buf.clear();
                        if !events.is_empty() {
                            return Some((events, state));
                        }
                    }
                    return None;
                }
            }
        }
    })
    .flat_map(futures::stream::iter)
}

/// Parse a single SSE frame into ProviderEvent values.
fn parse_sse_frame(
    frame: &str,
    is_first: &mut bool,
    tool_calls_buf: &mut Vec<PartialToolCall>,
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
            // Flush any accumulated tool calls before completing
            flush_tool_calls(tool_calls_buf, &mut events);
            events.push(Ok(ProviderEvent::MessageComplete));
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(data) {
            Ok(json) => {
                if *is_first {
                    *is_first = false;
                    events.push(Ok(ProviderEvent::MessageStart));
                }

                let choice = json.get("choices").and_then(|c| c.get(0));

                // Check finish_reason for tool_calls
                if let Some(reason) = choice
                    .and_then(|c| c.get("finish_reason"))
                    .and_then(|r| r.as_str())
                {
                    if reason == "tool_calls" {
                        flush_tool_calls(tool_calls_buf, &mut events);
                    }
                }

                let delta = choice.and_then(|c| c.get("delta"));

                // Extract text delta
                if let Some(content) = delta
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !content.is_empty() {
                        events.push(Ok(ProviderEvent::TextDelta {
                            text: content.to_string(),
                        }));
                    }
                }

                // Extract tool_calls deltas
                if let Some(tool_calls) = delta
                    .and_then(|d| d.get("tool_calls"))
                    .and_then(|t| t.as_array())
                {
                    for tc in tool_calls {
                        let index = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;

                        // Ensure buffer is large enough
                        while tool_calls_buf.len() <= index {
                            tool_calls_buf.push(PartialToolCall::default());
                        }

                        // Accumulate id
                        if let Some(id) = tc.get("id").and_then(|i| i.as_str()) {
                            tool_calls_buf[index].id = id.to_string();
                        }

                        // Accumulate function name
                        if let Some(name) = tc
                            .get("function")
                            .and_then(|f| f.get("name"))
                            .and_then(|n| n.as_str())
                        {
                            tool_calls_buf[index].name = name.to_string();
                        }

                        // Accumulate function arguments (streamed as partial JSON)
                        if let Some(args) = tc
                            .get("function")
                            .and_then(|f| f.get("arguments"))
                            .and_then(|a| a.as_str())
                        {
                            tool_calls_buf[index].arguments.push_str(args);
                        }
                    }
                }

                // Extract usage if present
                if let Some(usage_obj) = json.get("usage") {
                    if !usage_obj.is_null() {
                        let usage = RunUsage {
                            input_tokens: usage_obj.get("prompt_tokens").and_then(|v| v.as_u64()),
                            output_tokens: usage_obj
                                .get("completion_tokens")
                                .and_then(|v| v.as_u64()),
                            reasoning_tokens: usage_obj
                                .get("completion_tokens_details")
                                .and_then(|d| d.get("reasoning_tokens"))
                                .and_then(|v| v.as_u64()),
                            total_tokens: usage_obj.get("total_tokens").and_then(|v| v.as_u64()),
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

/// Flush accumulated tool calls as ToolCallReady events.
fn flush_tool_calls(
    tool_calls_buf: &mut Vec<PartialToolCall>,
    events: &mut Vec<Result<ProviderEvent, ProviderError>>,
) {
    for tc in tool_calls_buf.drain(..) {
        if tc.id.is_empty() {
            continue;
        }
        let params = serde_json::from_str::<serde_json::Value>(&tc.arguments)
            .unwrap_or(serde_json::json!({}));

        events.push(Ok(ProviderEvent::ToolCallReady {
            tool_call: ToolInvocationDraft {
                tool_call_id: tc.id,
                tool_name: tc.name,
                params,
            },
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assistant::types::{ContentPart, MessageRole, ProviderInputMessage};

    #[test]
    fn build_message_includes_tool_result_timestamps() {
        let msg = ProviderInputMessage {
            role: MessageRole::Tool,
            content: vec![ContentPart::ToolResult {
                tool_call_id: "call_123".to_string(),
                payload: serde_json::json!({ "openIssues": 0 }),
                started_at: Some(1_700_000_000_000),
                completed_at: Some(1_700_000_000_250),
            }],
        };

        let built = build_message(&msg);
        assert_eq!(built["role"], "tool");
        assert_eq!(built["tool_call_id"], "call_123");

        let content = built["content"]
            .as_str()
            .expect("tool content should be a string");
        let parsed: serde_json::Value =
            serde_json::from_str(content).expect("tool content should be valid json");

        assert_eq!(parsed["startedAt"], "2023-11-14T22:13:20+00:00");
        assert_eq!(parsed["completedAt"], "2023-11-14T22:13:20.250+00:00");
        assert_eq!(parsed["payload"]["openIssues"], 0);
    }
}
