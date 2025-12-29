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

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::api::client::DEFAULT_TIMEOUT;
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
