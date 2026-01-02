//! Prompt template generation for agents.
//!
//! This module provides the template system for generating AI prompts
//! from agent descriptions. The template is separate from the code
//! for easier maintenance and testing.

/// The base template for agent prompts.
///
/// Uses `{{variable}}` syntax for substitution.
/// Currently supports:
/// - `{{description}}` - The agent's description (user-provided, supports Markdown)
pub const AGENT_PROMPT_TEMPLATE: &str = r#"You are an autonomous agent for Netdata. Your role is to help users by analyzing infrastructure data and providing visual feedback through charts.

## Your Task
{{description}}

## Available Tools

### netdata.query
Query Netdata Cloud AI about your infrastructure using natural language. You can ask about metrics, alerts, anomalies, nodes, and system health.

**Tip**: Responses include details about tools executed by Netdata Cloud AI. Examine these to learn available metrics (contexts), labels, and node names for accurate visualizations.

### canvas.addChart
Add a chart to visualize metrics. Parameters:
- context: The metric context (e.g., "system.cpu", "disk.io", "net.eth0")
- groupBy: Optional grouping (e.g., ["node"])
- filterBy: Optional filters

### canvas.removeChart / canvas.clearCharts
Remove specific charts or clear all charts.

### canvas.setTimeRange
Set time range for charts: 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h, 7d

### tabs.splitTile / tabs.removeTile / tabs.getTileLayout
Manage tile layout for organizing visualizations."#;

/// Generates a prompt from the template by substituting the description.
///
/// # Arguments
/// * `description` - The agent's description (supports Markdown formatting)
///
/// # Returns
/// The complete system prompt with the description substituted.
pub fn generate_prompt(description: &str) -> String {
    AGENT_PROMPT_TEMPLATE.replace("{{description}}", description)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_prompt_includes_description() {
        let description = "Monitor CPU usage and alert on high load";
        let prompt = generate_prompt(description);

        // Should include the description
        assert!(prompt.contains("Monitor CPU usage and alert on high load"));

        // Should include tool documentation
        assert!(prompt.contains("netdata.query"));
        assert!(prompt.contains("canvas.addChart"));
        assert!(prompt.contains("tabs.splitTile"));
    }

    #[test]
    fn test_generate_prompt_with_markdown_description() {
        let description = r#"## Custom Monitoring Rules

### What to Monitor
- CPU usage above 80%
- Memory usage above 90%
- Disk I/O latency

### Exceptions
- Ignore node-1 during backup window (2-4am UTC)
- High CPU on batch-server is expected"#;

        let prompt = generate_prompt(description);

        // Should preserve markdown formatting
        assert!(prompt.contains("## Custom Monitoring Rules"));
        assert!(prompt.contains("### What to Monitor"));
        assert!(prompt.contains("- CPU usage above 80%"));
        assert!(prompt.contains("### Exceptions"));
    }

    #[test]
    fn test_generate_prompt_with_empty_description() {
        let prompt = generate_prompt("");

        // Should still have the template structure
        assert!(prompt.contains("## Your Task"));
        assert!(prompt.contains("## Available Tools"));
    }

    #[test]
    fn test_template_has_required_sections() {
        // Verify the template has all expected sections
        assert!(AGENT_PROMPT_TEMPLATE.contains("## Your Task"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("## Available Tools"));
    }

    #[test]
    fn test_template_documents_all_tools() {
        // Verify all tools are documented
        assert!(AGENT_PROMPT_TEMPLATE.contains("netdata.query"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("canvas.addChart"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("canvas.removeChart"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("canvas.setTimeRange"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("tabs.splitTile"));
        assert!(AGENT_PROMPT_TEMPLATE.contains("tabs.removeTile"));
    }
}
