//! Configuration types for CLAI.
//!
//! This module defines the configuration structures that are persisted
//! to disk and shared across the application.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_true() -> bool {
    true
}

// =============================================================================
// AI Provider
// =============================================================================

/// Supported AI providers for agents.
///
/// Each provider corresponds to a CLI tool that supports MCP.
/// The provider is a global setting - all agents use the same provider.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AiProvider {
    /// OpenCode CLI (opencode) - open source AI coding agent
    OpenCode {
        /// Optional model to use (e.g., "anthropic/claude-sonnet-4-5")
        /// If None, uses the CLI's default model.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Claude Code CLI (claude)
    Claude {
        /// Optional model to use (e.g., "claude-sonnet-4-5-20250514")
        /// If None, uses the CLI's default model.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Gemini CLI (gemini)
    Gemini {
        /// Optional model to use (e.g., "gemini-2.5-flash")
        /// If None, uses the CLI's default model.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// OpenAI Codex CLI (codex)
    Codex {
        /// Optional model to use
        /// If None, uses the CLI's default model.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },

    /// Custom CLI command
    Custom {
        /// The command to run (e.g., "my-ai-cli")
        command: String,

        /// Additional arguments to pass before the prompt
        #[serde(default)]
        args: Vec<String>,

        /// Optional model to use
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
}

impl AiProvider {
    /// Returns the CLI command for this provider.
    pub fn command(&self) -> &str {
        match self {
            AiProvider::OpenCode { .. } => "opencode",
            AiProvider::Claude { .. } => "claude",
            AiProvider::Gemini { .. } => "gemini",
            AiProvider::Codex { .. } => "codex",
            AiProvider::Custom { command, .. } => command,
        }
    }

    /// Returns a human-readable name for this provider.
    pub fn display_name(&self) -> &str {
        match self {
            AiProvider::OpenCode { .. } => "OpenCode",
            AiProvider::Claude { .. } => "Claude Code",
            AiProvider::Gemini { .. } => "Gemini CLI",
            AiProvider::Codex { .. } => "OpenAI Codex",
            AiProvider::Custom { command, .. } => command,
        }
    }

    /// Returns the selected model (if any).
    pub fn model(&self) -> Option<&str> {
        match self {
            AiProvider::OpenCode { model } => model.as_deref(),
            AiProvider::Claude { model } => model.as_deref(),
            AiProvider::Gemini { model } => model.as_deref(),
            AiProvider::Codex { model } => model.as_deref(),
            AiProvider::Custom { model, .. } => model.as_deref(),
        }
    }

    /// Returns a new provider with the specified model.
    pub fn with_model(self, model: Option<String>) -> Self {
        match self {
            AiProvider::OpenCode { .. } => AiProvider::OpenCode { model },
            AiProvider::Claude { .. } => AiProvider::Claude { model },
            AiProvider::Gemini { .. } => AiProvider::Gemini { model },
            AiProvider::Codex { .. } => AiProvider::Codex { model },
            AiProvider::Custom { command, args, .. } => AiProvider::Custom {
                command,
                args,
                model,
            },
        }
    }

    /// Returns the provider type as a string (for comparison without model).
    pub fn provider_type(&self) -> &str {
        match self {
            AiProvider::OpenCode { .. } => "opencode",
            AiProvider::Claude { .. } => "claude",
            AiProvider::Gemini { .. } => "gemini",
            AiProvider::Codex { .. } => "codex",
            AiProvider::Custom { .. } => "custom",
        }
    }
}

// =============================================================================
// MCP Server Config
// =============================================================================

/// User-configured MCP server transport.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpServerTransport {
    /// Spawn a local MCP server via stdio.
    Stdio {
        /// Command to spawn.
        command: String,
        /// Arguments passed to the command.
        #[serde(default)]
        args: Vec<String>,
    },

    /// Connect to a remote MCP server over HTTP.
    Http {
        /// Base URL for the remote MCP server.
        url: String,
    },
}

/// Auth mode for a configured MCP server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpServerAuth {
    /// No authentication configured.
    #[default]
    None,

    /// Bearer token authentication stored in secure keyring storage.
    BearerToken {
        /// Reference to the token in secure storage.
        secret_ref: String,
    },
}

/// User-configured MCP server definition persisted in app config.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpServerConfig {
    /// Unique identifier for this server.
    pub id: String,

    /// Human-readable label shown in settings.
    pub name: String,

    /// Whether this server is available for selection.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// How to connect to the server.
    pub transport: McpServerTransport,

    /// Authentication metadata for the server.
    #[serde(default)]
    pub auth: McpServerAuth,

    /// When the server was created (ISO 8601).
    pub created_at: String,

    /// When the server was last modified (ISO 8601).
    pub updated_at: String,
}

impl McpServerConfig {
    /// Creates a new MCP server with a generated UUID.
    pub fn new(name: String, transport: McpServerTransport) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            enabled: true,
            transport,
            auth: McpServerAuth::None,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

// =============================================================================
// Agent Config
// =============================================================================

/// Fixed ID for the default agent.
///
/// Using a predictable ID ensures consistency across config recovery scenarios.
/// The default agent is created automatically if no agents exist.
pub const DEFAULT_AGENT_ID: &str = "00000000-0000-0000-0000-000000000001";

/// User-defined autonomous agent stored in configuration.
///
/// This is the persisted config format. For the runtime definition used by
/// the scheduler and executor, see `crate::agents::AgentDefinition`.
///
/// Agents monitor infrastructure and perform automated analysis.
/// Each agent can be enabled for specific space/room combinations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Unique identifier (UUID).
    ///
    /// Auto-generated for user-created agents.
    /// Default agent uses fixed ID: `DEFAULT_AGENT_ID`.
    pub id: String,

    /// Display name (user-provided).
    pub name: String,

    /// Description of what the agent does (user-provided).
    ///
    /// Supports full Markdown formatting for rich context.
    /// Users can include detailed instructions, exceptions, and domain knowledge.
    /// Example: "Monitor CPU but ignore spikes on db-server-01 during backup window (2-4am UTC)"
    ///
    /// This description is used to generate the system prompt via template.
    pub description: String,

    /// How often the agent runs (in minutes).
    pub interval_minutes: u32,

    /// Whether this agent is enabled globally.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Space/room pairs where this agent is enabled.
    ///
    /// Currently only the first entry is used.
    #[serde(default)]
    pub enabled_rooms: Vec<SpaceRoomPair>,

    /// User-selected MCP servers available to this agent.
    #[serde(default)]
    pub selected_mcp_server_ids: Vec<String>,

    /// When the agent was created (ISO 8601).
    pub created_at: String,

    /// When the agent was last modified (ISO 8601).
    pub updated_at: String,
}

impl AgentConfig {
    /// Creates the default agent with fixed ID.
    ///
    /// This agent is created automatically if no agents exist in the config.
    /// It is not enabled for any rooms by default.
    pub fn default_agent() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: DEFAULT_AGENT_ID.to_string(),
            name: "Infrastructure Health Monitor".to_string(),
            description: r#"Monitor infrastructure health by checking for anomalies and investigating root causes.

## What to Monitor
- CPU, memory, disk, and network metrics
- Active alerts and their severity
- Anomaly patterns and trends

## Investigation Process
1. Query for current anomalies and alerts
2. Investigate root causes of any issues found
3. Analyze related metrics for context
4. Visualize findings with relevant charts

## Reporting
- Provide actionable insights
- Highlight critical issues first
- Suggest next steps when appropriate
- Keep status updates concise when healthy"#
                .to_string(),
            interval_minutes: 5,
            enabled: false,
            enabled_rooms: vec![],
            selected_mcp_server_ids: vec![],
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// Creates a new agent with a generated UUID.
    pub fn new(name: String, description: String, interval_minutes: u32) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            description,
            interval_minutes,
            enabled: false,
            enabled_rooms: vec![],
            selected_mcp_server_ids: vec![],
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// Checks if this is the default agent.
    pub fn is_default(&self) -> bool {
        self.id == DEFAULT_AGENT_ID
    }

    /// Returns the static list of required tools for all agents.
    ///
    /// Currently all agents use the same tools. This may be extended
    /// in the future to support custom tool configurations.
    pub fn required_tools(&self) -> Vec<&'static str> {
        vec!["netdata", "dashboard", "tabs"]
    }

    /// Generates the system prompt from the description using the template.
    pub fn generate_prompt(&self) -> String {
        crate::agents::template::generate_prompt(&self.description)
    }

    /// Checks if this agent is enabled for a specific space/room.
    pub fn is_enabled_for(&self, space_id: &str, room_id: &str) -> bool {
        self.enabled_rooms
            .first()
            .map(|r| r.space_id == space_id && r.room_id == room_id)
            .unwrap_or(false)
    }

    /// Enables this agent for a space/room.
    ///
    /// Returns true if the room was added (wasn't already enabled).
    pub fn enable_for(&mut self, space_id: &str, room_id: &str) -> bool {
        let next = SpaceRoomPair {
            space_id: space_id.to_string(),
            room_id: room_id.to_string(),
        };

        let changed = self.enabled_rooms.first() != Some(&next) || self.enabled_rooms.len() != 1;
        if changed {
            self.enabled_rooms.clear();
            self.enabled_rooms.push(next);
            self.updated_at = chrono::Utc::now().to_rfc3339();
            true
        } else {
            false
        }
    }

    /// Disables this agent for a space/room.
    ///
    /// Returns true if the room was removed (was enabled).
    pub fn disable_for(&mut self, space_id: &str, room_id: &str) -> bool {
        let should_clear = self
            .enabled_rooms
            .first()
            .map(|r| r.space_id == space_id && r.room_id == room_id)
            .unwrap_or(false);
        if should_clear {
            self.enabled_rooms.clear();
            self.updated_at = chrono::Utc::now().to_rfc3339();
            true
        } else {
            false
        }
    }

    /// Disables this agent for all rooms in a space.
    pub fn disable_for_space(&mut self, space_id: &str) {
        let initial_len = self.enabled_rooms.len();
        self.enabled_rooms.retain(|r| r.space_id != space_id);
        if self.enabled_rooms.len() != initial_len {
            self.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Returns the single assigned room scope, if any.
    pub fn assigned_room(&self) -> Option<&SpaceRoomPair> {
        self.enabled_rooms.first()
    }

    /// Updates the global enabled state.
    pub fn set_enabled(&mut self, enabled: bool) -> bool {
        if self.enabled != enabled {
            self.enabled = enabled;
            self.updated_at = chrono::Utc::now().to_rfc3339();
            true
        } else {
            false
        }
    }
}

/// Identifies a specific room within a space.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpaceRoomPair {
    pub space_id: String,
    pub room_id: String,
}

// =============================================================================
// Main Config
// =============================================================================

/// Root configuration structure for CLAI.
///
/// This is persisted to a JSON file in the app's config directory.
/// All settings should be added here as the application grows.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaiConfig {
    /// Global AI provider for all agents.
    ///
    /// This must be set before enabling agents.
    /// The user selects their preferred provider (Claude, Gemini, Codex)
    /// and all agents will use it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_provider: Option<AiProvider>,

    /// Default model for the app-owned assistant runtime.
    ///
    /// This is used by interactive tab conversations and scheduled background
    /// agents that run through the assistant engine.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assistant_default_model: Option<String>,

    /// User-defined autonomous agents.
    ///
    /// Agents are global and can be enabled for specific space/room combinations.
    /// If empty on first load, a default agent will be created.
    #[serde(default)]
    pub agents: Vec<AgentConfig>,

    /// User-configured MCP servers.
    #[serde(default)]
    pub mcp_servers: Vec<McpServerConfig>,

    /// Per-space configuration (key is space UUID).
    ///
    /// Kept for future space-specific settings.
    #[serde(default)]
    pub spaces: HashMap<String, SpaceConfig>,
}

// =============================================================================
// Space Config
// =============================================================================

/// Configuration for a single space.
///
/// Groups all space-specific settings together.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpaceConfig {
    /// Auto-pilot settings for this space.
    #[serde(default)]
    pub autopilot: SpaceAutopilot,
    // Future space-specific settings can be added here:
    // pub notifications: SpaceNotificationSettings,
    // pub default_room: Option<String>,
}

// =============================================================================
// Auto-pilot Config
// =============================================================================

/// Auto-pilot configuration for a single space.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpaceAutopilot {
    /// List of room UUIDs where auto-pilot is enabled.
    ///
    /// If this contains the "All Nodes" room ID, it covers the entire space
    /// and other rooms cannot be individually enabled.
    #[serde(default)]
    pub enabled_rooms: Vec<String>,
}

impl SpaceAutopilot {
    /// Checks if auto-pilot is enabled for a specific room.
    pub fn is_room_enabled(&self, room_id: &str) -> bool {
        self.enabled_rooms.contains(&room_id.to_string())
    }

    /// Enables auto-pilot for a room.
    pub fn enable_room(&mut self, room_id: &str) {
        if !self.is_room_enabled(room_id) {
            self.enabled_rooms.push(room_id.to_string());
        }
    }

    /// Disables auto-pilot for a room.
    pub fn disable_room(&mut self, room_id: &str) {
        self.enabled_rooms.retain(|id| id != room_id);
    }

    /// Checks if any room has auto-pilot enabled.
    pub fn has_any_enabled(&self) -> bool {
        !self.enabled_rooms.is_empty()
    }
}

// =============================================================================
// Auto-pilot Status (for UI)
// =============================================================================

/// Auto-pilot status returned to the UI.
///
/// This is computed based on the config, current room, and space state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutopilotStatus {
    /// Is auto-pilot active for the current room?
    pub enabled: bool,

    /// Can the user toggle auto-pilot in the current room?
    /// False if: no credits, no provider, or no agents.
    pub can_toggle: bool,

    /// Does the space have AI credits available?
    pub has_credits: bool,

    /// Is an AI provider configured?
    pub provider_configured: bool,

    /// Are any agents configured in the system?
    pub has_agents: bool,

    /// Number of agents enabled for this space/room.
    pub enabled_agent_count: usize,

    /// Total number of agents configured.
    pub total_agent_count: usize,

    /// Display name of the configured provider (if any).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,

    /// The configured provider (for UI matching).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<AiProvider>,

    /// Human-readable message explaining the current state.
    /// Examples:
    /// - "Requires AI credits"
    /// - "Select AI provider"
    /// - "No agents configured"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Provider information for status constructors.
#[derive(Debug, Clone)]
pub struct ProviderInfo {
    pub configured: bool,
    pub name: Option<String>,
    pub provider: Option<AiProvider>,
}

impl ProviderInfo {
    /// Creates provider info from an optional AiProvider.
    pub fn from_provider(provider: Option<&AiProvider>) -> Self {
        Self {
            configured: provider.is_some(),
            name: provider.map(|p| p.display_name().to_string()),
            provider: provider.cloned(),
        }
    }
}

/// Agent information for status constructors.
#[derive(Debug, Clone)]
pub struct AgentInfo {
    /// Whether any agents are configured.
    pub has_agents: bool,
    /// Number of agents enabled for the current space/room.
    pub enabled_count: usize,
    /// Total number of agents configured.
    pub total_count: usize,
}

impl AgentInfo {
    /// Creates agent info with the given counts.
    pub fn new(total_count: usize, enabled_count: usize) -> Self {
        Self {
            has_agents: total_count > 0,
            enabled_count,
            total_count,
        }
    }

    /// Creates agent info indicating no agents are configured.
    #[cfg(test)]
    pub fn none() -> Self {
        Self {
            has_agents: false,
            enabled_count: 0,
            total_count: 0,
        }
    }
}

impl AutopilotStatus {
    /// Creates a status for when the toggle is available.
    pub fn available(
        enabled: bool,
        has_credits: bool,
        provider: ProviderInfo,
        agents: AgentInfo,
    ) -> Self {
        let can_toggle = has_credits && provider.configured && agents.has_agents;
        let message = if !agents.has_agents {
            Some("No agents configured".to_string())
        } else if !provider.configured {
            Some("Select AI provider".to_string())
        } else if !has_credits {
            Some("Requires AI credits".to_string())
        } else {
            None
        };

        Self {
            enabled,
            can_toggle,
            has_credits,
            provider_configured: provider.configured,
            has_agents: agents.has_agents,
            enabled_agent_count: agents.enabled_count,
            total_agent_count: agents.total_count,
            provider_name: provider.name,
            provider: provider.provider,
            message,
        }
    }

    /// Creates a status for when no credits are available.
    pub fn no_credits(provider: ProviderInfo, agents: AgentInfo) -> Self {
        Self {
            enabled: false,
            can_toggle: false,
            has_credits: false,
            provider_configured: provider.configured,
            has_agents: agents.has_agents,
            enabled_agent_count: agents.enabled_count,
            total_agent_count: agents.total_count,
            provider_name: provider.name,
            provider: provider.provider,
            message: Some("Requires AI credits".to_string()),
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_space_autopilot_enable_disable() {
        let mut config = SpaceAutopilot::default();

        assert!(!config.is_room_enabled("room-1"));
        assert!(!config.has_any_enabled());

        config.enable_room("room-1");
        assert!(config.is_room_enabled("room-1"));
        assert!(config.has_any_enabled());

        config.enable_room("room-2");
        assert!(config.is_room_enabled("room-2"));

        config.disable_room("room-1");
        assert!(!config.is_room_enabled("room-1"));
        assert!(config.is_room_enabled("room-2"));
    }

    #[test]
    fn test_clai_config_serialization() {
        let mut config = ClaiConfig::default();

        let mut space_config = SpaceConfig::default();
        space_config.autopilot.enable_room("room-abc-123");

        config
            .spaces
            .insert("space-xyz-456".to_string(), space_config);

        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains("space-xyz-456"));
        assert!(json.contains("room-abc-123"));

        let parsed: ClaiConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.spaces.contains_key("space-xyz-456"));
        assert!(parsed
            .spaces
            .get("space-xyz-456")
            .unwrap()
            .autopilot
            .is_room_enabled("room-abc-123"));
    }

    #[test]
    fn test_autopilot_status_constructors() {
        let provider = ProviderInfo {
            configured: true,
            name: Some("Claude Code".to_string()),
            provider: Some(AiProvider::Claude { model: None }),
        };
        let agents = AgentInfo::new(2, 1); // 2 total, 1 enabled

        let available = AutopilotStatus::available(true, true, provider.clone(), agents.clone());
        assert!(available.enabled);
        assert!(available.can_toggle);
        assert!(available.provider_configured);
        assert!(available.has_agents);
        assert_eq!(available.enabled_agent_count, 1);
        assert_eq!(available.total_agent_count, 2);
        assert!(available.message.is_none());

        let no_credits = AutopilotStatus::no_credits(provider.clone(), agents.clone());
        assert!(!no_credits.enabled);
        assert!(!no_credits.can_toggle);
        assert!(!no_credits.has_credits);
        assert!(no_credits.provider_configured);
        assert!(no_credits.has_agents);

        // Test with no agents configured
        let no_agents = AgentInfo::none();
        let no_agents_status = AutopilotStatus::available(false, true, provider, no_agents);
        assert!(!no_agents_status.can_toggle); // Can't toggle without agents
        assert!(!no_agents_status.has_agents);
        assert_eq!(
            no_agents_status.message,
            Some("No agents configured".to_string())
        );
    }

    #[test]
    fn test_provider_info_from_provider() {
        let info = ProviderInfo::from_provider(Some(&AiProvider::Claude { model: None }));
        assert!(info.configured);
        assert_eq!(info.name, Some("Claude Code".to_string()));

        let info = ProviderInfo::from_provider(None);
        assert!(!info.configured);
        assert!(info.name.is_none());
    }

    // =========================================================================
    // Agent Config Tests
    // =========================================================================

    #[test]
    fn test_default_agent_has_fixed_id() {
        let agent = AgentConfig::default_agent();
        assert_eq!(agent.id, DEFAULT_AGENT_ID);
        assert!(agent.is_default());
        assert_eq!(agent.name, "Infrastructure Health Monitor");
        assert_eq!(agent.interval_minutes, 5);
        assert!(agent.enabled_rooms.is_empty());
    }

    #[test]
    fn test_new_agent_has_unique_id() {
        let agent1 = AgentConfig::new("Agent 1".to_string(), "Description 1".to_string(), 10);
        let agent2 = AgentConfig::new("Agent 2".to_string(), "Description 2".to_string(), 15);

        assert_ne!(agent1.id, agent2.id);
        assert!(!agent1.is_default());
        assert!(!agent2.is_default());
        assert_eq!(agent1.name, "Agent 1");
        assert_eq!(agent2.interval_minutes, 15);
        assert!(agent1.selected_mcp_server_ids.is_empty());
    }

    #[test]
    fn test_agent_enable_disable_rooms() {
        let mut agent = AgentConfig::default_agent();

        // Initially no rooms enabled
        assert!(!agent.is_enabled_for("space-1", "room-1"));

        // Enable a room
        assert!(agent.enable_for("space-1", "room-1"));
        assert!(agent.is_enabled_for("space-1", "room-1"));

        // Enabling same room again returns false
        assert!(!agent.enable_for("space-1", "room-1"));

        // Enable another room - replaces the previous assignment
        agent.enable_for("space-1", "room-2");
        assert!(!agent.is_enabled_for("space-1", "room-1"));
        assert!(agent.is_enabled_for("space-1", "room-2"));

        // Disabling previous room returns false because it is no longer assigned
        assert!(!agent.disable_for("space-1", "room-1"));

        // Disable current room
        assert!(agent.disable_for("space-1", "room-2"));
        assert!(!agent.is_enabled_for("space-1", "room-2"));

        // Disabling non-existent room returns false
        assert!(!agent.disable_for("space-1", "room-1"));
    }

    #[test]
    fn test_agent_disable_for_space() {
        let mut agent = AgentConfig::default_agent();

        // Enable rooms in two spaces - only one assignment is kept
        agent.enable_for("space-1", "room-1");
        agent.enable_for("space-1", "room-2");
        agent.enable_for("space-2", "room-3");

        assert_eq!(agent.enabled_rooms.len(), 1);

        // Disable all rooms in space-1
        agent.disable_for_space("space-1");

        assert_eq!(agent.enabled_rooms.len(), 1);
        assert!(!agent.is_enabled_for("space-1", "room-1"));
        assert!(!agent.is_enabled_for("space-1", "room-2"));
        assert!(agent.is_enabled_for("space-2", "room-3"));
    }

    #[test]
    fn test_agent_required_tools() {
        let agent = AgentConfig::default_agent();
        let tools = agent.required_tools();

        assert!(tools.contains(&"netdata"));
        assert!(tools.contains(&"dashboard"));
        assert!(tools.contains(&"tabs"));
        assert_eq!(tools.len(), 3);
    }

    #[test]
    fn test_agent_serialization() {
        let mut agent = AgentConfig::default_agent();
        agent.enable_for("space-abc", "room-xyz");
        agent.selected_mcp_server_ids = vec!["mcp-a".to_string(), "mcp-b".to_string()];

        let json = serde_json::to_string_pretty(&agent).unwrap();

        // Should contain all fields
        assert!(json.contains(&agent.id));
        assert!(json.contains("Infrastructure Health Monitor"));
        assert!(json.contains("space-abc"));
        assert!(json.contains("room-xyz"));

        // Should deserialize back
        let parsed: AgentConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, agent.id);
        assert_eq!(parsed.name, agent.name);
        assert!(parsed.is_enabled_for("space-abc", "room-xyz"));
        assert_eq!(parsed.selected_mcp_server_ids, agent.selected_mcp_server_ids);
    }

    #[test]
    fn test_config_with_agents_serialization() {
        let mut config = ClaiConfig::default();
        config.agents.push(AgentConfig::default_agent());
        config.mcp_servers.push(McpServerConfig::new(
            "Filesystem MCP".to_string(),
            McpServerTransport::Stdio {
                command: "npx".to_string(),
                args: vec!["@modelcontextprotocol/server-filesystem".to_string()],
            },
        ));

        let mut custom_agent = AgentConfig::new(
            "Custom Monitor".to_string(),
            "Monitor custom things".to_string(),
            30,
        );
        custom_agent.enable_for("space-1", "room-1");
        custom_agent.selected_mcp_server_ids = vec![config.mcp_servers[0].id.clone()];
        config.agents.push(custom_agent);

        let json = serde_json::to_string_pretty(&config).unwrap();

        // Should contain both agents
        assert!(json.contains("Infrastructure Health Monitor"));
        assert!(json.contains("Custom Monitor"));

        // Should deserialize back
        let parsed: ClaiConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agents.len(), 2);
        assert_eq!(parsed.mcp_servers.len(), 1);
        assert!(parsed.agents[0].is_default());
        assert!(!parsed.agents[1].is_default());
        assert_eq!(
            parsed.agents[1].selected_mcp_server_ids,
            vec![parsed.mcp_servers[0].id.clone()]
        );
    }

    #[test]
    fn test_mcp_server_serialization() {
        let mut server = McpServerConfig::new(
            "Remote MCP".to_string(),
            McpServerTransport::Http {
                url: "https://example.com/mcp".to_string(),
            },
        );
        server.auth = McpServerAuth::BearerToken {
            secret_ref: "mcp-server::remote::bearer".to_string(),
        };

        let json = serde_json::to_string_pretty(&server).unwrap();
        assert!(json.contains("Remote MCP"));
        assert!(json.contains("https://example.com/mcp"));
        assert!(json.contains("bearer_token"));

        let parsed: McpServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, server.name);
        assert_eq!(parsed.transport, server.transport);
        assert_eq!(parsed.auth, server.auth);
        assert!(parsed.enabled);
    }

    #[test]
    fn test_space_room_pair_equality() {
        let pair1 = SpaceRoomPair {
            space_id: "space-1".to_string(),
            room_id: "room-1".to_string(),
        };
        let pair2 = SpaceRoomPair {
            space_id: "space-1".to_string(),
            room_id: "room-1".to_string(),
        };
        let pair3 = SpaceRoomPair {
            space_id: "space-1".to_string(),
            room_id: "room-2".to_string(),
        };

        assert_eq!(pair1, pair2);
        assert_ne!(pair1, pair3);
    }
}
