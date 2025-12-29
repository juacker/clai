//! Secure token storage using the operating system's keychain.
//!
//! This module provides secure storage for the API token using:
//! - **Linux**: libsecret (GNOME Keyring / KWallet)
//! - **macOS**: Keychain
//! - **Windows**: Credential Manager
//!
//! # Rust Learning: Why Not Just Use a File?
//!
//! Storing secrets in plain files is insecure. The OS keychain:
//! 1. Encrypts data at rest
//! 2. Requires user authentication to access
//! 3. Is the standard way to store credentials on desktop apps
//!
//! # Rust Learning: The `Mutex` Type
//!
//! In Rust, we can't mutate shared data without synchronization.
//! `Mutex<T>` (mutual exclusion) ensures only one thread can access
//! the data at a time:
//!
//! ```ignore
//! let data = mutex.lock().unwrap();  // Blocks until lock is acquired
//! // Now we have exclusive access to `data`
//! // Lock is automatically released when `data` goes out of scope
//! ```

use keyring::Entry;
use std::sync::Mutex;

/// Service name used to identify our app in the keychain.
/// This should be unique to avoid conflicts with other apps.
const SERVICE_NAME: &str = "com.juacker.clai";

/// Key name for the API token within our service.
const TOKEN_KEY: &str = "api_token";

/// Thread-safe token storage backed by the OS keychain.
///
/// # Rust Learning: Struct Definition
///
/// This struct holds our keyring entry wrapped in a Mutex.
/// The Mutex ensures thread-safe access since Tauri commands
/// can be called from multiple threads simultaneously.
pub struct TokenStorage {
    /// The keyring entry, protected by a mutex for thread safety.
    ///
    /// # Why Mutex?
    /// Tauri can invoke commands from different threads. Without Mutex,
    /// we'd have data races when multiple commands try to access the token.
    token_entry: Mutex<Entry>,
}

impl TokenStorage {
    /// Creates a new TokenStorage instance.
    ///
    /// # Errors
    ///
    /// Returns an error if the keyring service is not available on the system.
    ///
    /// # Rust Learning: `Result` Return Type
    ///
    /// This function can fail (e.g., if libsecret isn't installed on Linux),
    /// so it returns `Result<Self, keyring::Error>` instead of just `Self`.
    pub fn new() -> Result<Self, keyring::Error> {
        let entry = Entry::new(SERVICE_NAME, TOKEN_KEY)?;
        Ok(Self {
            token_entry: Mutex::new(entry),
        })
    }

    /// Stores the API token securely.
    ///
    /// # Arguments
    ///
    /// * `token` - The API token to store (Bearer token value)
    ///
    /// # Rust Learning: Borrowing with `&str`
    ///
    /// We take `&str` (a string slice/reference) instead of `String`
    /// because we only need to read the token, not own it.
    /// This is more flexible - callers can pass `&String` or `&str`.
    pub fn set_token(&self, token: &str) -> Result<(), keyring::Error> {
        let entry = self.token_entry.lock().unwrap();
        entry.set_password(token)
    }

    /// Retrieves the stored API token.
    ///
    /// # Returns
    ///
    /// - `Ok(Some(token))` - Token was found
    /// - `Ok(None)` - No token stored (user not logged in)
    /// - `Err(e)` - Error accessing keychain
    ///
    /// # Rust Learning: `Option<T>`
    ///
    /// Instead of returning `null` like JavaScript, Rust uses `Option<T>`:
    /// - `Some(value)` - We have a value
    /// - `None` - No value (like null, but type-safe)
    ///
    /// This forces callers to handle the "no value" case explicitly.
    pub fn get_token(&self) -> Result<Option<String>, keyring::Error> {
        let entry = self.token_entry.lock().unwrap();
        match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None), // Not an error, just no token
            Err(e) => Err(e),
        }
    }

    /// Removes the stored token (logout).
    ///
    /// # Rust Learning: Idempotent Operations
    ///
    /// This operation is idempotent - calling it when no token exists
    /// returns `Ok(())` instead of an error. This simplifies logout logic.
    pub fn clear_token(&self) -> Result<(), keyring::Error> {
        let entry = self.token_entry.lock().unwrap();
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // Already cleared, not an error
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a working keyring on the system.
    // They may fail in CI environments without a keyring daemon.

    #[test]
    #[ignore] // Run with `cargo test -- --ignored` when keyring is available
    fn test_token_storage_roundtrip() {
        let storage = TokenStorage::new().expect("Failed to create token storage");

        // Clear any existing token
        storage.clear_token().expect("Failed to clear token");

        // Initially no token
        assert_eq!(storage.get_token().unwrap(), None);

        // Store a token
        storage
            .set_token("test_token_12345")
            .expect("Failed to set token");

        // Retrieve it
        assert_eq!(
            storage.get_token().unwrap(),
            Some("test_token_12345".to_string())
        );

        // Clear it
        storage.clear_token().expect("Failed to clear token");

        // Should be gone
        assert_eq!(storage.get_token().unwrap(), None);
    }
}
