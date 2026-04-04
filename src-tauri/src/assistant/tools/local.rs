use glob::{MatchOptions, Pattern};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

use serde::Deserialize;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::assistant::types::RunNoticeKind;
use crate::config::{
    ExecutionCapabilityConfig, FilesystemPathAccess, FilesystemPathGrant, ShellAccessMode,
};

use super::ToolExecutionContext;

const APP_IDENTIFIER: &str = "clai";
const AGENT_WORKSPACES_DIR: &str = "agent-workspaces";
const DEFAULT_FILE_READ_LIMIT: usize = 20_000;
const MAX_FILE_READ_LIMIT: usize = 200_000;
const DEFAULT_FS_LIST_LIMIT: usize = 200;
const MAX_FS_LIST_LIMIT: usize = 2_000;
const DEFAULT_FS_GLOB_LIMIT: usize = 200;
const MAX_FS_GLOB_LIMIT: usize = 2_000;
const DEFAULT_BASH_TIMEOUT_MS: u64 = 30_000;
const MAX_BASH_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_BASH_OUTPUT_LIMIT: usize = 20_000;
const MAX_BASH_OUTPUT_LIMIT: usize = 200_000;

pub fn agent_workspace_root_for_id(agent_workspace_id: &str) -> Option<PathBuf> {
    let data_dir = dirs::data_dir()?;
    Some(
        data_dir
            .join(APP_IDENTIFIER)
            .join(AGENT_WORKSPACES_DIR)
            .join(agent_workspace_id),
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsListParams {
    #[serde(default = "default_current_path")]
    path: String,
    #[serde(default)]
    recursive: bool,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsGlobParams {
    pattern: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsReadParams {
    path: String,
    #[serde(default)]
    offset: Option<usize>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FsWriteParams {
    path: String,
    content: String,
    #[serde(default)]
    create_parents: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BashExecParams {
    command: String,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    max_output_chars: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AccessKind {
    ReadOnly,
    ReadWrite,
}

#[derive(Debug, Clone)]
struct ResolvedGrant {
    root: PathBuf,
    access: AccessKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FilesystemEntry {
    path: PathBuf,
    kind: &'static str,
}

pub async fn execute_local_tool(
    context: &ToolExecutionContext,
    tool_name: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match tool_name {
        "fs.list" => {
            let params: FsListParams = serde_json::from_value(params)
                .map_err(|e| format!("Invalid fs.list params: {}", e))?;
            execute_fs_list(context, params)
        }
        "fs.glob" => {
            let params: FsGlobParams = serde_json::from_value(params)
                .map_err(|e| format!("Invalid fs.glob params: {}", e))?;
            execute_fs_glob(context, params)
        }
        "fs.read" => {
            let params: FsReadParams = serde_json::from_value(params)
                .map_err(|e| format!("Invalid fs.read params: {}", e))?;
            execute_fs_read(context, params)
        }
        "fs.write" => {
            let params: FsWriteParams = serde_json::from_value(params)
                .map_err(|e| format!("Invalid fs.write params: {}", e))?;
            execute_fs_write(context, params)
        }
        "bash.exec" => {
            let params: BashExecParams = serde_json::from_value(params)
                .map_err(|e| format!("Invalid bash.exec params: {}", e))?;
            execute_bash_exec(context, params).await
        }
        _ => Err(format!("Unknown local tool: {}", tool_name)),
    }
}

fn default_current_path() -> String {
    ".".to_string()
}

fn execute_fs_list(
    context: &ToolExecutionContext,
    params: FsListParams,
) -> Result<serde_json::Value, String> {
    let grants = filesystem_grants(context)?;
    let path = resolve_allowed_existing_path(&params.path, &grants, false).inspect_err(|e| {
        if e.contains("outside the agent's allowed filesystem grants") || e.contains("not writable")
        {
            context.add_notice(RunNoticeKind::PathDenied, e.clone());
        }
    })?;
    let limit = params
        .limit
        .unwrap_or(DEFAULT_FS_LIST_LIMIT)
        .min(MAX_FS_LIST_LIMIT);
    let (entries, truncated) = list_entries_at_path(&path, params.recursive, limit)?;

    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "entries": serialize_entries(&entries),
        "recursive": params.recursive,
        "truncated": truncated,
        "limit": limit
    }))
}

fn execute_fs_glob(
    context: &ToolExecutionContext,
    params: FsGlobParams,
) -> Result<serde_json::Value, String> {
    let grants = filesystem_grants(context)?;
    let limit = params
        .limit
        .unwrap_or(DEFAULT_FS_GLOB_LIMIT)
        .min(MAX_FS_GLOB_LIMIT);
    let (entries, truncated) =
        glob_allowed_paths(&params.pattern, &grants, limit).inspect_err(|e| {
            if e.contains("outside the agent's allowed filesystem grants") {
                context.add_notice(RunNoticeKind::PathDenied, e.clone());
            }
        })?;

    Ok(serde_json::json!({
        "pattern": params.pattern,
        "matches": serialize_entries(&entries),
        "truncated": truncated,
        "limit": limit
    }))
}

fn execute_fs_read(
    context: &ToolExecutionContext,
    params: FsReadParams,
) -> Result<serde_json::Value, String> {
    let grants = filesystem_grants(context)?;
    let path = resolve_allowed_existing_path(&params.path, &grants, false).inspect_err(|e| {
        if e.contains("outside the agent's allowed filesystem grants") || e.contains("not writable")
        {
            context.add_notice(RunNoticeKind::PathDenied, e.clone());
        }
    })?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let offset = params.offset.unwrap_or(0);
    let limit = params
        .limit
        .unwrap_or(DEFAULT_FILE_READ_LIMIT)
        .min(MAX_FILE_READ_LIMIT);
    let chars: Vec<char> = content.chars().collect();
    let start = offset.min(chars.len());
    let end = (start + limit).min(chars.len());
    let slice: String = chars[start..end].iter().collect();

    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "content": slice,
        "truncated": end < chars.len(),
        "offset": start,
        "limit": limit
    }))
}

fn execute_fs_write(
    context: &ToolExecutionContext,
    params: FsWriteParams,
) -> Result<serde_json::Value, String> {
    let grants = filesystem_grants(context)?;
    let path = resolve_allowed_path(&params.path, &grants, true).inspect_err(|e| {
        if e.contains("outside the agent's allowed filesystem grants") || e.contains("not writable")
        {
            context.add_notice(RunNoticeKind::PathDenied, e.clone());
        }
    })?;

    if params.create_parents {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create parent directories for {}: {}",
                    path.display(),
                    e
                )
            })?;
        }
    }

    fs::write(&path, params.content.as_bytes())
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "bytesWritten": params.content.len()
    }))
}

async fn execute_bash_exec(
    context: &ToolExecutionContext,
    params: BashExecParams,
) -> Result<serde_json::Value, String> {
    if matches!(context.execution.shell.mode, ShellAccessMode::Off) {
        return Err("Shell access is disabled for this agent".to_string());
    }

    let cwd = resolve_shell_cwd(context, params.cwd.as_deref())?;
    if let Err(denial) = enforce_command_policy(&context.execution, &params.command) {
        if matches!(denial, CommandDenial::NotInAllowList(_)) {
            context.add_notice(RunNoticeKind::CommandDenied, denial.message().to_string());
        }
        return Err(denial.message().to_string());
    }

    let timeout_ms = params
        .timeout_ms
        .unwrap_or(DEFAULT_BASH_TIMEOUT_MS)
        .min(MAX_BASH_TIMEOUT_MS);
    let output_limit = params
        .max_output_chars
        .unwrap_or(DEFAULT_BASH_OUTPUT_LIMIT)
        .min(MAX_BASH_OUTPUT_LIMIT);

    let mut child = Command::new("/bin/sh")
        .arg("-lc")
        .arg(&params.command)
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start shell command: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture command stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture command stderr".to_string())?;

    let stdout_task = tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stdout);
        let mut buf = Vec::new();
        reader.read_to_end(&mut buf).await.map(|_| buf)
    });
    let stderr_task = tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(stderr);
        let mut buf = Vec::new();
        reader.read_to_end(&mut buf).await.map(|_| buf)
    });

    let status = match timeout(Duration::from_millis(timeout_ms), child.wait()).await {
        Ok(result) => result.map_err(|e| format!("Shell command failed: {}", e))?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(format!("Shell command timed out after {} ms", timeout_ms));
        }
    };

    let stdout_bytes = stdout_task
        .await
        .map_err(|e| format!("Failed to collect stdout: {}", e))?
        .map_err(|e| format!("Failed to read stdout: {}", e))?;
    let stderr_bytes = stderr_task
        .await
        .map_err(|e| format!("Failed to collect stderr: {}", e))?
        .map_err(|e| format!("Failed to read stderr: {}", e))?;

    let stdout = truncate_string(
        String::from_utf8_lossy(&stdout_bytes).into_owned(),
        output_limit,
    );
    let stderr = truncate_string(
        String::from_utf8_lossy(&stderr_bytes).into_owned(),
        output_limit,
    );

    Ok(serde_json::json!({
        "cwd": cwd.display().to_string(),
        "exitCode": status.code(),
        "success": status.success(),
        "stdout": stdout,
        "stderr": stderr
    }))
}

fn filesystem_grants(context: &ToolExecutionContext) -> Result<Vec<ResolvedGrant>, String> {
    let mut grants = vec![ResolvedGrant {
        root: ensure_agent_workspace_root(context)?,
        access: AccessKind::ReadWrite,
    }];

    for grant in &context.execution.filesystem.extra_paths {
        let resolved = resolve_grant(grant)?;
        if !grants
            .iter()
            .any(|existing| existing.root == resolved.root && existing.access == resolved.access)
        {
            grants.push(resolved);
        }
    }

    Ok(grants)
}

fn list_entries_at_path(
    path: &Path,
    recursive: bool,
    limit: usize,
) -> Result<(Vec<FilesystemEntry>, bool), String> {
    let mut entries = Vec::new();

    if path.is_dir() {
        let truncated = collect_dir_entries(path, recursive, limit, &mut entries)?;
        Ok((entries, truncated))
    } else {
        Ok((vec![describe_path(path)?], false))
    }
}

fn collect_dir_entries(
    dir: &Path,
    recursive: bool,
    limit: usize,
    entries: &mut Vec<FilesystemEntry>,
) -> Result<bool, String> {
    let mut dir_entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to list {}: {}", dir.display(), e))?;
    dir_entries.sort_by_key(|entry| entry.path());

    for entry in dir_entries {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to inspect {}: {}", path.display(), e))?;
        entries.push(FilesystemEntry {
            path: path.clone(),
            kind: classify_file_type(&file_type),
        });

        if entries.len() >= limit {
            return Ok(true);
        }

        if recursive && file_type.is_dir() && collect_dir_entries(&path, true, limit, entries)? {
            return Ok(true);
        }
    }

    Ok(false)
}

fn glob_allowed_paths(
    pattern: &str,
    grants: &[ResolvedGrant],
    limit: usize,
) -> Result<(Vec<FilesystemEntry>, bool), String> {
    let normalized_pattern = normalize_pattern_string(pattern);
    if normalized_pattern.is_empty() {
        return Err("Glob pattern cannot be empty".to_string());
    }

    let matcher =
        Pattern::new(&normalized_pattern).map_err(|e| format!("Invalid glob pattern: {}", e))?;
    let absolute_pattern = Path::new(&normalized_pattern).is_absolute();

    if absolute_pattern {
        if let Some(prefix) = literal_path_prefix(&normalized_pattern) {
            let intersects_grants = grants
                .iter()
                .any(|grant| path_prefix_intersects(&prefix, &grant.root));
            if !intersects_grants {
                return Err(format!(
                    "Pattern {} is outside the agent's allowed filesystem grants",
                    normalized_pattern
                ));
            }
        }
    }

    let options = MatchOptions {
        case_sensitive: !cfg!(windows),
        require_literal_separator: true,
        require_literal_leading_dot: false,
    };

    let mut ctx = GlobWalkContext {
        matcher,
        options,
        absolute_pattern,
        limit,
        seen: std::collections::HashSet::new(),
        matches: Vec::new(),
    };

    for grant in grants {
        if collect_glob_matches(&grant.root, &grant.root, &mut ctx)? {
            return Ok((ctx.matches, true));
        }
    }

    Ok((ctx.matches, false))
}

struct GlobWalkContext {
    matcher: Pattern,
    options: MatchOptions,
    absolute_pattern: bool,
    limit: usize,
    seen: std::collections::HashSet<PathBuf>,
    matches: Vec<FilesystemEntry>,
}

fn collect_glob_matches(
    root: &Path,
    current: &Path,
    ctx: &mut GlobWalkContext,
) -> Result<bool, String> {
    let mut dir_entries = fs::read_dir(current)
        .map_err(|e| format!("Failed to list {}: {}", current.display(), e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to list {}: {}", current.display(), e))?;
    dir_entries.sort_by_key(|entry| entry.path());

    for entry in dir_entries {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to inspect {}: {}", path.display(), e))?;
        let candidate = if ctx.absolute_pattern {
            path_to_match_string(&path)
        } else {
            let relative_path = path.strip_prefix(root).map_err(|e| {
                format!(
                    "Failed to resolve relative path for {}: {}",
                    path.display(),
                    e
                )
            })?;
            path_to_match_string(relative_path)
        };

        if ctx.matcher.matches_with(&candidate, ctx.options) && ctx.seen.insert(path.clone()) {
            ctx.matches.push(FilesystemEntry {
                path: path.clone(),
                kind: classify_file_type(&file_type),
            });
            if ctx.matches.len() >= ctx.limit {
                return Ok(true);
            }
        }

        if file_type.is_dir() && collect_glob_matches(root, &path, ctx)? {
            return Ok(true);
        }
    }

    Ok(false)
}

fn resolve_grant(grant: &FilesystemPathGrant) -> Result<ResolvedGrant, String> {
    Ok(ResolvedGrant {
        root: resolve_configured_path(&grant.path)?,
        access: match grant.access {
            FilesystemPathAccess::ReadOnly => AccessKind::ReadOnly,
            FilesystemPathAccess::ReadWrite => AccessKind::ReadWrite,
        },
    })
}

fn ensure_agent_workspace_root(context: &ToolExecutionContext) -> Result<PathBuf, String> {
    let automation_id = context.agent_workspace_id.as_deref();
    let automation_id = automation_id.ok_or_else(|| {
        "Agent workspace is unavailable because this session is not tied to an automation"
            .to_string()
    })?;

    let workspace_root = agent_workspace_root_for_id(automation_id)
        .ok_or_else(|| "Failed to resolve platform data directory".to_string())?;

    // Create workspace root and pre-seed .clai/memory/ (including journal/)
    // so agents can use it immediately without spending a tool call.
    let memory_dir = workspace_root.join(".clai").join("memory");
    let journal_dir = memory_dir.join("journal");
    fs::create_dir_all(&journal_dir).map_err(|e| {
        format!(
            "Failed to create agent workspace {}: {}",
            workspace_root.display(),
            e
        )
    })?;

    Ok(workspace_root)
}

fn resolve_shell_cwd(
    context: &ToolExecutionContext,
    requested_cwd: Option<&str>,
) -> Result<PathBuf, String> {
    let agent_workspace = ensure_agent_workspace_root(context)?;
    let base = requested_cwd.unwrap_or(".");

    let cwd = if base == "." {
        agent_workspace.clone()
    } else {
        let grants = filesystem_grants(context)?;
        resolve_allowed_path(base, &grants, true)
            .or_else(|_| resolve_allowed_path(base, &grants, false))?
    };

    Ok(cwd)
}

fn resolve_allowed_existing_path(
    path: &str,
    grants: &[ResolvedGrant],
    require_write: bool,
) -> Result<PathBuf, String> {
    let candidate = resolve_allowed_path(path, grants, require_write)?;
    if !candidate.exists() {
        return Err(format!("Path does not exist: {}", candidate.display()));
    }
    Ok(candidate)
}

fn resolve_allowed_path(
    path: &str,
    grants: &[ResolvedGrant],
    require_write: bool,
) -> Result<PathBuf, String> {
    let candidate = resolve_candidate_path(path, grants)?;

    for grant in grants {
        if candidate.starts_with(&grant.root) {
            if require_write && grant.access != AccessKind::ReadWrite {
                return Err(format!(
                    "Path {} is not writable for this agent",
                    candidate.display()
                ));
            }
            return Ok(candidate);
        }
    }

    Err(format!(
        "Path {} is outside the agent's allowed filesystem grants",
        candidate.display()
    ))
}

fn resolve_candidate_path(path: &str, grants: &[ResolvedGrant]) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    if raw.is_absolute() {
        return Ok(normalize_path(raw.to_path_buf()));
    }

    if let Some(base) = grants.first() {
        return Ok(normalize_path(base.root.join(raw)));
    }

    Err("No filesystem grants are configured for this agent".to_string())
}

fn resolve_configured_path(path: &str) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    if raw.is_absolute() {
        Ok(normalize_path(raw.to_path_buf()))
    } else {
        let cwd = std::env::current_dir()
            .map_err(|e| format!("Failed to resolve current directory: {}", e))?;
        Ok(normalize_path(cwd.join(raw)))
    }
}

fn normalize_path(path: PathBuf) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
        }
    }
    normalized
}

fn classify_file_type(file_type: &fs::FileType) -> &'static str {
    if file_type.is_dir() {
        "directory"
    } else if file_type.is_file() {
        "file"
    } else if file_type.is_symlink() {
        "symlink"
    } else {
        "other"
    }
}

fn describe_path(path: &Path) -> Result<FilesystemEntry, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|e| format!("Failed to inspect {}: {}", path.display(), e))?;
    Ok(FilesystemEntry {
        path: path.to_path_buf(),
        kind: classify_file_type(&metadata.file_type()),
    })
}

fn serialize_entries(entries: &[FilesystemEntry]) -> Vec<serde_json::Value> {
    entries
        .iter()
        .map(|entry| {
            serde_json::json!({
                "path": entry.path.display().to_string(),
                "kind": entry.kind
            })
        })
        .collect()
}

fn normalize_pattern_string(pattern: &str) -> String {
    pattern.trim().replace('\\', "/")
}

fn literal_path_prefix(pattern: &str) -> Option<PathBuf> {
    let normalized = normalize_pattern_string(pattern);
    let is_absolute = normalized.starts_with('/');
    let mut prefix = if is_absolute {
        PathBuf::from(std::path::MAIN_SEPARATOR_STR)
    } else {
        PathBuf::new()
    };
    let mut saw_literal_segment = false;

    for segment in normalized.split('/') {
        if segment.is_empty() {
            continue;
        }
        if segment_contains_glob(segment) {
            break;
        }
        prefix.push(segment);
        saw_literal_segment = true;
    }

    if is_absolute || saw_literal_segment {
        Some(prefix)
    } else {
        None
    }
}

fn segment_contains_glob(segment: &str) -> bool {
    segment.contains('*') || segment.contains('?') || segment.contains('[') || segment.contains('{')
}

fn path_prefix_intersects(a: &Path, b: &Path) -> bool {
    a.starts_with(b) || b.starts_with(a)
}

fn path_to_match_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Why a command was denied.
enum CommandDenial {
    /// The command prefix is in the explicit block list — expected, no notice needed.
    ExplicitlyBlocked(String),
    /// The command prefix is not in the (non-empty) allow list — the user may not
    /// have anticipated this, so a run notice is warranted.
    NotInAllowList(String),
}

impl CommandDenial {
    fn message(&self) -> &str {
        match self {
            CommandDenial::ExplicitlyBlocked(msg) | CommandDenial::NotInAllowList(msg) => msg,
        }
    }
}

fn enforce_command_policy(
    execution: &ExecutionCapabilityConfig,
    command: &str,
) -> Result<(), CommandDenial> {
    let normalized = normalize_command(command).ok_or_else(|| {
        CommandDenial::ExplicitlyBlocked("Shell command cannot be empty".to_string())
    })?;

    if let Some(matched) =
        find_matching_prefix(&execution.shell.blocked_command_prefixes, &normalized)
    {
        return Err(CommandDenial::ExplicitlyBlocked(format!(
            "Command `{}` is blocked for this agent (matched prefix `{}`)",
            normalized, matched
        )));
    }

    if matches!(execution.shell.mode, ShellAccessMode::Restricted)
        && find_matching_prefix(&execution.shell.allowed_command_prefixes, &normalized).is_none()
    {
        let short = command_preview(&normalized);
        return Err(CommandDenial::NotInAllowList(format!(
            "Command `{}` is not in the allowed list. Add `{}` to allow it.",
            short, short
        )));
    }

    Ok(())
}

/// Normalize a command string by collapsing whitespace.
fn normalize_command(command: &str) -> Option<String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

/// Extract the first two words of a command for display (e.g. "kubectl get").
fn command_preview(command: &str) -> String {
    let mut words = command.split_whitespace();
    match (words.next(), words.next()) {
        (Some(cmd), Some(sub)) if !sub.starts_with('-') => format!("{} {}", cmd, sub),
        (Some(cmd), _) => cmd.to_string(),
        _ => command.to_string(),
    }
}

/// Check if a command starts with any of the configured prefixes.
/// Matching is prefix-based at word boundaries:
///   - prefix "kubectl get" matches command "kubectl get pods"
///   - prefix "kubectl" matches command "kubectl delete pods"
///   - prefix "kubectl get" does NOT match command "kubectl delete pods"
fn find_matching_prefix<'a>(prefixes: &'a [String], command: &str) -> Option<&'a str> {
    prefixes
        .iter()
        .find(|prefix| {
            let p = prefix.trim();
            command == p
                || (command.starts_with(p) && command.as_bytes().get(p.len()) == Some(&b' '))
        })
        .map(|s| s.as_str())
}

fn truncate_string(text: String, limit: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= limit {
        return text;
    }
    chars[..limit].iter().collect::<String>() + "\n…[truncated]"
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn grant_for(path: &Path) -> ResolvedGrant {
        ResolvedGrant {
            root: path.to_path_buf(),
            access: AccessKind::ReadWrite,
        }
    }

    #[test]
    fn fs_list_returns_sorted_entries_and_recursive_children() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("b.txt"), "b").unwrap();
        fs::write(root.join("a.txt"), "a").unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        fs::write(root.join("notes").join("todo.md"), "todo").unwrap();

        let (top_level, truncated) = list_entries_at_path(root, false, 10).unwrap();
        let top_level_paths: Vec<String> = top_level
            .iter()
            .map(|entry| {
                entry
                    .path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        assert_eq!(top_level_paths, vec!["a.txt", "b.txt", "notes"]);
        assert!(!truncated);

        let (recursive, recursive_truncated) = list_entries_at_path(root, true, 10).unwrap();
        let recursive_paths: Vec<String> = recursive
            .iter()
            .map(|entry| {
                entry
                    .path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        assert_eq!(
            recursive_paths,
            vec!["a.txt", "b.txt", "notes", "notes/todo.md"]
        );
        assert!(!recursive_truncated);
    }

    #[test]
    fn fs_glob_matches_relative_patterns_within_allowed_grants() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join(".clai").join("memory").join("checkpoints")).unwrap();
        fs::write(root.join(".clai").join("memory").join("status.md"), "ok").unwrap();
        fs::write(root.join(".clai").join("memory").join("facts.json"), "{}").unwrap();
        fs::write(
            root.join(".clai")
                .join("memory")
                .join("checkpoints")
                .join("restart.md"),
            "resume",
        )
        .unwrap();

        let (matches, truncated) =
            glob_allowed_paths(".clai/memory/**/*.md", &[grant_for(root)], 10).unwrap();
        let matched_paths: Vec<String> = matches
            .iter()
            .map(|entry| {
                entry
                    .path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();

        assert_eq!(
            matched_paths,
            vec![
                ".clai/memory/checkpoints/restart.md",
                ".clai/memory/status.md"
            ]
        );
        assert!(!truncated);
    }

    #[test]
    fn fs_glob_rejects_absolute_patterns_outside_allowed_grants() {
        let temp = tempdir().unwrap();
        let root = temp.path();

        let error = glob_allowed_paths("/etc/**/*.conf", &[grant_for(root)], 10).unwrap_err();

        assert!(error.contains("outside the agent's allowed filesystem grants"));
    }
}
