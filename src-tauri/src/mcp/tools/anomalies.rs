//! Anomalies tools for AI agents.
//!
//! These tools open or reuse anomalies panels in the frontend via the JS bridge.

use serde::{Deserialize, Serialize};

/// Parameters for opening an anomalies panel.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OpenAnomaliesParams {
    /// Netdata space ID to inspect.
    #[schemars(description = "Netdata space ID")]
    pub space_id: String,

    /// Netdata room ID to inspect.
    #[schemars(description = "Netdata room ID")]
    pub room_id: String,

    /// Optional anomalies command ID to reuse.
    #[schemars(description = "Existing anomalies command ID to reuse (optional)")]
    #[serde(default)]
    pub command_id: Option<String>,

    /// Optional tile ID to split. Defaults to the root tile when omitted.
    #[schemars(description = "Tile ID to split before opening the anomalies panel (optional)")]
    #[serde(default)]
    pub parent_tile_id: Option<String>,

    /// Optional split orientation for the new panel.
    #[schemars(description = "Split type for a new panel: 'vertical' or 'horizontal' (optional, defaults to 'vertical')")]
    #[serde(default)]
    pub split_type: Option<String>,
}
