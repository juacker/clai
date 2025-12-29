//! HTTP client configuration for API requests.
//!
//! This module creates a configured `reqwest::Client` that is reused
//! across all API requests for optimal performance.
//!
//! # Rust Learning: Why Reuse the Client?
//!
//! Unlike JavaScript's `fetch()` which creates a new connection each time,
//! `reqwest::Client` maintains a connection pool internally. Reusing it:
//! - Keeps TCP connections alive (faster subsequent requests)
//! - Reuses TLS sessions (less handshake overhead)
//! - Is the recommended pattern in Rust
//!
//! Think of it like axios with `keepAlive: true`.
//!
//! # Timeout Strategy
//!
//! We don't set a default timeout on the client because different endpoints
//! need different timeouts:
//! - Regular API calls: 30 seconds
//! - Chat completion (SSE streaming): 5+ minutes
//!
//! Instead, timeouts are set per-request in the API methods.

use reqwest::header::{self, HeaderMap, HeaderValue};
use reqwest::Client;
use std::time::Duration;

/// Default request timeout for regular API calls.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Timeout for streaming endpoints (chat completion).
/// SSE streams can take several minutes for complex queries.
pub const STREAMING_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes

/// User agent string sent with all requests.
const USER_AGENT: &str = concat!("clai/", env!("CARGO_PKG_VERSION"));

/// Creates a configured HTTP client for API requests.
///
/// The returned client should be created once at application startup
/// and reused for all requests. It features:
/// - Connection pooling (automatic)
/// - 30-second timeout
/// - JSON content type by default
/// - Custom user agent
///
/// # Rust Learning: Builder Pattern
///
/// `Client::builder()` returns a `ClientBuilder` that lets us configure
/// the client step by step. This is a common Rust pattern for types
/// with many optional settings.
///
/// Each method returns `self`, allowing chaining:
/// ```ignore
/// Client::builder()
///     .timeout(...)
///     .user_agent(...)
///     .build()
/// ```
///
/// # Panics
///
/// Panics if the HTTP client cannot be built (should never happen with
/// our configuration, but Rust requires us to handle it).
pub fn create_client() -> Client {
    // Build default headers that will be sent with every request
    let mut default_headers = HeaderMap::new();

    // Set Content-Type to JSON for all requests
    // This matches the axios default in the JS client
    default_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    // Set Accept header to prefer JSON responses
    default_headers.insert(
        header::ACCEPT,
        HeaderValue::from_static("application/json"),
    );

    Client::builder()
        // No default timeout - set per-request based on endpoint type
        // (regular API: 30s, streaming: 5min)
        // Identify our app to the server
        .user_agent(USER_AGENT)
        // Headers sent with every request
        .default_headers(default_headers)
        // Enable gzip/deflate decompression automatically
        .gzip(true)
        // Build the client - this shouldn't fail with our config
        .build()
        .expect("Failed to create HTTP client")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_client() {
        // Just verify we can create a client without panicking
        let _client = create_client();
    }

    #[test]
    fn test_user_agent_format() {
        // Verify user agent follows expected format
        assert!(USER_AGENT.starts_with("clai/"));
    }
}
