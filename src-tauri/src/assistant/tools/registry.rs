use crate::assistant::types::{SessionContext, ToolDefinition};
use crate::config::ShellAccessMode;
use crate::mcp::tools::workspace::{
    CreateCanvasArtifactParams, CreateDashboardArtifactParams, ListArtifactsParams,
    ReadArtifactParams, UpdateCanvasArtifactParams, UpdateDashboardArtifactParams,
};

/// Returns all tool definitions available for the given session context.
pub fn available_tools(
    context: &SessionContext,
    external_tools: &[ToolDefinition],
    _dashboard_enabled: bool,
) -> Vec<ToolDefinition> {
    let mut tools = vec![];

    if context.agent_workspace_id.is_some() {
        tools.push(tool::<ListArtifactsParams>(
            "workspace.listArtifacts",
            "List durable artifacts in the current workspace. Use this first to discover existing canvas, dashboard, markdown, and other files before creating duplicates.",
        ));
        tools.push(tool::<ReadArtifactParams>(
            "workspace.readArtifact",
            "Read a durable workspace artifact by path. Returns the artifact content and parsed JSON when applicable.",
        ));
    }

    if context.agent_workspace_id.is_some() {
        tools.push(tool::<CreateCanvasArtifactParams>(
            "workspace.createCanvas",
            "Create a durable .canvas artifact in the current workspace.",
        ));
        tools.push(tool::<UpdateCanvasArtifactParams>(
            "workspace.updateCanvas",
            "Update an existing durable .canvas artifact in the current workspace.",
        ));
        tools.push(tool::<CreateDashboardArtifactParams>(
            "workspace.createDashboard",
            "Create a durable .dashboard.json artifact in the current workspace.",
        ));
        tools.push(tool::<UpdateDashboardArtifactParams>(
            "workspace.updateDashboard",
            "Update an existing durable .dashboard.json artifact in the current workspace.",
        ));
    }

    if context.agent_workspace_id.is_some() {
        tools.push(ToolDefinition {
            name: "fs.list".to_string(),
            description: "List files and directories under the agent workspace or another allowed filesystem path. Supports optional recursive traversal with a hard result limit.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "recursive": { "type": "boolean" },
                    "limit": { "type": "integer", "minimum": 1 }
                }
            }),
        });
        tools.push(ToolDefinition {
            name: "fs.glob".to_string(),
            description: "Find files or directories matching a glob pattern within the agent workspace or another allowed filesystem path.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1 }
                },
                "required": ["pattern"]
            }),
        });
        tools.push(ToolDefinition {
            name: "fs.read".to_string(),
            description: "Read a text file from the agent workspace or from an additional allowed filesystem path.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "offset": { "type": "integer", "minimum": 0 },
                    "limit": { "type": "integer", "minimum": 1 }
                },
                "required": ["path"]
            }),
        });
        tools.push(ToolDefinition {
            name: "fs.write".to_string(),
            description: "Write a text file to the agent workspace or to an additional writable filesystem path. Creates parent directories when requested.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "createParents": { "type": "boolean" }
                },
                "required": ["path", "content"]
            }),
        });
    }

    if context.agent_workspace_id.is_some()
        && !matches!(context.execution.shell.mode, ShellAccessMode::Off)
    {
        tools.push(ToolDefinition {
            name: "bash.exec".to_string(),
            description: "Run a shell command inside this automation's allowed working directory. Use this for local command execution and data processing when MCP tools are not the right fit.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string" },
                    "cwd": { "type": "string" },
                    "timeoutMs": { "type": "integer", "minimum": 1 },
                    "maxOutputChars": { "type": "integer", "minimum": 1 }
                },
                "required": ["command"]
            }),
        });
    }

    // Web tools: always available in regular sessions, opt-in for agent sessions
    let web_enabled = match context.agent_workspace_id.as_ref() {
        Some(_) => context.execution.web.enabled,
        None => true,
    };
    if web_enabled {
        tools.push(ToolDefinition {
            name: "web.search".to_string(),
            description: "Search the web using DuckDuckGo and return a list of results with titles, URLs, and snippets.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The search query" },
                    "maxResults": { "type": "integer", "minimum": 1, "maximum": 20, "description": "Maximum number of results to return (default 10)" }
                },
                "required": ["query"]
            }),
        });
        tools.push(ToolDefinition {
            name: "web.fetch".to_string(),
            description: "Fetch a web page and return its content as markdown. Useful for reading documentation, articles, or any web content.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "The URL to fetch" },
                    "maxContentChars": { "type": "integer", "minimum": 1, "description": "Maximum characters of content to return (default 20000)" },
                    "timeoutMs": { "type": "integer", "minimum": 1, "description": "Request timeout in milliseconds (default 15000)" }
                },
                "required": ["url"]
            }),
        });
    }

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
