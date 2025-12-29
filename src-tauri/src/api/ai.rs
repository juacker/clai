//! AI Service for worker analysis.
//!
//! This module provides a high-level abstraction over the Netdata Cloud
//! conversation API, designed specifically for AI Workers to perform
//! analysis tasks.
//!
//! # Architecture
//!
//! The AI Service sits between workers and the raw conversation API:
//!
//! ```text
//! Worker → AiService.analyze() → Conversation API → AI Response → Parsed JSON
//! ```
//!
//! # Key Features
//!
//! - **Conversation Management**: Reuses existing conversations or creates new ones
//! - **Schema Instructions**: Automatically instructs the AI to respond with JSON
//! - **Response Parsing**: Extracts JSON from various AI response formats
//! - **Schema Validation**: Validates responses against expected structure
//!
//! # Example
//!
//! ```rust,ignore
//! let ai_service = AiService::new(netdata_api);
//!
//! // First analysis - creates a new conversation
//! let result = ai_service.analyze(AnalyzeParams {
//!     space_id: "space123".to_string(),
//!     room_id: "room456".to_string(),
//!     prompt: "Analyze these anomalies...".to_string(),
//!     response_schema: Some(json!({
//!         "type": "object",
//!         "properties": {
//!             "findings": { "type": "array" }
//!         }
//!     })),
//!     conversation_id: None,      // Creates new conversation
//!     parent_message_id: None,    // First message in conversation
//! }).await?;
//!
//! // Follow-up question - continues the conversation
//! let followup = ai_service.analyze(AnalyzeParams {
//!     space_id: "space123".to_string(),
//!     room_id: "room456".to_string(),
//!     prompt: "Can you elaborate on finding #1?".to_string(),
//!     response_schema: Some(json!({ "type": "object" })),
//!     conversation_id: Some(result.conversation_id),  // Reuse conversation
//!     parent_message_id: result.message_id,           // Thread from previous response
//! }).await?;
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::error::ApiError;
use super::netdata::{ChatCompletionRequest, NetdataApi};

// =============================================================================
// Types
// =============================================================================

/// Parameters for an AI analysis request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeParams {
    /// The space ID to use for the conversation.
    pub space_id: String,

    /// The room ID to use for the conversation.
    pub room_id: String,

    /// The prompt to send to the AI.
    /// This should describe what you want the AI to analyze.
    pub prompt: String,

    /// Optional JSON schema describing the expected response format.
    /// If provided, the AI will be instructed to respond with JSON
    /// matching this schema.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_schema: Option<serde_json::Value>,

    /// Optional conversation ID to reuse an existing conversation.
    /// If not provided, a new conversation will be created.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,

    /// Optional parent message ID to continue from a specific point.
    ///
    /// Use this for follow-up queries in a conversation:
    /// - Pass `None` for the first message or to start fresh
    /// - Pass the `message_id` from a previous `AnalysisResult` to continue
    ///   the conversation from that point
    ///
    /// If not provided but `conversation_id` is set, the message will be
    /// added to the conversation but won't be threaded to a specific parent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
}

/// Result of an AI analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    /// The conversation ID used (useful for follow-up queries).
    pub conversation_id: String,

    /// The message ID of the AI's response.
    ///
    /// Pass this as `parent_message_id` in a subsequent `AnalyzeParams`
    /// to continue the conversation from this point.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,

    /// The raw text response from the AI.
    pub raw_response: String,

    /// The parsed JSON response (if response_schema was provided).
    /// This will be `None` if:
    /// - No schema was provided
    /// - JSON extraction failed
    /// - Schema validation failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed: Option<serde_json::Value>,

    /// Whether the parsed response is valid according to the schema.
    /// Only meaningful if `response_schema` was provided.
    pub is_valid: bool,

    /// Validation errors, if any.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub validation_errors: Vec<String>,
}

/// Error types specific to the AI Service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AiError {
    /// Failed to create conversation.
    ConversationCreationFailed(String),

    /// Failed to send message.
    MessageSendFailed(String),

    /// Failed to parse AI response.
    ResponseParseFailed(String),

    /// Schema validation failed.
    SchemaValidationFailed(Vec<String>),

    /// Underlying API error.
    ApiError(String),
}

impl From<ApiError> for AiError {
    fn from(err: ApiError) -> Self {
        AiError::ApiError(err.to_string())
    }
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiError::ConversationCreationFailed(msg) => {
                write!(f, "Failed to create conversation: {}", msg)
            }
            AiError::MessageSendFailed(msg) => write!(f, "Failed to send message: {}", msg),
            AiError::ResponseParseFailed(msg) => write!(f, "Failed to parse response: {}", msg),
            AiError::SchemaValidationFailed(errors) => {
                write!(f, "Schema validation failed: {}", errors.join(", "))
            }
            AiError::ApiError(msg) => write!(f, "API error: {}", msg),
        }
    }
}

impl std::error::Error for AiError {}

pub type AiResult<T> = Result<T, AiError>;

// =============================================================================
// AI Service
// =============================================================================

/// Conversation cache entry.
struct ConversationEntry {
    conversation_id: String,
    #[allow(dead_code)]
    created_at: std::time::Instant,
}

/// AI Service for worker analysis.
///
/// This service provides a high-level interface for workers to perform
/// AI-powered analysis. It handles:
///
/// - Conversation creation and reuse
/// - Message formatting with schema instructions
/// - Response streaming and aggregation
/// - JSON extraction from various response formats
/// - Schema validation
///
/// # Thread Safety
///
/// The service is designed to be shared across multiple workers using
/// `Arc<AiService>`. Internal state is protected by async mutexes.
pub struct AiService {
    /// The underlying Netdata API client.
    api: Arc<NetdataApi>,

    /// Cache of conversations by (space_id, room_id).
    /// This allows workers to reuse conversations for follow-up queries.
    conversations: Mutex<HashMap<(String, String), ConversationEntry>>,
}

impl AiService {
    /// Creates a new AI Service.
    ///
    /// # Arguments
    ///
    /// * `api` - The Netdata API client to use for API calls.
    pub fn new(api: Arc<NetdataApi>) -> Self {
        Self {
            api,
            conversations: Mutex::new(HashMap::new()),
        }
    }

    /// Performs an AI analysis.
    ///
    /// This method:
    /// 1. Creates a new conversation or reuses an existing one
    /// 2. Formats the prompt with schema instructions (if provided)
    /// 3. Sends the message and streams the response
    /// 4. Extracts JSON from the response (if schema was provided)
    /// 5. Validates the JSON against the schema
    ///
    /// # Arguments
    ///
    /// * `params` - The analysis parameters.
    ///
    /// # Returns
    ///
    /// An `AnalysisResult` containing the raw response and optionally
    /// the parsed JSON.
    pub async fn analyze(&self, params: AnalyzeParams) -> AiResult<AnalysisResult> {
        // Step 1: Get or create conversation
        let conversation_id = self
            .get_or_create_conversation(&params.space_id, &params.room_id, params.conversation_id)
            .await?;

        // Step 2: Build the prompt with schema instructions
        let full_prompt = self.build_prompt(&params.prompt, &params.response_schema);

        // Step 3: Send message and collect response
        let (raw_response, message_id) = self
            .send_message(
                &params.space_id,
                &params.room_id,
                &conversation_id,
                &full_prompt,
                params.parent_message_id,
            )
            .await?;

        // Step 4: Parse JSON if schema was provided
        let (parsed, is_valid, validation_errors) = if params.response_schema.is_some() {
            let extracted = extract_json(&raw_response);
            match extracted {
                Some(json) => {
                    // Step 5: Validate against schema
                    let errors = validate_json(&json, params.response_schema.as_ref().unwrap());
                    let valid = errors.is_empty();
                    (Some(json), valid, errors)
                }
                None => (
                    None,
                    false,
                    vec!["Failed to extract JSON from response".to_string()],
                ),
            }
        } else {
            (None, true, vec![])
        };

        Ok(AnalysisResult {
            conversation_id,
            message_id,
            raw_response,
            parsed,
            is_valid,
            validation_errors,
        })
    }

    /// Gets an existing conversation or creates a new one.
    async fn get_or_create_conversation(
        &self,
        space_id: &str,
        room_id: &str,
        existing_id: Option<String>,
    ) -> AiResult<String> {
        // If an existing conversation ID was provided, use it
        if let Some(id) = existing_id {
            return Ok(id);
        }

        // Check cache for this space/room
        let cache_key = (space_id.to_string(), room_id.to_string());
        {
            let cache = self.conversations.lock().await;
            if let Some(entry) = cache.get(&cache_key) {
                return Ok(entry.conversation_id.clone());
            }
        }

        // Create new conversation
        let conversation = self
            .api
            .create_conversation(space_id, room_id)
            .await
            .map_err(|e| AiError::ConversationCreationFailed(e.to_string()))?;

        // Cache it
        {
            let mut cache = self.conversations.lock().await;
            cache.insert(
                cache_key,
                ConversationEntry {
                    conversation_id: conversation.id.clone(),
                    created_at: std::time::Instant::now(),
                },
            );
        }

        Ok(conversation.id)
    }

    /// Builds the full prompt with schema instructions.
    fn build_prompt(&self, prompt: &str, schema: &Option<serde_json::Value>) -> String {
        match schema {
            Some(schema_value) => {
                // Add JSON schema instructions
                format!(
                    "{}\n\n\
                    IMPORTANT: You MUST respond with valid JSON only, no other text.\n\
                    Your response must conform to this JSON schema:\n\
                    ```json\n{}\n```\n\
                    Respond with the JSON object only, no markdown code blocks or explanations.",
                    prompt,
                    serde_json::to_string_pretty(schema_value).unwrap_or_default()
                )
            }
            None => prompt.to_string(),
        }
    }

    /// Sends a message and waits for the response.
    ///
    /// This method:
    /// 1. Sends the message via SSE streaming (waits for completion)
    /// 2. Fetches the conversation to get the complete response
    /// 3. Returns the last assistant message's text and ID
    ///
    /// This approach is cleaner than parsing SSE chunks because:
    /// - We get the complete, finalized response text
    /// - We get the proper message_id for threading
    /// - Less complex SSE parsing logic
    async fn send_message(
        &self,
        space_id: &str,
        room_id: &str,
        conversation_id: &str,
        prompt: &str,
        parent_message_id: Option<String>,
    ) -> AiResult<(String, Option<String>)> {
        let request = ChatCompletionRequest {
            message: prompt.to_string(),
            tools: vec![], // AI Service doesn't use tools
            parent_message_id,
        };

        // Step 1: Send message via SSE and wait for completion
        // We don't need to collect chunks - just wait for the stream to finish
        self.api
            .create_chat_completion(space_id, room_id, conversation_id, request, |_chunk| {
                // We ignore the chunks - we'll fetch the complete response after
            })
            .await
            .map_err(|e| AiError::MessageSendFailed(e.to_string()))?;

        // Step 2: Fetch the conversation to get the complete response
        let conversation = self
            .api
            .get_conversation(space_id, room_id, conversation_id)
            .await
            .map_err(|e| AiError::MessageSendFailed(format!("Failed to fetch conversation: {}", e)))?;

        // Step 3: Find the last assistant message
        let last_assistant = conversation
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "assistant");

        match last_assistant {
            Some(msg) => {
                // Extract text from content blocks
                let text = msg
                    .content
                    .iter()
                    .filter_map(|block| {
                        if block.content_type == "text" {
                            block.text.clone()
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("");

                Ok((text, Some(msg.id.clone())))
            }
            None => Err(AiError::ResponseParseFailed(
                "No assistant message found in conversation".to_string(),
            )),
        }
    }

    /// Clears the conversation cache for a specific space/room.
    /// Useful when you want to start fresh.
    #[allow(dead_code)]
    pub async fn clear_conversation_cache(&self, space_id: &str, room_id: &str) {
        let cache_key = (space_id.to_string(), room_id.to_string());
        let mut cache = self.conversations.lock().await;
        cache.remove(&cache_key);
    }

    /// Clears all cached conversations.
    #[allow(dead_code)]
    pub async fn clear_all_conversations(&self) {
        let mut cache = self.conversations.lock().await;
        cache.clear();
    }
}

// =============================================================================
// JSON Extraction
// =============================================================================

/// Extracts JSON from an AI response.
///
/// The AI might return JSON in various formats:
/// - Pure JSON: `{"key": "value"}`
/// - JSON in markdown code blocks: ```json\n{"key": "value"}\n```
/// - JSON embedded in text: "Here's the analysis: {"key": "value"}"
///
/// This function tries multiple strategies to extract valid JSON.
pub fn extract_json(text: &str) -> Option<serde_json::Value> {
    let text = text.trim();

    // Strategy 1: Try parsing the entire text as JSON
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
        return Some(json);
    }

    // Strategy 2: Look for JSON in markdown code blocks
    // Handles: ```json\n{...}\n``` or ```\n{...}\n```
    if let Some(json) = extract_from_code_block(text) {
        return Some(json);
    }

    // Strategy 3: Find JSON object by looking for balanced braces
    if let Some(json) = extract_json_object(text) {
        return Some(json);
    }

    // Strategy 4: Find JSON array by looking for balanced brackets
    if let Some(json) = extract_json_array(text) {
        return Some(json);
    }

    None
}

/// Extracts JSON from markdown code blocks.
fn extract_from_code_block(text: &str) -> Option<serde_json::Value> {
    // Look for ```json or ``` followed by JSON
    let patterns = ["```json\n", "```json\r\n", "```\n", "```\r\n"];

    for pattern in patterns {
        if let Some(start_idx) = text.find(pattern) {
            let json_start = start_idx + pattern.len();
            if let Some(end_idx) = text[json_start..].find("```") {
                let json_str = &text[json_start..json_start + end_idx].trim();
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
                    return Some(json);
                }
            }
        }
    }

    None
}

/// Extracts a JSON object by finding balanced braces.
fn extract_json_object(text: &str) -> Option<serde_json::Value> {
    let start = text.find('{')?;
    let mut depth = 0;
    let mut end = start;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in text[start..].char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if in_string => escape_next = true,
            '"' => in_string = !in_string,
            '{' if !in_string => depth += 1,
            '}' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    end = start + i + 1;
                    break;
                }
            }
            _ => {}
        }
    }

    if depth == 0 && end > start {
        let json_str = &text[start..end];
        serde_json::from_str(json_str).ok()
    } else {
        None
    }
}

/// Extracts a JSON array by finding balanced brackets.
fn extract_json_array(text: &str) -> Option<serde_json::Value> {
    let start = text.find('[')?;
    let mut depth = 0;
    let mut end = start;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in text[start..].char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if in_string => escape_next = true,
            '"' => in_string = !in_string,
            '[' if !in_string => depth += 1,
            ']' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    end = start + i + 1;
                    break;
                }
            }
            _ => {}
        }
    }

    if depth == 0 && end > start {
        let json_str = &text[start..end];
        serde_json::from_str(json_str).ok()
    } else {
        None
    }
}

// =============================================================================
// Schema Validation
// =============================================================================

/// Validates JSON against a schema.
///
/// This is a simple validation that checks:
/// - Required properties are present
/// - Property types match (basic type checking)
///
/// Note: This is not a full JSON Schema validator. For production use,
/// consider using a proper JSON Schema validation library.
pub fn validate_json(json: &serde_json::Value, schema: &serde_json::Value) -> Vec<String> {
    let mut errors = Vec::new();

    // Get the expected type
    if let Some(expected_type) = schema.get("type").and_then(|t| t.as_str()) {
        let actual_type = get_json_type(json);
        if expected_type != actual_type {
            errors.push(format!(
                "Expected type '{}', got '{}'",
                expected_type, actual_type
            ));
            return errors; // Type mismatch, no point checking further
        }
    }

    // If it's an object, check properties
    if let (Some(json_obj), Some(properties)) = (
        json.as_object(),
        schema.get("properties").and_then(|p| p.as_object()),
    ) {
        // Check required properties
        if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
            for req in required {
                if let Some(prop_name) = req.as_str() {
                    if !json_obj.contains_key(prop_name) {
                        errors.push(format!("Missing required property: {}", prop_name));
                    }
                }
            }
        }

        // Recursively validate properties
        for (prop_name, prop_schema) in properties {
            if let Some(prop_value) = json_obj.get(prop_name) {
                let prop_errors = validate_json(prop_value, prop_schema);
                for err in prop_errors {
                    errors.push(format!("{}.{}", prop_name, err));
                }
            }
        }
    }

    // If it's an array, check items
    if let (Some(json_arr), Some(items_schema)) = (json.as_array(), schema.get("items")) {
        for (i, item) in json_arr.iter().enumerate() {
            let item_errors = validate_json(item, items_schema);
            for err in item_errors {
                errors.push(format!("[{}].{}", i, err));
            }
        }
    }

    errors
}

/// Gets the JSON type as a string.
fn get_json_type(json: &serde_json::Value) -> &'static str {
    match json {
        serde_json::Value::Null => "null",
        serde_json::Value::Bool(_) => "boolean",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::String(_) => "string",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -------------------------------------------------------------------------
    // JSON Extraction Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_extract_pure_json_object() {
        let text = r#"{"findings": [{"id": 1}]}"#;
        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["findings"][0]["id"], 1);
    }

    #[test]
    fn test_extract_pure_json_array() {
        let text = r#"[{"id": 1}, {"id": 2}]"#;
        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()[0]["id"], 1);
    }

    #[test]
    fn test_extract_json_from_markdown_code_block() {
        let text = r#"Here's the analysis:

```json
{"findings": [{"severity": "high"}]}
```

Let me know if you need more details."#;

        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["findings"][0]["severity"], "high");
    }

    #[test]
    fn test_extract_json_from_plain_code_block() {
        let text = r#"```
{"status": "ok"}
```"#;

        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["status"], "ok");
    }

    #[test]
    fn test_extract_json_embedded_in_text() {
        let text = r#"Based on my analysis, here is the result: {"score": 85, "issues": ["memory", "cpu"]} I hope this helps!"#;

        let result = extract_json(text);
        assert!(result.is_some());
        let json = result.unwrap();
        assert_eq!(json["score"], 85);
        assert_eq!(json["issues"][0], "memory");
    }

    #[test]
    fn test_extract_json_with_nested_objects() {
        let text = r#"{"outer": {"inner": {"deep": "value"}}}"#;
        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["outer"]["inner"]["deep"], "value");
    }

    #[test]
    fn test_extract_json_with_escaped_quotes() {
        let text = r#"{"message": "He said \"hello\""}"#;
        let result = extract_json(text);
        assert!(result.is_some());
        assert_eq!(result.unwrap()["message"], "He said \"hello\"");
    }

    #[test]
    fn test_extract_no_json() {
        let text = "This is just plain text with no JSON at all.";
        let result = extract_json(text);
        assert!(result.is_none());
    }

    // -------------------------------------------------------------------------
    // Schema Validation Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_validate_simple_object() {
        let json = json!({"name": "test", "value": 42});
        let schema = json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "value": {"type": "number"}
            },
            "required": ["name", "value"]
        });

        let errors = validate_json(&json, &schema);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_missing_required() {
        let json = json!({"name": "test"});
        let schema = json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "value": {"type": "number"}
            },
            "required": ["name", "value"]
        });

        let errors = validate_json(&json, &schema);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("Missing required property: value"));
    }

    #[test]
    fn test_validate_wrong_type() {
        let json = json!("not an object");
        let schema = json!({
            "type": "object"
        });

        let errors = validate_json(&json, &schema);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("Expected type 'object', got 'string'"));
    }

    #[test]
    fn test_validate_nested_object() {
        let json = json!({
            "user": {
                "name": "Alice",
                "age": 30
            }
        });
        let schema = json!({
            "type": "object",
            "properties": {
                "user": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "age": {"type": "number"}
                    },
                    "required": ["name"]
                }
            }
        });

        let errors = validate_json(&json, &schema);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_array() {
        let json = json!([
            {"id": 1},
            {"id": 2}
        ]);
        let schema = json!({
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "number"}
                },
                "required": ["id"]
            }
        });

        let errors = validate_json(&json, &schema);
        assert!(errors.is_empty());
    }

    // -------------------------------------------------------------------------
    // Prompt Building Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_build_prompt_without_schema() {
        let api = create_mock_api();
        let service = AiService::new(api);

        let prompt = service.build_prompt("Analyze this data", &None);
        assert_eq!(prompt, "Analyze this data");
    }

    #[test]
    fn test_build_prompt_with_schema() {
        let api = create_mock_api();
        let service = AiService::new(api);

        let schema = json!({"type": "object"});
        let prompt = service.build_prompt("Analyze this data", &Some(schema));

        assert!(prompt.contains("Analyze this data"));
        assert!(prompt.contains("IMPORTANT: You MUST respond with valid JSON"));
        assert!(prompt.contains("\"type\": \"object\""));
    }

    // Helper to create a mock API for testing
    fn create_mock_api() -> Arc<NetdataApi> {
        use super::super::client::create_client;
        let client = create_client();
        Arc::new(NetdataApi::new(
            client,
            "https://app.netdata.cloud".to_string(),
            "mock_token".to_string(),
        ))
    }
}
