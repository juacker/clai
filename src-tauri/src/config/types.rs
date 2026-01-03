//! Configuration types for CLAI.
//!
//! This module defines the configuration structures that are persisted
//! to disk and shared across the application.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    /// Claude Code CLI (claude)
    Claude,

    /// Gemini CLI (gemini)
    Gemini,

    /// OpenAI Codex CLI (codex)
    Codex,

    /// Custom CLI command
    Custom {
        /// The command to run (e.g., "my-ai-cli")
        command: String,

        /// Additional arguments to pass before the prompt
        #[serde(default)]
        args: Vec<String>,
    },
}

impl AiProvider {
    /// Returns the CLI command for this provider.
    pub fn command(&self) -> &str {
        match self {
            AiProvider::Claude => "claude",
            AiProvider::Gemini => "gemini",
            AiProvider::Codex => "codex",
            AiProvider::Custom { command, .. } => command,
        }
    }

    /// Returns a human-readable name for this provider.
    pub fn display_name(&self) -> &str {
        match self {
            AiProvider::Claude => "Claude Code",
            AiProvider::Gemini => "Gemini CLI",
            AiProvider::Codex => "OpenAI Codex",
            AiProvider::Custom { command, .. } => command,
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

    /// Space/room pairs where this agent is enabled.
    #[serde(default)]
    pub enabled_rooms: Vec<SpaceRoomPair>,

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
            enabled_rooms: vec![],
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
            enabled_rooms: vec![],
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
        vec!["netdata", "canvas", "tabs"]
    }

    /// Generates the system prompt from the description using the template.
    pub fn generate_prompt(&self) -> String {
        crate::agents::template::generate_prompt(&self.description)
    }

    /// Checks if this agent is enabled for a specific space/room.
    pub fn is_enabled_for(&self, space_id: &str, room_id: &str) -> bool {
        self.enabled_rooms
            .iter()
            .any(|r| r.space_id == space_id && r.room_id == room_id)
    }

    /// Enables this agent for a space/room.
    ///
    /// Returns true if the room was added (wasn't already enabled).
    pub fn enable_for(&mut self, space_id: &str, room_id: &str) -> bool {
        if !self.is_enabled_for(space_id, room_id) {
            self.enabled_rooms.push(SpaceRoomPair {
                space_id: space_id.to_string(),
                room_id: room_id.to_string(),
            });
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
        let initial_len = self.enabled_rooms.len();
        self.enabled_rooms
            .retain(|r| !(r.space_id == space_id && r.room_id == room_id));
        if self.enabled_rooms.len() != initial_len {
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

    /// User-defined autonomous agents.
    ///
    /// Agents are global and can be enabled for specific space/room combinations.
    /// If empty on first load, a default agent will be created.
    #[serde(default)]
    pub agents: Vec<AgentConfig>,

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
    /// True if this room or "All Nodes" room has auto-pilot enabled.
    pub enabled: bool,

    /// Can the user toggle auto-pilot in the current room?
    /// False if: no credits, no provider, no agents, or enabled via All Nodes (and not in All Nodes room).
    pub can_toggle: bool,

    /// Is this room's auto-pilot inherited from "All Nodes"?
    pub via_all_nodes: bool,

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
    /// - "Enabled via All Nodes"
    /// - "Requires AI credits"
    /// - "Select AI provider"
    /// - "No agents configured"
    /// - "Disable in All Nodes first"
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
            via_all_nodes: false,
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

    /// Creates a status for when enabled via All Nodes room.
    pub fn via_all_nodes(has_credits: bool, provider: ProviderInfo, agents: AgentInfo) -> Self {
        Self {
            enabled: true,
            can_toggle: false,
            via_all_nodes: true,
            has_credits,
            provider_configured: provider.configured,
            has_agents: agents.has_agents,
            enabled_agent_count: agents.enabled_count,
            total_agent_count: agents.total_count,
            provider_name: provider.name,
            provider: provider.provider,
            message: Some("Enabled via All Nodes".to_string()),
        }
    }

    /// Creates a status for when no credits are available.
    pub fn no_credits(provider: ProviderInfo, agents: AgentInfo) -> Self {
        Self {
            enabled: false,
            can_toggle: false,
            via_all_nodes: false,
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
            provider: Some(AiProvider::Claude),
        };
        let agents = AgentInfo::new(2, 1); // 2 total, 1 enabled

        let available = AutopilotStatus::available(true, true, provider.clone(), agents.clone());
        assert!(available.enabled);
        assert!(available.can_toggle);
        assert!(!available.via_all_nodes);
        assert!(available.provider_configured);
        assert!(available.has_agents);
        assert_eq!(available.enabled_agent_count, 1);
        assert_eq!(available.total_agent_count, 2);
        assert!(available.message.is_none());

        let via_all = AutopilotStatus::via_all_nodes(true, provider.clone(), agents.clone());
        assert!(via_all.enabled);
        assert!(!via_all.can_toggle);
        assert!(via_all.via_all_nodes);
        assert!(via_all.provider_configured);
        assert!(via_all.has_agents);
        assert!(via_all.message.is_some());

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
        let info = ProviderInfo::from_provider(Some(&AiProvider::Claude));
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

        // Enable another room
        agent.enable_for("space-1", "room-2");
        assert!(agent.is_enabled_for("space-1", "room-2"));

        // Disable first room
        assert!(agent.disable_for("space-1", "room-1"));
        assert!(!agent.is_enabled_for("space-1", "room-1"));
        assert!(agent.is_enabled_for("space-1", "room-2"));

        // Disabling non-existent room returns false
        assert!(!agent.disable_for("space-1", "room-1"));
    }

    #[test]
    fn test_agent_disable_for_space() {
        let mut agent = AgentConfig::default_agent();

        // Enable rooms in two spaces
        agent.enable_for("space-1", "room-1");
        agent.enable_for("space-1", "room-2");
        agent.enable_for("space-2", "room-3");

        assert_eq!(agent.enabled_rooms.len(), 3);

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
        assert!(tools.contains(&"canvas"));
        assert!(tools.contains(&"tabs"));
        assert_eq!(tools.len(), 3);
    }

    #[test]
    fn test_agent_serialization() {
        let mut agent = AgentConfig::default_agent();
        agent.enable_for("space-abc", "room-xyz");

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
    }

    #[test]
    fn test_config_with_agents_serialization() {
        let mut config = ClaiConfig::default();
        config.agents.push(AgentConfig::default_agent());

        let mut custom_agent = AgentConfig::new(
            "Custom Monitor".to_string(),
            "Monitor custom things".to_string(),
            30,
        );
        custom_agent.enable_for("space-1", "room-1");
        config.agents.push(custom_agent);

        let json = serde_json::to_string_pretty(&config).unwrap();

        // Should contain both agents
        assert!(json.contains("Infrastructure Health Monitor"));
        assert!(json.contains("Custom Monitor"));

        // Should deserialize back
        let parsed: ClaiConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.agents.len(), 2);
        assert!(parsed.agents[0].is_default());
        assert!(!parsed.agents[1].is_default());
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
