//! Configuration management for CLAI.
//!
//! This module handles loading and saving the application configuration
//! to a JSON file in the platform-specific config directory.
//!
//! # Config File Locations
//!
//! - Linux: `~/.config/clai/config.json`
//! - macOS: `~/Library/Application Support/clai/config.json`
//! - Windows: `%APPDATA%/clai/config.json`

pub mod types;

pub use types::{
    AgentDefinition, AiProvider, AutopilotStatus, ClaiConfig, ProviderInfo, SpaceAutopilot,
    SpaceConfig, SpaceRoomPair, DEFAULT_AGENT_ID,
};

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Name of the config file.
const CONFIG_FILE_NAME: &str = "config.json";

/// Application identifier for config directory.
const APP_IDENTIFIER: &str = "clai";

// =============================================================================
// Config Manager
// =============================================================================

/// Manages loading and saving the application configuration.
///
/// The config is cached in memory and written to disk on changes.
/// Thread-safe via internal Mutex.
pub struct ConfigManager {
    /// Cached configuration (protected by mutex).
    config: Mutex<ClaiConfig>,

    /// Path to the config file.
    config_path: PathBuf,
}

impl ConfigManager {
    /// Creates a new ConfigManager, loading existing config or creating default.
    ///
    /// If no agents exist in the config, creates the default agent.
    pub fn new() -> Result<Self, ConfigError> {
        let config_path = Self::get_config_path()?;

        // Ensure config directory exists
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| ConfigError::Io {
                operation: "create config directory".to_string(),
                source: e,
            })?;
        }

        // Load existing config or create default
        let mut config = if config_path.exists() {
            Self::load_from_file(&config_path)?
        } else {
            ClaiConfig::default()
        };

        // Create default agent if no agents exist
        let needs_save = if config.agents.is_empty() {
            config.agents.push(AgentDefinition::default_agent());
            true
        } else {
            false
        };

        let manager = Self {
            config: Mutex::new(config),
            config_path,
        };

        // Save if we added the default agent
        if needs_save {
            manager.save()?;
        }

        Ok(manager)
    }

    /// Gets the platform-specific config file path.
    fn get_config_path() -> Result<PathBuf, ConfigError> {
        let config_dir = dirs::config_dir().ok_or(ConfigError::NoConfigDir)?;

        Ok(config_dir.join(APP_IDENTIFIER).join(CONFIG_FILE_NAME))
    }

    /// Loads config from a file.
    fn load_from_file(path: &PathBuf) -> Result<ClaiConfig, ConfigError> {
        let contents = fs::read_to_string(path).map_err(|e| ConfigError::Io {
            operation: "read config file".to_string(),
            source: e,
        })?;

        serde_json::from_str(&contents).map_err(|e| ConfigError::Parse { source: e })
    }

    /// Saves the current config to disk.
    ///
    /// Uses atomic write (write to temp file, then rename) to prevent corruption.
    pub fn save(&self) -> Result<(), ConfigError> {
        let config = self.config.lock().unwrap();
        self.save_to_file(&config)
    }

    /// Saves config to file with atomic write.
    fn save_to_file(&self, config: &ClaiConfig) -> Result<(), ConfigError> {
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| ConfigError::Serialize { source: e })?;

        // Write to temp file first
        let temp_path = self.config_path.with_extension("json.tmp");

        let mut file = fs::File::create(&temp_path).map_err(|e| ConfigError::Io {
            operation: "create temp config file".to_string(),
            source: e,
        })?;

        file.write_all(json.as_bytes())
            .map_err(|e| ConfigError::Io {
                operation: "write temp config file".to_string(),
                source: e,
            })?;

        file.sync_all().map_err(|e| ConfigError::Io {
            operation: "sync temp config file".to_string(),
            source: e,
        })?;

        // Atomic rename
        fs::rename(&temp_path, &self.config_path).map_err(|e| ConfigError::Io {
            operation: "rename temp config file".to_string(),
            source: e,
        })?;

        Ok(())
    }

    // =========================================================================
    // Config Access
    // =========================================================================

    /// Gets a clone of the current config.
    pub fn get(&self) -> ClaiConfig {
        self.config.lock().unwrap().clone()
    }

    /// Updates the config and saves to disk.
    pub fn update<F>(&self, f: F) -> Result<(), ConfigError>
    where
        F: FnOnce(&mut ClaiConfig),
    {
        let mut config = self.config.lock().unwrap();
        f(&mut config);
        self.save_to_file(&config)
    }

    // =========================================================================
    // Space Config Helpers
    // =========================================================================

    /// Gets config for a space.
    pub fn get_space_config(&self, space_id: &str) -> SpaceConfig {
        let config = self.config.lock().unwrap();
        config.spaces.get(space_id).cloned().unwrap_or_default()
    }

    // =========================================================================
    // Auto-pilot Helpers
    // =========================================================================

    /// Gets auto-pilot config for a space.
    pub fn get_space_autopilot(&self, space_id: &str) -> SpaceAutopilot {
        self.get_space_config(space_id).autopilot
    }

    /// Checks if auto-pilot is enabled for a specific room.
    pub fn is_autopilot_enabled(&self, space_id: &str, room_id: &str) -> bool {
        self.get_space_autopilot(space_id).is_room_enabled(room_id)
    }

    /// Enables auto-pilot for a room and saves config.
    pub fn enable_autopilot(&self, space_id: &str, room_id: &str) -> Result<(), ConfigError> {
        self.update(|config| {
            let space_config = config.spaces.entry(space_id.to_string()).or_default();
            space_config.autopilot.enable_room(room_id);
        })
    }

    /// Disables auto-pilot for a room and saves config.
    pub fn disable_autopilot(&self, space_id: &str, room_id: &str) -> Result<(), ConfigError> {
        self.update(|config| {
            if let Some(space_config) = config.spaces.get_mut(space_id) {
                space_config.autopilot.disable_room(room_id);

                // Clean up empty space configs (no autopilot rooms)
                if !space_config.autopilot.has_any_enabled() {
                    config.spaces.remove(space_id);
                }
            }
        })
    }

    /// Gets all rooms with auto-pilot enabled for a space.
    pub fn get_enabled_rooms(&self, space_id: &str) -> Vec<String> {
        self.get_space_autopilot(space_id).enabled_rooms
    }

    // =========================================================================
    // AI Provider Helpers
    // =========================================================================

    /// Gets the current AI provider.
    pub fn get_ai_provider(&self) -> Option<AiProvider> {
        self.config.lock().unwrap().ai_provider.clone()
    }

    /// Sets the AI provider and saves config.
    pub fn set_ai_provider(&self, provider: AiProvider) -> Result<(), ConfigError> {
        self.update(|config| {
            config.ai_provider = Some(provider);
        })
    }

    /// Clears the AI provider and saves config.
    pub fn clear_ai_provider(&self) -> Result<(), ConfigError> {
        self.update(|config| {
            config.ai_provider = None;
        })
    }

    /// Checks if an AI provider is configured.
    pub fn has_ai_provider(&self) -> bool {
        self.config.lock().unwrap().ai_provider.is_some()
    }

    // =========================================================================
    // Agent Helpers
    // =========================================================================

    /// Gets all agents.
    pub fn get_agents(&self) -> Vec<AgentDefinition> {
        self.config.lock().unwrap().agents.clone()
    }

    /// Gets an agent by ID.
    pub fn get_agent(&self, id: &str) -> Option<AgentDefinition> {
        self.config
            .lock()
            .unwrap()
            .agents
            .iter()
            .find(|a| a.id == id)
            .cloned()
    }

    /// Adds a new agent and saves config.
    pub fn add_agent(&self, agent: AgentDefinition) -> Result<(), ConfigError> {
        self.update(|config| {
            config.agents.push(agent);
        })
    }

    /// Updates an existing agent and saves config.
    ///
    /// Returns an error if the agent doesn't exist.
    pub fn update_agent<F>(&self, id: &str, updater: F) -> Result<(), ConfigError>
    where
        F: FnOnce(&mut AgentDefinition),
    {
        self.update(|config| {
            if let Some(agent) = config.agents.iter_mut().find(|a| a.id == id) {
                updater(agent);
                agent.updated_at = chrono::Utc::now().to_rfc3339();
            }
        })
    }

    /// Removes an agent by ID and saves config.
    ///
    /// Returns true if the agent was removed.
    pub fn remove_agent(&self, id: &str) -> Result<bool, ConfigError> {
        let mut removed = false;
        self.update(|config| {
            let initial_len = config.agents.len();
            config.agents.retain(|a| a.id != id);
            removed = config.agents.len() != initial_len;
        })?;
        Ok(removed)
    }

    /// Enables an agent for a specific space/room and saves config.
    pub fn enable_agent_for_room(
        &self,
        agent_id: &str,
        space_id: &str,
        room_id: &str,
    ) -> Result<bool, ConfigError> {
        let mut enabled = false;
        self.update(|config| {
            if let Some(agent) = config.agents.iter_mut().find(|a| a.id == agent_id) {
                enabled = agent.enable_for(space_id, room_id);
            }
        })?;
        Ok(enabled)
    }

    /// Disables an agent for a specific space/room and saves config.
    pub fn disable_agent_for_room(
        &self,
        agent_id: &str,
        space_id: &str,
        room_id: &str,
    ) -> Result<bool, ConfigError> {
        let mut disabled = false;
        self.update(|config| {
            if let Some(agent) = config.agents.iter_mut().find(|a| a.id == agent_id) {
                disabled = agent.disable_for(space_id, room_id);
            }
        })?;
        Ok(disabled)
    }

    /// Gets all agents enabled for a specific space/room.
    pub fn get_agents_for_room(&self, space_id: &str, room_id: &str) -> Vec<AgentDefinition> {
        self.config
            .lock()
            .unwrap()
            .agents
            .iter()
            .filter(|a| a.is_enabled_for(space_id, room_id))
            .cloned()
            .collect()
    }

    /// Checks if any agents are enabled for a specific space/room.
    pub fn has_agents_enabled(&self, space_id: &str, room_id: &str) -> bool {
        self.config
            .lock()
            .unwrap()
            .agents
            .iter()
            .any(|a| a.is_enabled_for(space_id, room_id))
    }

    /// Counts agents enabled for a specific space/room.
    pub fn count_agents_enabled(&self, space_id: &str, room_id: &str) -> usize {
        self.config
            .lock()
            .unwrap()
            .agents
            .iter()
            .filter(|a| a.is_enabled_for(space_id, room_id))
            .count()
    }
}

// =============================================================================
// Errors
// =============================================================================

/// Errors that can occur during config operations.
#[derive(Debug)]
pub enum ConfigError {
    /// Could not determine config directory.
    NoConfigDir,

    /// IO error during config operations.
    Io {
        operation: String,
        source: std::io::Error,
    },

    /// Error parsing config file.
    Parse { source: serde_json::Error },

    /// Error serializing config.
    Serialize { source: serde_json::Error },
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::NoConfigDir => write!(f, "Could not determine config directory"),
            ConfigError::Io { operation, source } => {
                write!(f, "Failed to {}: {}", operation, source)
            }
            ConfigError::Parse { source } => write!(f, "Failed to parse config: {}", source),
            ConfigError::Serialize { source } => {
                write!(f, "Failed to serialize config: {}", source)
            }
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigError::NoConfigDir => None,
            ConfigError::Io { source, .. } => Some(source),
            ConfigError::Parse { source } => Some(source),
            ConfigError::Serialize { source } => Some(source),
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Helper to create a ConfigManager with a temp directory.
    fn create_test_manager() -> (ConfigManager, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("config.json");

        let manager = ConfigManager {
            config: Mutex::new(ClaiConfig::default()),
            config_path,
        };

        (manager, temp_dir)
    }

    #[test]
    fn test_config_manager_save_load() {
        let (manager, _temp_dir) = create_test_manager();

        // Enable autopilot
        manager.enable_autopilot("space-1", "room-1").unwrap();
        manager.enable_autopilot("space-1", "room-2").unwrap();

        // Verify in memory
        assert!(manager.is_autopilot_enabled("space-1", "room-1"));
        assert!(manager.is_autopilot_enabled("space-1", "room-2"));
        assert!(!manager.is_autopilot_enabled("space-1", "room-3"));

        // Verify file was created
        assert!(manager.config_path.exists());

        // Load from file
        let loaded = ConfigManager::load_from_file(&manager.config_path).unwrap();
        assert!(loaded
            .spaces
            .get("space-1")
            .unwrap()
            .autopilot
            .is_room_enabled("room-1"));
    }

    #[test]
    fn test_disable_autopilot_cleans_up() {
        let (manager, _temp_dir) = create_test_manager();

        manager.enable_autopilot("space-1", "room-1").unwrap();
        assert!(manager.get().spaces.contains_key("space-1"));

        manager.disable_autopilot("space-1", "room-1").unwrap();
        assert!(!manager.get().spaces.contains_key("space-1"));
    }

    #[test]
    fn test_get_enabled_rooms() {
        let (manager, _temp_dir) = create_test_manager();

        manager.enable_autopilot("space-1", "room-a").unwrap();
        manager.enable_autopilot("space-1", "room-b").unwrap();

        let rooms = manager.get_enabled_rooms("space-1");
        assert_eq!(rooms.len(), 2);
        assert!(rooms.contains(&"room-a".to_string()));
        assert!(rooms.contains(&"room-b".to_string()));
    }
}
