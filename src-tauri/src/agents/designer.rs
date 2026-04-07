//! Workspace Designer — post-run agent that generates/evolves `.clai/workspace.json`.
//!
//! After a task agent completes a run, this module gathers workspace context
//! (files, memories, state, runs, and the existing workspace.json if any) and
//! makes a single LLM call to produce or evolve the workspace page definition.
//!
//! The designer uses the same provider connection configured for the task agent,
//! keeping costs and auth consistent.
//!
//! # Design Principles
//!
//! - **Incremental**: reads the existing workspace.json and evolves it rather
//!   than rebuilding from scratch every time.
//! - **Convergent**: the LLM is instructed to stop making changes once the
//!   layout is stable and only the data (progress, counts, etc.) has changed.
//! - **Non-blocking**: failures are logged but never affect the task run status.

use std::fs;
use std::path::Path;

use futures::StreamExt;
use uuid::Uuid;

use crate::assistant::providers::registry::resolve_adapter;
use crate::assistant::providers::types::ProviderError;
use crate::assistant::tools::local::agent_workspace_root_for_id;
use crate::assistant::types::{
    CompletionRequest, ContentPart, MessageRole, ProviderConnection, ProviderEvent,
    ProviderInputMessage,
};

// =============================================================================
// Public API
// =============================================================================

/// Run the workspace designer for an agent after a successful task run.
///
/// This is fire-and-forget from the runner's perspective.  Errors are logged
/// but never propagated upward.
pub async fn design_workspace(
    agent_id: &str,
    agent_name: &str,
    agent_description: &str,
    connection: &ProviderConnection,
    session_id: &str,
    run_message_count: usize,
    run_artifact_count: usize,
) {
    if let Err(error) = design_workspace_inner(
        agent_id,
        agent_name,
        agent_description,
        connection,
        session_id,
        run_message_count,
        run_artifact_count,
    )
    .await
    {
        tracing::warn!(
            agent_id = %agent_id,
            error = %error,
            "Workspace designer failed (non-fatal)"
        );
    }
}

// =============================================================================
// Implementation
// =============================================================================

async fn design_workspace_inner(
    agent_id: &str,
    agent_name: &str,
    agent_description: &str,
    connection: &ProviderConnection,
    session_id: &str,
    run_message_count: usize,
    run_artifact_count: usize,
) -> Result<(), DesignerError> {
    let workspace_root = agent_workspace_root_for_id(agent_id)
        .ok_or_else(|| DesignerError::NoWorkspaceRoot(agent_id.to_string()))?;

    if !workspace_root.exists() {
        return Err(DesignerError::NoWorkspaceRoot(agent_id.to_string()));
    }

    // Gather context
    let context = gather_context(
        &workspace_root,
        agent_name,
        agent_description,
        session_id,
        run_message_count,
        run_artifact_count,
    )?;

    // Build prompt
    let prompt = build_designer_prompt(&context);

    tracing::info!(
        agent_id = %agent_id,
        context_len = prompt.len(),
        has_existing = context.existing_workspace_json.is_some(),
        "Running workspace designer"
    );

    // Make a single LLM call
    let response = call_llm(connection, &prompt).await?;

    // Extract JSON from response
    let json = extract_json(&response)?;

    // Validate basic structure
    validate_workspace_json(&json)?;

    // Write to .clai/workspace.json
    let clai_dir = workspace_root.join(".clai");
    fs::create_dir_all(&clai_dir)
        .map_err(|e| DesignerError::Io(format!("create .clai dir: {}", e)))?;

    let output_path = clai_dir.join("workspace.json");
    fs::write(&output_path, &json)
        .map_err(|e| DesignerError::Io(format!("write workspace.json: {}", e)))?;

    tracing::info!(
        agent_id = %agent_id,
        path = %output_path.display(),
        size = json.len(),
        "Workspace designer wrote workspace.json"
    );

    Ok(())
}

// =============================================================================
// Context Gathering
// =============================================================================

struct DesignerContext {
    agent_name: String,
    agent_description: String,
    session_id: String,
    run_message_count: usize,
    run_artifact_count: usize,
    existing_workspace_json: Option<String>,
    memory_files: Vec<FileInfo>,
    artifact_files: Vec<FileInfo>,
    state_md_content: Option<String>,
}

struct FileInfo {
    relative_path: String,
    #[allow(dead_code)]
    name: String,
    size: u64,
    viewer: String,
}

fn gather_context(
    workspace_root: &Path,
    agent_name: &str,
    agent_description: &str,
    session_id: &str,
    run_message_count: usize,
    run_artifact_count: usize,
) -> Result<DesignerContext, DesignerError> {
    // Read existing workspace.json
    let existing_path = workspace_root.join(".clai").join("workspace.json");
    let existing_workspace_json = fs::read_to_string(&existing_path).ok();

    // Read state.md
    let state_path = workspace_root.join(".clai").join("memory").join("state.md");
    let state_md_content = fs::read_to_string(&state_path).ok();

    // Collect memory files
    let memory_dir = workspace_root.join(".clai").join("memory");
    let memory_files = collect_file_info(&memory_dir, workspace_root);

    // Collect artifact files (everything outside .clai/)
    let artifact_files = collect_artifact_info(workspace_root);

    Ok(DesignerContext {
        agent_name: agent_name.to_string(),
        agent_description: agent_description.to_string(),
        session_id: session_id.to_string(),
        run_message_count,
        run_artifact_count,
        existing_workspace_json,
        memory_files,
        artifact_files,
        state_md_content,
    })
}

fn collect_file_info(dir: &Path, root: &Path) -> Vec<FileInfo> {
    let mut files = Vec::new();
    collect_file_info_recursive(dir, root, &mut files);
    files
}

fn collect_file_info_recursive(dir: &Path, root: &Path, files: &mut Vec<FileInfo>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_file_info_recursive(&path, root, files);
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let viewer = viewer_for_name(&name);
            files.push(FileInfo {
                relative_path: relative,
                name,
                size,
                viewer,
            });
        }
    }
}

fn collect_artifact_info(root: &Path) -> Vec<FileInfo> {
    let mut files = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return files,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        // Skip .clai directory
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n == ".clai")
            .unwrap_or(false)
        {
            continue;
        }
        if path.is_dir() {
            collect_file_info_recursive(&path, root, &mut files);
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let viewer = viewer_for_name(&name);
            files.push(FileInfo {
                relative_path: relative,
                name,
                size,
                viewer,
            });
        }
    }
    files
}

fn viewer_for_name(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".md") || lower.ends_with(".markdown") {
        "markdown".to_string()
    } else if lower.ends_with(".json") {
        "json".to_string()
    } else if lower.ends_with(".canvas") {
        "canvas".to_string()
    } else {
        "text".to_string()
    }
}

// =============================================================================
// Prompt Construction
// =============================================================================

fn build_designer_prompt(ctx: &DesignerContext) -> String {
    let mut prompt = String::with_capacity(8192);

    // System context
    prompt.push_str("You are a workspace visualization designer for CLAI.\n");
    prompt.push_str("Your job is to generate or evolve a workspace.json file that composes the best visualization for an agent's workspace.\n\n");

    // Evolution rules
    prompt.push_str("## Rules\n\n");
    prompt.push_str("- If an existing workspace.json is provided below, EVOLVE it — do not rebuild from scratch.\n");
    prompt.push_str("- Update data in props (progress counts, topic statuses, new artifacts) but keep the layout structure stable if it already works well.\n");
    prompt.push_str("- If the layout is already good and only data has changed, update the data and leave the structure unchanged.\n");
    prompt.push_str("- If this is the first time (no existing workspace.json), design a layout that fits the agent's purpose.\n");
    prompt.push_str(
        "- Output ONLY valid JSON. No markdown fences, no explanation, just the JSON object.\n\n",
    );

    // Component catalog
    prompt.push_str("## Available Components\n\n");
    prompt.push_str("### Briefing\n");
    prompt.push_str("Hero section showing agent focus and progress.\n");
    prompt.push_str("Props: { focus?: string, progress?: { completed: number, total: number, label?: string }, lastRun?: { status: \"completed\"|\"failed\"|\"running\", summary?: string, timestamp?: string }, highlights?: string[], openQuestions?: string[] }\n\n");

    prompt.push_str("### TopicGrid\n");
    prompt.push_str("Domain topic cards with status indicators. Use for agents that organize work by topics/categories.\n");
    prompt.push_str("Props: { topics: [{ name: string, status: \"complete\"|\"in-progress\"|\"queued\", summary?: string, artifactCount?: number, path?: string }] }\n\n");

    prompt.push_str("### FileBrowser\n");
    prompt.push_str(
        "Interactive file list from workspace artifacts. Clicking opens file in viewer.\n",
    );
    prompt.push_str("Props: { root?: string, groupBy?: \"directory\"|\"type\"|\"flat\", filter?: string, showMemories?: boolean }\n\n");

    prompt.push_str("### Markdown\n");
    prompt.push_str("Renders markdown content inline or from a file.\n");
    prompt.push_str("Props: { content?: string } OR { file?: string }\n\n");

    // Layout options
    prompt.push_str("## Layout Options\n\n");
    prompt.push_str(
        "- \"single-column\": Full-width stacked sections (good for reading-focused agents)\n",
    );
    prompt.push_str(
        "- \"two-column\": Main + sidebar. Sections use column: \"main\" or column: \"sidebar\"\n",
    );
    prompt.push_str("- \"dashboard\": Auto-grid of cards (good for monitoring agents)\n\n");

    // Workspace.json schema
    prompt.push_str("## Output Schema\n\n");
    prompt.push_str("{ \"layout\": \"<layout>\", \"sections\": [{ \"component\": \"<Name>\", \"title\": \"<optional title>\", \"column\": \"main\"|\"sidebar\", \"props\": { ... } }] }\n\n");

    // Agent context
    prompt.push_str("## Agent\n\n");
    prompt.push_str(&format!("Name: {}\n", ctx.agent_name));
    prompt.push_str(&format!("Description: {}\n", ctx.agent_description));
    prompt.push_str(&format!("Session: {}\n", ctx.session_id));
    prompt.push_str(&format!("Messages this run: {}\n", ctx.run_message_count));
    prompt.push_str(&format!(
        "Artifacts this run: {}\n\n",
        ctx.run_artifact_count
    ));

    // State.md
    if let Some(state_md) = &ctx.state_md_content {
        prompt.push_str("## Agent State (state.md)\n\n");
        // Truncate if very long
        let truncated = if state_md.len() > 3000 {
            &state_md[..3000]
        } else {
            state_md.as_str()
        };
        prompt.push_str(truncated);
        prompt.push_str("\n\n");
    }

    // Memory files
    if !ctx.memory_files.is_empty() {
        prompt.push_str("## Memory Files\n\n");
        for file in &ctx.memory_files {
            prompt.push_str(&format!(
                "- {} ({}, {} bytes)\n",
                file.relative_path, file.viewer, file.size
            ));
        }
        prompt.push('\n');
    }

    // Artifact files
    if !ctx.artifact_files.is_empty() {
        prompt.push_str("## Artifact Files\n\n");
        for file in &ctx.artifact_files {
            prompt.push_str(&format!(
                "- {} ({}, {} bytes)\n",
                file.relative_path, file.viewer, file.size
            ));
        }
        prompt.push('\n');
    }

    // Existing workspace.json
    if let Some(existing) = &ctx.existing_workspace_json {
        prompt.push_str("## Existing workspace.json (evolve this)\n\n");
        // Truncate if absurdly long
        let truncated = if existing.len() > 4000 {
            &existing[..4000]
        } else {
            existing.as_str()
        };
        prompt.push_str(truncated);
        prompt.push_str("\n\n");
        prompt.push_str("Evolve the above: update data/props as needed based on current state, but preserve layout structure if it still fits.\n\n");
    } else {
        prompt.push_str("No existing workspace.json — create one from scratch based on the agent's purpose and outputs.\n\n");
    }

    prompt.push_str(
        "Respond with ONLY the workspace.json content. No markdown fences, no commentary.",
    );

    prompt
}

// =============================================================================
// LLM Call
// =============================================================================

async fn call_llm(connection: &ProviderConnection, prompt: &str) -> Result<String, DesignerError> {
    let adapter = resolve_adapter(&connection.provider_id).map_err(DesignerError::Provider)?;

    let request = CompletionRequest {
        run_id: format!("designer:{}", Uuid::new_v4()),
        session_id: format!("designer-session:{}", Uuid::new_v4()),
        model_id: connection.model_id.clone(),
        messages: vec![ProviderInputMessage {
            role: MessageRole::User,
            content: vec![ContentPart::Text {
                text: prompt.to_string(),
            }],
        }],
        tools: vec![],
        temperature: Some(0.2),
        max_output_tokens: Some(4096),
    };

    let mut stream = adapter
        .stream_completion(connection, request)
        .await
        .map_err(DesignerError::Provider)?;

    let mut full_text = String::new();

    while let Some(event) = stream.next().await {
        match event {
            Ok(ProviderEvent::TextDelta { text }) => {
                full_text.push_str(&text);
            }
            Ok(ProviderEvent::MessageComplete) => break,
            Ok(ProviderEvent::ProviderError { message }) => {
                return Err(DesignerError::LlmError(message));
            }
            Err(e) => {
                return Err(DesignerError::Provider(e));
            }
            _ => {}
        }
    }

    if full_text.trim().is_empty() {
        return Err(DesignerError::EmptyResponse);
    }

    Ok(full_text)
}

// =============================================================================
// JSON Extraction & Validation
// =============================================================================

/// Extract JSON from LLM response, handling markdown fences or extra text.
fn extract_json(response: &str) -> Result<String, DesignerError> {
    let trimmed = response.trim();

    // Try parsing directly
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Ok(serde_json::to_string_pretty(&value).unwrap_or_else(|_| trimmed.to_string()));
    }

    // Try extracting from markdown code fence
    if let Some(start) = trimmed.find("```json") {
        let after_fence = &trimmed[start + 7..];
        if let Some(end) = after_fence.find("```") {
            let json_str = after_fence[..end].trim();
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
                return Ok(
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| json_str.to_string())
                );
            }
        }
    }

    // Try extracting from plain code fence
    if let Some(start) = trimmed.find("```") {
        let after_fence = &trimmed[start + 3..];
        // Skip optional language tag on the same line
        let after_lang = if let Some(nl) = after_fence.find('\n') {
            &after_fence[nl + 1..]
        } else {
            after_fence
        };
        if let Some(end) = after_lang.find("```") {
            let json_str = after_lang[..end].trim();
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
                return Ok(
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| json_str.to_string())
                );
            }
        }
    }

    // Try finding first { to last }
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        let candidate = &trimmed[start..=end];
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(candidate) {
            return Ok(
                serde_json::to_string_pretty(&value).unwrap_or_else(|_| candidate.to_string())
            );
        }
    }

    Err(DesignerError::InvalidJson(
        trimmed.chars().take(200).collect(),
    ))
}

/// Validate the workspace.json has the minimum required structure.
fn validate_workspace_json(json: &str) -> Result<(), DesignerError> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| DesignerError::InvalidJson(e.to_string()))?;

    let obj = value
        .as_object()
        .ok_or_else(|| DesignerError::InvalidJson("root must be an object".to_string()))?;

    let sections = obj
        .get("sections")
        .and_then(|v| v.as_array())
        .ok_or_else(|| DesignerError::InvalidJson("must have a \"sections\" array".to_string()))?;

    if sections.is_empty() {
        return Err(DesignerError::InvalidJson(
            "sections array is empty".to_string(),
        ));
    }

    // Check each section has at least a component field
    for (i, section) in sections.iter().enumerate() {
        if section.get("component").and_then(|v| v.as_str()).is_none() {
            return Err(DesignerError::InvalidJson(format!(
                "section {} missing \"component\" field",
                i
            )));
        }
    }

    Ok(())
}

// =============================================================================
// Errors
// =============================================================================

#[derive(Debug)]
pub enum DesignerError {
    NoWorkspaceRoot(String),
    Io(String),
    Provider(ProviderError),
    LlmError(String),
    EmptyResponse,
    InvalidJson(String),
}

impl std::fmt::Display for DesignerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DesignerError::NoWorkspaceRoot(id) => {
                write!(f, "no workspace root for agent {}", id)
            }
            DesignerError::Io(msg) => write!(f, "io error: {}", msg),
            DesignerError::Provider(e) => write!(f, "provider error: {}", e),
            DesignerError::LlmError(msg) => write!(f, "LLM error: {}", msg),
            DesignerError::EmptyResponse => write!(f, "LLM returned empty response"),
            DesignerError::InvalidJson(msg) => write!(f, "invalid workspace json: {}", msg),
        }
    }
}

impl std::error::Error for DesignerError {}
