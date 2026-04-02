use crate::assistant::types::{SessionContext, ToolDefinition};
use crate::mcp::tools::{
    anomalies::OpenAnomaliesParams,
    canvas::{
        AddChartNodeParams, AddEdgeParams, AddMarkdownNodeParams, AddStatusBadgeParams,
        ClearCanvasParams, RemoveEdgeParams, RemoveNodeParams, UpdateNodeParams,
    },
    dashboard::{AddChartParams, ClearChartsParams, RemoveChartParams, SetTimeRangeParams},
    tabs::{GetCommandContentParams, RemoveTileParams, SplitTileParams},
};

/// Returns all tool definitions available for the given session context.
pub fn available_tools(
    _context: &SessionContext,
    external_tools: &[ToolDefinition],
    dashboard_enabled: bool,
) -> Vec<ToolDefinition> {
    let mut tools = vec![];

    if dashboard_enabled {
        tools.push(tool::<OpenAnomaliesParams>(
            "anomalies.open",
            "Open or reuse an anomalies panel for a specific Netdata space and room. Requires spaceId and roomId. Reuses an existing anomalies panel for the same target when available.",
        ));
        tools.push(tool::<AddChartParams>(
            "dashboard.addChart",
            "Add a metric chart to the dashboard. Requires space ID, room ID, and metric context. The Netdata MCP server is resolved automatically when exactly one compatible server is enabled for the session.",
        ));
        tools.push(tool::<RemoveChartParams>(
            "dashboard.removeChart",
            "Remove a chart from the dashboard by its ID.",
        ));
        tools.push(tool::<ClearChartsParams>(
            "dashboard.clearCharts",
            "Remove all charts from the dashboard.",
        ));
        tools.push(tool::<SetTimeRangeParams>(
            "dashboard.setTimeRange",
            "Set the time range for all dashboard charts (e.g., '5m', '1h', '24h', '7d').",
        ));
    }

    // tabs/tile tools
    tools.push(tool::<SplitTileParams>(
        "tabs.splitTile",
        "Split a tile to create a new panel. Use 'vertical' for side-by-side or 'horizontal' for stacked.",
    ));
    tools.push(tool::<RemoveTileParams>(
        "tabs.removeTile",
        "Remove a tile from the layout.",
    ));
    tools.push(ToolDefinition {
        name: "tabs.getTileLayout".to_string(),
        description: "Get the current tile layout structure with content summaries.".to_string(),
        input_schema: serde_json::json!({"type": "object", "properties": {}}),
    });
    tools.push(tool::<GetCommandContentParams>(
        "tabs.getCommandContent",
        "Get detailed content for a specific command by ID.",
    ));

    // canvas tools
    if dashboard_enabled {
        tools.push(tool::<AddChartNodeParams>(
            "canvas.addChart",
            "Add a metric chart node to the canvas. Requires space ID, room ID, and metric context. The Netdata MCP server is resolved automatically when exactly one compatible server is enabled for the session.",
        ));
    }
    tools.push(tool::<AddStatusBadgeParams>(
        "canvas.addStatusBadge",
        "Add a status badge node to the canvas (ok, warning, critical).",
    ));
    tools.push(tool::<AddMarkdownNodeParams>(
        "canvas.addMarkdown",
        "Add a markdown text node to the canvas.",
    ));
    tools.push(tool::<AddEdgeParams>(
        "canvas.addEdge",
        "Connect two nodes on the canvas with an edge.",
    ));
    tools.push(tool::<RemoveNodeParams>(
        "canvas.removeNode",
        "Remove a node from the canvas.",
    ));
    tools.push(tool::<RemoveEdgeParams>(
        "canvas.removeEdge",
        "Remove an edge from the canvas.",
    ));
    tools.push(tool::<UpdateNodeParams>(
        "canvas.updateNode",
        "Update a node's position or data on the canvas.",
    ));
    tools.push(tool::<ClearCanvasParams>(
        "canvas.clearCanvas",
        "Remove all nodes and edges from the canvas.",
    ));

    tools.extend(external_tools.iter().cloned());

    tools
}

/// Build a ToolDefinition from a schemars-annotated param type.
fn tool<T: schemars::JsonSchema>(name: &str, description: &str) -> ToolDefinition {
    let schema = schemars::schema_for!(T);
    let input_schema = serde_json::to_value(schema).unwrap_or(serde_json::json!({}));

    ToolDefinition {
        name: name.to_string(),
        description: description.to_string(),
        input_schema,
    }
}
