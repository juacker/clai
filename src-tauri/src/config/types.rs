//! Configuration types for CLAI.
//!
//! This module defines the configuration structures that are persisted
//! to disk and shared across the application.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// Main Config
// =============================================================================

/// Root configuration structure for CLAI.
///
/// This is persisted to a JSON file in the app's config directory.
/// All settings should be added here as the application grows.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaiConfig {
    /// Per-space configuration (key is space UUID).
    #[serde(default)]
    pub spaces: HashMap<String, SpaceConfig>,

    // Future global settings can be added here:
    // pub theme: Option<String>,
    // pub global_notifications: NotificationSettings,
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
    /// False if: no credits, or enabled via All Nodes (and not in All Nodes room).
    pub can_toggle: bool,

    /// Is this room's auto-pilot inherited from "All Nodes"?
    pub via_all_nodes: bool,

    /// Does the space have AI credits available?
    pub has_credits: bool,

    /// Human-readable message explaining the current state.
    /// Examples:
    /// - "Enabled via All Nodes"
    /// - "Requires AI credits"
    /// - "Disable in All Nodes first"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl AutopilotStatus {
    /// Creates a status for when the toggle is available.
    pub fn available(enabled: bool, has_credits: bool) -> Self {
        Self {
            enabled,
            can_toggle: has_credits,
            via_all_nodes: false,
            has_credits,
            message: if !has_credits {
                Some("Requires AI credits".to_string())
            } else {
                None
            },
        }
    }

    /// Creates a status for when enabled via All Nodes room.
    pub fn via_all_nodes(has_credits: bool) -> Self {
        Self {
            enabled: true,
            can_toggle: false,
            via_all_nodes: true,
            has_credits,
            message: Some("Enabled via All Nodes".to_string()),
        }
    }

    /// Creates a status for when no credits are available.
    pub fn no_credits() -> Self {
        Self {
            enabled: false,
            can_toggle: false,
            via_all_nodes: false,
            has_credits: false,
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

        config.spaces.insert("space-xyz-456".to_string(), space_config);

        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains("space-xyz-456"));
        assert!(json.contains("room-abc-123"));

        let parsed: ClaiConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.spaces.contains_key("space-xyz-456"));
        assert!(parsed.spaces.get("space-xyz-456").unwrap().autopilot.is_room_enabled("room-abc-123"));
    }

    #[test]
    fn test_autopilot_status_constructors() {
        let available = AutopilotStatus::available(true, true);
        assert!(available.enabled);
        assert!(available.can_toggle);
        assert!(!available.via_all_nodes);
        assert!(available.message.is_none());

        let via_all = AutopilotStatus::via_all_nodes(true);
        assert!(via_all.enabled);
        assert!(!via_all.can_toggle);
        assert!(via_all.via_all_nodes);
        assert!(via_all.message.is_some());

        let no_credits = AutopilotStatus::no_credits();
        assert!(!no_credits.enabled);
        assert!(!no_credits.can_toggle);
        assert!(!no_credits.has_credits);
    }
}
