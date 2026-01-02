//! Netdata Cloud API implementation.
//!
//! This module provides a typed interface to the Netdata Cloud API.
//! All API calls are made through the `NetdataApi` struct.
//!
//! # Rust Learning: API Client Pattern
//!
//! We use a struct to hold the configuration (client, base_url, token)
//! and methods to make API calls. This is similar to creating a class
//! in JavaScript:
//!
//! ```javascript
//! // JavaScript equivalent
//! class NetdataApi {
//!     constructor(client, baseUrl, token) { ... }
//!     async getUserInfo() { ... }
//! }
//! ```

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api::client::{DEFAULT_TIMEOUT, STREAMING_TIMEOUT};
use crate::api::error::{ApiError, ApiResult, NetdataErrorResponse};

/// Netdata Cloud API client.
///
/// # Rust Learning: Struct Fields
///
/// Unlike JavaScript objects, Rust structs have fixed fields defined at compile time.
/// Each field has a specific type, and the compiler ensures type safety.
pub struct NetdataApi {
    /// The HTTP client (reused for connection pooling)
    client: Client,
    /// Base URL of the Netdata Cloud API
    base_url: String,
    /// Bearer token for authentication
    token: String,
}

impl NetdataApi {
    /// Creates a new API client instance.
    ///
    /// # Arguments
    ///
    /// * `client` - Reusable HTTP client
    /// * `base_url` - API base URL (e.g., "https://app.netdata.cloud")
    /// * `token` - Bearer token for authentication
    pub fn new(client: Client, base_url: String, token: String) -> Self {
        Self {
            client,
            base_url,
            token,
        }
    }

    /// Builds the Authorization header value.
    fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    /// Handles HTTP response, converting status codes to appropriate errors.
    ///
    /// # Rust Learning: Generics with Trait Bounds
    ///
    /// `T: for<'de> Deserialize<'de>` means "T can be deserialized from any lifetime".
    /// This is the standard way to accept any deserializable type.
    ///
    /// # Error Handling
    ///
    /// When the API returns an error, we try to parse the response body as a
    /// `NetdataErrorResponse` to extract detailed error information. This allows
    /// JavaScript to match on specific error conditions via `errorMsgKey`.
    async fn handle_response<T>(&self, response: reqwest::Response) -> ApiResult<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let status = response.status();

        if status.is_success() {
            response
                .json()
                .await
                .map_err(|e| ApiError::ParseError(e.to_string()))
        } else {
            // Try to parse the error response body to extract Netdata error details
            let netdata_error: Option<NetdataErrorResponse> = response
                .json()
                .await
                .ok(); // If parsing fails, we'll use defaults

            Err(ApiError::from_response(status, netdata_error))
        }
    }

    // =========================================================================
    // API Methods
    // =========================================================================

    /// Gets information about the authenticated user.
    ///
    /// Endpoint: `GET /api/v2/accounts/me`
    pub async fn get_user_info(&self) -> ApiResult<UserInfo> {
        let response = self
            .client
            .get(format!("{}/api/v2/accounts/me", self.base_url))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets all spaces the user has access to.
    ///
    /// Endpoint: `GET /api/v3/spaces`
    pub async fn get_spaces(&self) -> ApiResult<Vec<Space>> {
        let response = self
            .client
            .get(format!("{}/api/v3/spaces", self.base_url))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets all rooms in a space.
    ///
    /// Endpoint: `GET /api/v2/spaces/{space_id}/rooms`
    ///
    /// # Arguments
    ///
    /// * `space_id` - The ID of the space
    pub async fn get_rooms(&self, space_id: &str) -> ApiResult<Vec<Room>> {
        let response = self
            .client
            .get(format!(
                "{}/api/v2/spaces/{}/rooms",
                self.base_url, space_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .query(&[("show_all", "true"), ("default", "false")])
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets the billing plan for a space, including AI credits.
    ///
    /// Endpoint: `GET /api/v2/spaces/{space_id}/billing/plan`
    ///
    /// # Arguments
    ///
    /// * `space_id` - The ID of the space
    pub async fn get_billing_plan(&self, space_id: &str) -> ApiResult<BillingPlan> {
        let response = self
            .client
            .get(format!(
                "{}/api/v2/spaces/{}/billing/plan",
                self.base_url, space_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets data with complex aggregation and filtering options.
    ///
    /// Endpoint: `POST /api/v3/spaces/{space_id}/rooms/{room_id}/data`
    ///
    /// This is used for fetching metrics data with flexible aggregation,
    /// grouping, and time windowing options.
    ///
    /// # Arguments
    ///
    /// * `space_id` - The ID of the space
    /// * `room_id` - The ID of the room
    /// * `query` - The data query parameters
    pub async fn get_data(
        &self,
        space_id: &str,
        room_id: &str,
        query: DataQuery,
    ) -> ApiResult<DataResponse> {
        let response = self
            .client
            .post(format!(
                "{}/api/v3/spaces/{}/rooms/{}/data",
                self.base_url, space_id, room_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .json(&query)
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets available contexts (metrics) for a space/room.
    ///
    /// Endpoint: `POST /api/v3/spaces/{space_id}/rooms/{room_id}/contexts`
    ///
    /// This is used to discover what metrics are available for querying.
    ///
    /// # Arguments
    ///
    /// * `space_id` - The ID of the space
    /// * `room_id` - The ID of the room
    /// * `query` - The contexts query parameters
    pub async fn get_contexts(
        &self,
        space_id: &str,
        room_id: &str,
        query: ContextsQuery,
    ) -> ApiResult<ContextsResponse> {
        let response = self
            .client
            .post(format!(
                "{}/api/v3/spaces/{}/rooms/{}/contexts",
                self.base_url, space_id, room_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .json(&query)
            .send()
            .await?;

        self.handle_response(response).await
    }

    // =========================================================================
    // Conversation API
    // =========================================================================

    /// Creates a new conversation.
    ///
    /// Endpoint: `POST /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations`
    pub async fn create_conversation(
        &self,
        space_id: &str,
        room_id: &str,
    ) -> ApiResult<Conversation> {
        let response = self
            .client
            .post(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations",
                self.base_url, space_id, room_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .json(&serde_json::json!({}))
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Gets a specific conversation.
    ///
    /// Endpoint: `GET /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations/{conversation_id}`
    pub async fn get_conversation(
        &self,
        space_id: &str,
        room_id: &str,
        conversation_id: &str,
    ) -> ApiResult<Conversation> {
        let response = self
            .client
            .get(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations/{}",
                self.base_url, space_id, room_id, conversation_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Lists all conversations for a room.
    ///
    /// Endpoint: `GET /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations`
    pub async fn list_conversations(
        &self,
        space_id: &str,
        room_id: &str,
    ) -> ApiResult<Vec<Conversation>> {
        let response = self
            .client
            .get(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations",
                self.base_url, space_id, room_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Deletes a conversation.
    ///
    /// Endpoint: `DELETE /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations/{conversation_id}`
    ///
    /// Returns `Ok(())` on success (204 No Content).
    pub async fn delete_conversation(
        &self,
        space_id: &str,
        room_id: &str,
        conversation_id: &str,
    ) -> ApiResult<()> {
        let response = self
            .client
            .delete(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations/{}",
                self.base_url, space_id, room_id, conversation_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        let status = response.status();

        if status.is_success() {
            // 204 No Content - nothing to parse
            Ok(())
        } else {
            let netdata_error: Option<NetdataErrorResponse> = response.json().await.ok();
            Err(ApiError::from_response(status, netdata_error))
        }
    }

    /// Creates a title for a conversation based on message content.
    ///
    /// Endpoint: `POST /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations/{conversation_id}/title`
    pub async fn create_conversation_title(
        &self,
        space_id: &str,
        room_id: &str,
        conversation_id: &str,
        message_content: &str,
    ) -> ApiResult<TitleResponse> {
        let response = self
            .client
            .post(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations/{}/title",
                self.base_url, space_id, room_id, conversation_id
            ))
            .timeout(DEFAULT_TIMEOUT)
            .header("Authorization", self.auth_header())
            .json(&CreateTitleRequest {
                message_content: message_content.to_string(),
            })
            .send()
            .await?;

        self.handle_response(response).await
    }

    /// Creates a chat completion with SSE streaming.
    ///
    /// Endpoint: `POST /api/v1/spaces/{space_id}/rooms/{room_id}/insights/conversations/{conversation_id}/completion`
    ///
    /// This method streams the response and calls the provided callback for each SSE chunk.
    /// The callback receives parsed JSON data from each `data: ` line.
    ///
    /// # Arguments
    ///
    /// * `space_id` - The ID of the space
    /// * `room_id` - The ID of the room
    /// * `conversation_id` - The ID of the conversation
    /// * `request` - The chat completion request
    /// * `on_chunk` - Callback function called for each SSE chunk
    ///
    /// # Rust Learning: Async Closures
    ///
    /// We use `impl Fn` to accept any function or closure that can be called
    /// multiple times. The callback is synchronous because Tauri's event
    /// emission is synchronous.
    pub async fn create_chat_completion<F>(
        &self,
        space_id: &str,
        room_id: &str,
        conversation_id: &str,
        request: ChatCompletionRequest,
        on_chunk: F,
    ) -> ApiResult<()>
    where
        F: Fn(serde_json::Value),
    {
        let response = self
            .client
            .post(format!(
                "{}/api/v1/spaces/{}/rooms/{}/insights/conversations/{}/completion",
                self.base_url, space_id, room_id, conversation_id
            ))
            .timeout(STREAMING_TIMEOUT)
            .header("Authorization", self.auth_header())
            .json(&request)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            // Try to parse error response
            let netdata_error: Option<NetdataErrorResponse> = response.json().await.ok();
            return Err(ApiError::from_response(status, netdata_error));
        }

        // Stream the response body
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(ApiError::Network)?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            // Process complete lines
            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                // Parse SSE data lines
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        on_chunk(json);
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if let Some(data) = buffer.strip_prefix("data: ") {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data.trim()) {
                on_chunk(json);
            }
        }

        Ok(())
    }
}

// =============================================================================
// Data Types
// =============================================================================
//
// These structs match the JSON responses from the Netdata Cloud API.
// Serde automatically converts between JSON and these Rust types.

/// User account information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    #[serde(rename = "avatarURL")]
    pub avatar_url: Option<String>,
}

/// A Netdata space (organization/team).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Space {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
    pub permissions: Option<Vec<String>>,
}

/// A room within a space.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub name: String,
}

/// Billing plan information for a space.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingPlan {
    pub ai: Option<AiCredits>,
}

/// AI credits information within a billing plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCredits {
    pub total_available_microcredits: Option<i64>,
}

// =============================================================================
// Data Query Types
// =============================================================================
//
// These types are used for the complex getData and getContexts endpoints.
// They mirror the JavaScript client's parameter structure.

/// Request body for the data query endpoint.
///
/// # Rust Learning: Optional Fields with `skip_serializing_if`
///
/// The `#[serde(skip_serializing_if = "Option::is_none")]` attribute
/// tells serde to omit this field from JSON if it's `None`.
/// This keeps the request body clean and matches the JS behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataQuery {
    /// Response format (default: "json2")
    #[serde(default = "default_format")]
    pub format: String,

    /// Query options
    #[serde(default = "default_data_options")]
    pub options: Vec<String>,

    /// Data scope definition
    pub scope: DataScope,

    /// Data selectors
    #[serde(default)]
    pub selectors: DataSelectors,

    /// Aggregation configuration
    pub aggregations: DataAggregations,

    /// Time window
    pub window: DataWindow,

    /// Request timeout in milliseconds
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

fn default_format() -> String {
    "json2".to_string()
}

fn default_data_options() -> Vec<String> {
    vec![
        "jsonwrap".to_string(),
        "nonzero".to_string(),
        "flip".to_string(),
        "ms".to_string(),
        "jw-anomaly-rates".to_string(),
        "minify".to_string(),
    ]
}

fn default_timeout() -> u64 {
    10000
}

/// Scope definition for data queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataScope {
    /// Context patterns (e.g., ["system.cpu"])
    pub contexts: Vec<String>,

    /// Node IDs
    pub nodes: Vec<String>,

    /// Optional instance patterns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instances: Option<Vec<String>>,

    /// Optional dimension names
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<Vec<String>>,

    /// Optional label filters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

/// Selectors for data queries (defaults to "*" for all).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DataSelectors {
    /// Context patterns to select
    #[serde(default = "default_wildcard")]
    pub contexts: Vec<String>,

    /// Node IDs to select
    #[serde(default = "default_wildcard")]
    pub nodes: Vec<String>,

    /// Instance patterns to select
    #[serde(default = "default_wildcard")]
    pub instances: Vec<String>,

    /// Dimension names to select
    #[serde(default = "default_wildcard")]
    pub dimensions: Vec<String>,

    /// Label filters to select
    #[serde(default = "default_wildcard")]
    pub labels: Vec<String>,

    /// Alert filters (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alerts: Option<Vec<String>>,
}

fn default_wildcard() -> Vec<String> {
    vec!["*".to_string()]
}

/// Aggregation configuration for data queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAggregations {
    /// Metric aggregations
    pub metrics: Vec<MetricAggregation>,

    /// Time aggregation settings
    pub time: TimeAggregation,
}

/// Individual metric aggregation configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricAggregation {
    /// Aggregation function (sum, avg, min, max, etc.)
    pub aggregation: String,

    /// Group by dimensions/nodes
    #[serde(default)]
    pub group_by: Vec<String>,

    /// Group by label keys
    #[serde(default)]
    pub group_by_label: Vec<String>,
}

/// Time aggregation settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeAggregation {
    /// Time grouping method
    pub time_group: String,

    /// Resampling interval in seconds
    pub time_resampling: i64,

    /// Additional time group options
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_group_options: Option<String>,
}

/// Time window for data queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataWindow {
    /// Unix timestamp (seconds) for start time
    pub after: i64,

    /// Unix timestamp (seconds) for end time
    pub before: i64,

    /// Number of points to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<i64>,

    /// Duration in seconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,

    /// Data tier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<i64>,

    /// Baseline window configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseline: Option<serde_json::Value>,
}

// =============================================================================
// Data Response Types
// =============================================================================
//
// These types represent the response from the getData API endpoint.
// The API uses short field names (nd, mg, sts, etc.) for efficiency.

/// Response from the data query endpoint (v3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataResponse {
    pub summary: DataSummary,
    pub result: DataResult,
    pub view: DataView,
}

/// Summary section of data response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSummary {
    #[serde(default)]
    pub nodes: Vec<NodeSummary>,
    #[serde(default)]
    pub instances: Vec<InstanceSummary>,
    #[serde(default)]
    pub dimensions: Vec<DimensionSummary>,
    #[serde(default)]
    pub labels: Vec<LabelSummary>,
}

/// Node summary with statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSummary {
    /// Node ID (shortened field name in API)
    #[serde(rename = "nd")]
    pub node_id: String,
    /// Machine GUID
    #[serde(rename = "mg")]
    pub machine_guid: String,
    /// Statistics (optional - not always present)
    #[serde(rename = "sts", default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatsSummary>,
}

/// Instance summary with statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceSummary {
    pub id: String,
    #[serde(rename = "sts", default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatsSummary>,
}

/// Dimension summary with statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimensionSummary {
    pub id: String,
    #[serde(rename = "sts", default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatsSummary>,
}

/// Label summary with values and statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelSummary {
    pub id: String,
    #[serde(rename = "sts", default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatsSummary>,
    /// Label values
    #[serde(rename = "vl", default)]
    pub values: Vec<LabelValueSummary>,
}

/// Label value summary with statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelValueSummary {
    pub id: String,
    #[serde(rename = "sts", default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatsSummary>,
}

/// Statistics summary for nodes, instances, dimensions, and labels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSummary {
    /// Anomaly rate percentage
    #[serde(rename = "arp", default)]
    pub anomaly_rate: f64,
    /// Contribution percentage
    #[serde(rename = "con", default)]
    pub contribution_percentage: f64,
}

/// Result section of data response containing the actual data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataResult {
    /// Column labels
    #[serde(default)]
    pub labels: Vec<String>,
    /// Point index mapping (column name -> index)
    #[serde(default)]
    pub point: std::collections::HashMap<String, i32>,
    /// Data rows (each row is an array of mixed types: timestamps, values, etc.)
    #[serde(default)]
    pub data: Vec<Vec<serde_json::Value>>,
}

/// View configuration section of data response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataView {
    /// Units for the data (can be various types)
    pub units: serde_json::Value,
}

// =============================================================================
// Contexts Query Types
// =============================================================================

/// Request body for the contexts query endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextsQuery {
    /// Response format (default: "json2")
    #[serde(default = "default_format")]
    pub format: String,

    /// Data scope definition
    pub scope: ContextsScope,

    /// Data selectors
    pub selectors: ContextsSelectors,

    /// Time window
    pub window: ContextsWindow,

    /// Request timeout in milliseconds
    #[serde(default = "default_contexts_timeout")]
    pub timeout: u64,
}

fn default_contexts_timeout() -> u64 {
    20000
}

/// Scope definition for contexts queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextsScope {
    /// Context patterns
    #[serde(default = "default_wildcard")]
    pub contexts: Vec<String>,

    /// Node IDs
    #[serde(default)]
    pub nodes: Vec<String>,
}

/// Selectors for contexts queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextsSelectors {
    /// Context patterns to select
    #[serde(default = "default_wildcard")]
    pub contexts: Vec<String>,

    /// Node IDs to select
    #[serde(default = "default_wildcard")]
    pub nodes: Vec<String>,
}

/// Time window for contexts queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextsWindow {
    /// Unix timestamp (seconds) for start time
    pub after: i64,

    /// Unix timestamp (seconds) for end time
    pub before: i64,
}

// =============================================================================
// Contexts Response Types
// =============================================================================

/// Response from the contexts query endpoint (v3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextsResponse {
    /// Map of context name to context info
    #[serde(default)]
    pub contexts: std::collections::HashMap<String, ContextInfo>,
}

/// Information about a single context (metric).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextInfo {
    /// Context family (grouping)
    #[serde(default)]
    pub family: String,
    /// First data entry timestamp (Unix seconds)
    #[serde(default)]
    pub first_entry: i64,
    /// Last data entry timestamp (Unix seconds)
    #[serde(default)]
    pub last_entry: i64,
}

// =============================================================================
// Conversation Types
// =============================================================================

/// A conversation in Netdata Cloud insights.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub space_id: String,
    pub room_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub quota_source: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub messages: Vec<ConversationMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<ConversationMetadata>,
    pub created_by: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Metadata for a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMetadata {
    pub usage: TokenUsage,
}

/// Token usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount_microcredits: Option<i64>,
}

/// A message within a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
    pub role: String,
    pub content: Vec<MessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadata>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Metadata for a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

/// Content block within a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Request body for creating a conversation title.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTitleRequest {
    pub message_content: String,
}

/// Response from creating a conversation title.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TitleResponse {
    pub title: String,
}

/// Request body for chat completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    /// The user message
    pub message: String,

    /// Tools to use
    #[serde(default = "default_tools")]
    pub tools: Vec<ChatTool>,

    /// Optional parent message ID for threading
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_message_id: Option<String>,
}

fn default_tools() -> Vec<ChatTool> {
    vec![ChatTool {
        name: "blocks".to_string(),
        version: 0,
    }]
}

/// A tool configuration for chat completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTool {
    pub name: String,
    pub version: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_info_deserialize() {
        let json = r#"{
            "id": "user123",
            "email": "test@example.com",
            "name": "Test User",
            "avatarURL": "https://example.com/avatar.png"
        }"#;

        let user: UserInfo = serde_json::from_str(json).unwrap();
        assert_eq!(user.id, "user123");
        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.avatar_url, Some("https://example.com/avatar.png".to_string()));
    }

    #[test]
    fn test_space_deserialize() {
        let json = r#"{
            "id": "space123",
            "name": "My Space",
            "slug": "my-space",
            "permissions": ["read", "write"]
        }"#;

        let space: Space = serde_json::from_str(json).unwrap();
        assert_eq!(space.id, "space123");
        assert_eq!(space.permissions, Some(vec!["read".to_string(), "write".to_string()]));
    }
}
