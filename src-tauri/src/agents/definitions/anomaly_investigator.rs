//! Anomaly Investigator Agent
//!
//! This agent monitors infrastructure health by checking for anomalies and
//! investigating any issues found. It runs periodically and uses Netdata Cloud's
//! AI to analyze metrics, alerts, and anomalies.
//!
//! # Capabilities
//!
//! - Detects anomalies via `netdata.query`
//! - Investigates root causes with follow-up queries
//! - Visualizes relevant metrics using `canvas.*` tools
//! - Organizes findings in tabs using `tabs.*` tools
//! - Searches the web for documentation and solutions
//!
//! # Adding a New Agent
//!
//! To add a new agent, create a new file in this directory with:
//! 1. A `definition()` function that returns `AgentDefinition`
//! 2. Add the module to `definitions/mod.rs`
//! 3. Include it in `all_definitions()`

use crate::agents::AgentDefinition;

// =============================================================================
// Configuration
// =============================================================================

/// Agent ID - used for instance identification and MCP server naming.
pub const ID: &str = "anomaly-investigator";

/// Human-readable name shown in UI.
pub const NAME: &str = "Anomaly Investigator";

/// Description shown in UI.
pub const DESCRIPTION: &str = "Monitors alerts and investigates anomalies in metrics";

/// How often this agent runs (5 minutes).
pub const INTERVAL_MS: u64 = 5 * 60 * 1000;

/// Tool namespaces this agent needs access to.
pub const REQUIRED_TOOLS: &[&str] = &["netdata", "canvas", "tabs"];

// =============================================================================
// System Prompt
// =============================================================================

/// System prompt that defines the agent's behavior.
///
/// This prompt is sent to the AI CLI (Claude/Gemini/Codex) when the agent runs.
/// It should be clear about:
/// - What the agent's goal is
/// - What tools are available
/// - How to approach the task
/// - What output is expected
pub const PROMPT: &str = r#"You are an AI assistant monitoring infrastructure health for Netdata.

Your task is to check for anomalies and investigate any issues found.

## Available Tools

### Netdata Query
- `netdata.query` - Ask questions about metrics, alerts, anomalies, and infrastructure health
  - Example: "What anomalies occurred in the last hour?"
  - Example: "Why is CPU high on server web-01?"
  - Example: "Show me the top 5 nodes by memory usage"

### Canvas (Visualization)
- `canvas.addChart` - Add a metric chart to visualize data
- `canvas.removeChart` - Remove a chart by ID
- `canvas.getCharts` - List all current charts
- `canvas.clearCharts` - Remove all charts
- `canvas.setTimeRange` - Change the time window for all charts

### Tabs (Layout)
- `tabs.splitTile` - Split the view to create new panels
- `tabs.removeTile` - Remove a panel
- `tabs.getTileLayout` - Get the current layout structure

### Web Search
- You can search the web for documentation about specific errors, metrics, or solutions

## Instructions

1. **Check for anomalies**: Start by using `netdata.query` to check for recent anomalies or alerts
   - Ask: "Are there any active alerts or recent anomalies?"

2. **If anomalies are found**:
   - Investigate the root cause using follow-up queries
   - Ask clarifying questions: "What caused the CPU spike?", "When did this start?"
   - Use `canvas.addChart` to display the relevant metrics
   - If you need to show multiple related charts, use `tabs.splitTile` first
   - Provide a brief summary of your findings

3. **If no anomalies are found**:
   - Report that the infrastructure is healthy
   - Optionally use `netdata.query` to show key health metrics
   - Example: "What is the overall system health summary?"

## Output Guidelines

- Be concise but thorough
- Focus on actionable insights
- When showing charts, explain what they show and why they're relevant
- If you find issues, prioritize them by severity
- Include timestamps when discussing events
"#;

// =============================================================================
// Definition Factory
// =============================================================================

/// Creates the agent definition.
///
/// This is the single source of truth for this agent's configuration.
/// Called by the registry to get all available agent definitions.
pub fn definition() -> AgentDefinition {
    AgentDefinition::new(ID, NAME, INTERVAL_MS)
        .with_description(DESCRIPTION)
        .with_prompt(PROMPT)
        .with_tools(REQUIRED_TOOLS.to_vec())
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_definition() {
        let def = definition();

        assert_eq!(def.id, ID);
        assert_eq!(def.name, NAME);
        assert_eq!(def.description, DESCRIPTION);
        assert_eq!(def.interval_ms, INTERVAL_MS);
        assert!(!def.prompt.is_empty());
        assert_eq!(def.required_tools.len(), REQUIRED_TOOLS.len());
    }

    #[test]
    fn test_prompt_contains_tools() {
        // Verify prompt mentions all the tools
        assert!(PROMPT.contains("netdata.query"));
        assert!(PROMPT.contains("canvas.addChart"));
        assert!(PROMPT.contains("tabs.splitTile"));
    }

    #[test]
    fn test_interval_is_5_minutes() {
        assert_eq!(INTERVAL_MS, 5 * 60 * 1000);
    }
}
