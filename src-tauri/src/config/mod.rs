//! Configuration management for CLAI.
//!
//! This module handles loading and saving the application configuration
//! to a JSON file in the platform-specific config directory.

pub mod types;

pub use types::{
    AgentConfig, AiProvider, ClaiConfig, ExecutionCapabilityConfig, FilesystemPathAccess,
    FilesystemPathGrant, McpServerAuth, McpServerConfig, McpServerIntegrationType,
    McpServerTransport, ShellAccessMode,
};

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Name of the config file.
const CONFIG_FILE_NAME: &str = "config.json";

/// Application identifier for config directory.
const APP_IDENTIFIER: &str = "clai";

/// Manages loading and saving the application configuration.
pub struct ConfigManager {
    /// Cached configuration (protected by mutex).
    config: Mutex<ClaiConfig>,

    /// Path to the config file.
    config_path: PathBuf,
}

impl ConfigManager {
    /// Creates a new ConfigManager, loading existing config or creating default.
    ///
    /// If no automations exist in the config, creates the default one.
    pub fn new() -> Result<Self, ConfigError> {
        let config_path = Self::get_config_path()?;

        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| ConfigError::Io {
                operation: "create config directory".to_string(),
                source: e,
            })?;
        }

        let mut config = if config_path.exists() {
            Self::load_from_file(&config_path)?
        } else {
            ClaiConfig::default()
        };

        let needs_save = if config.agents.is_empty() {
            config.agents.push(AgentConfig::default_agent());
            true
        } else {
            false
        };

        let manager = Self {
            config: Mutex::new(config),
            config_path,
        };

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
    pub fn save(&self) -> Result<(), ConfigError> {
        let config = self.config.lock().unwrap();
        self.save_to_file(&config)
    }

    /// Saves config to file with atomic write.
    fn save_to_file(&self, config: &ClaiConfig) -> Result<(), ConfigError> {
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| ConfigError::Serialize { source: e })?;

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

        fs::rename(&temp_path, &self.config_path).map_err(|e| ConfigError::Io {
            operation: "rename temp config file".to_string(),
            source: e,
        })?;

        Ok(())
    }

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

    /// Gets all configured MCP servers.
    pub fn get_mcp_servers(&self) -> Vec<McpServerConfig> {
        self.config.lock().unwrap().mcp_servers.clone()
    }

    /// Gets a configured MCP server by ID.
    pub fn get_mcp_server(&self, id: &str) -> Option<McpServerConfig> {
        self.config
            .lock()
            .unwrap()
            .mcp_servers
            .iter()
            .find(|server| server.id == id)
            .cloned()
    }

    /// Adds a new MCP server and saves config.
    pub fn add_mcp_server(&self, server: McpServerConfig) -> Result<(), ConfigError> {
        self.update(|config| {
            config.mcp_servers.push(server);
        })
    }

    /// Updates an existing MCP server and saves config.
    pub fn update_mcp_server<F>(&self, id: &str, updater: F) -> Result<(), ConfigError>
    where
        F: FnOnce(&mut McpServerConfig),
    {
        self.update(|config| {
            if let Some(server) = config.mcp_servers.iter_mut().find(|server| server.id == id) {
                updater(server);
                server.updated_at = chrono::Utc::now().to_rfc3339();
            }
        })
    }

    /// Removes an MCP server and clears stale automation selections.
    ///
    /// Returns true if the server was removed.
    pub fn remove_mcp_server(&self, id: &str) -> Result<bool, ConfigError> {
        let mut removed = false;
        self.update(|config| {
            let initial_len = config.mcp_servers.len();
            config.mcp_servers.retain(|server| server.id != id);
            removed = config.mcp_servers.len() != initial_len;

            if removed {
                for agent in &mut config.agents {
                    agent
                        .selected_mcp_server_ids
                        .retain(|server_id| server_id != id);
                }
            }
        })?;
        Ok(removed)
    }

    /// Gets all automations.
    pub fn get_agents(&self) -> Vec<AgentConfig> {
        self.config.lock().unwrap().agents.clone()
    }

    /// Gets an automation by ID.
    pub fn get_agent(&self, id: &str) -> Option<AgentConfig> {
        self.config
            .lock()
            .unwrap()
            .agents
            .iter()
            .find(|agent| agent.id == id)
            .cloned()
    }

    /// Adds a new automation and saves config.
    pub fn add_agent(&self, agent: AgentConfig) -> Result<(), ConfigError> {
        self.update(|config| {
            config.agents.push(agent);
        })
    }

    /// Updates an existing automation and saves config.
    pub fn update_agent<F>(&self, id: &str, updater: F) -> Result<(), ConfigError>
    where
        F: FnOnce(&mut AgentConfig),
    {
        self.update(|config| {
            if let Some(agent) = config.agents.iter_mut().find(|agent| agent.id == id) {
                updater(agent);
                agent.updated_at = chrono::Utc::now().to_rfc3339();
            }
        })
    }

    /// Removes an automation by ID and saves config.
    ///
    /// Returns true if the automation was removed.
    pub fn remove_agent(&self, id: &str) -> Result<bool, ConfigError> {
        let mut removed = false;
        self.update(|config| {
            let initial_len = config.agents.len();
            config.agents.retain(|agent| agent.id != id);
            removed = config.agents.len() != initial_len;
        })?;
        Ok(removed)
    }

    /// Enables or disables an automation globally and saves config.
    pub fn set_agent_enabled(&self, agent_id: &str, enabled: bool) -> Result<bool, ConfigError> {
        let mut changed = false;
        self.update(|config| {
            if let Some(agent) = config.agents.iter_mut().find(|agent| agent.id == agent_id) {
                changed = agent.set_enabled(enabled);
            }
        })?;
        Ok(changed)
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

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

        manager
            .set_ai_provider(AiProvider::Claude { model: None })
            .unwrap();

        assert!(manager.config_path.exists());

        let loaded = ConfigManager::load_from_file(&manager.config_path).unwrap();
        assert!(matches!(
            loaded.ai_provider,
            Some(AiProvider::Claude { .. })
        ));
    }

    #[test]
    fn test_remove_mcp_server_cleans_agent_selection() {
        let (manager, _temp_dir) = create_test_manager();

        let server = McpServerConfig::new(
            "Filesystem".to_string(),
            McpServerTransport::Stdio {
                command: "npx".to_string(),
                args: vec!["@modelcontextprotocol/server-filesystem".to_string()],
            },
        );
        let server_id = server.id.clone();
        manager.add_mcp_server(server).unwrap();

        let mut agent = AgentConfig::new("Test".to_string(), "Desc".to_string(), 5);
        agent.selected_mcp_server_ids = vec![server_id.clone()];
        manager.add_agent(agent).unwrap();

        assert!(manager.remove_mcp_server(&server_id).unwrap());

        let agent = manager.get_agents().into_iter().next().unwrap();
        assert!(agent.selected_mcp_server_ids.is_empty());
    }
}
