# MCP Tool Permissions Proposal

## Summary

CLAI should treat external MCP tool execution as a first-class permission
surface. Selecting an MCP server for an agent should mean "this agent may see
this server's tools", not "this agent may execute every tool without review".

The permission gate should live in CLAI's external MCP dispatch path, before
the call reaches the configured MCP server. That catches both regular hosted
provider runs and CLI-backed runs, because the current CLI integration exposes
external MCP tools through CLAI's local MCP server instead of passing the
external server configs directly to the CLI.

Recommended default:

- Built-in CLAI tools keep their existing policy: filesystem grants, shell
  command approvals, web toggle, workspace task rules.
- External MCP tools run under a new per-agent MCP policy.
- Unknown or mutating external MCP tools require approval by default.
- Read-only external MCP tools can be auto-allowed only when the user has
  trusted that server/tool classification. Server-provided annotations are
  useful hints, not authority.
- `Allow once`, `Allow always`, `Deny once`, and `Deny always` should mirror
  the existing shell approval flow.

## Current Routing

### Hosted provider path

For non-CLI providers, `assistant::engine::run_session_turn` does this:

1. Loads selected external MCP tools through
   `state.mcp_client_manager.list_tools_for_servers(&session.context.mcp_server_ids)`.
2. Merges those definitions into `tools::available_tools`.
3. Sends the merged tool list to the provider.
4. Executes provider tool calls through `tools::execute_tool`.
5. `assistant::tools::router` dispatches built-in tools locally. Unknown tool
   names go to `execute_external_mcp_tool`.
6. `execute_external_mcp_tool` calls
   `state.mcp_client_manager.execute_tool(&context.mcp_server_ids, ...)`.

So hosted provider MCP calls already pass through CLAI before reaching an MCP
server.

### CLI-backed provider path

For CLI providers, `assistant::local_agent::run_session_turn` starts the
process-wide local MCP server in `assistant::local_mcp`, binds the run to a
bearer token, and launches the CLI against that local server.

Claude Code:

- `write_mcp_config` writes a temporary `.json` containing only one MCP server,
  named `clai`, with the loopback URL and bearer token.
- The CLI is launched with `--mcp-config <temp>`, `--strict-mcp-config`,
  `--tools ""`, `--disallowedTools ...`, `--permission-mode
  bypassPermissions`, and `--disable-slash-commands`.

Codex CLI:

- `add_codex_common_args` passes only `mcp_servers.clai.*` overrides.
- It also uses `--ignore-user-config`, `--ignore-rules`, disables
  `shell_tool`, and bypasses Codex's own approval layer because CLAI owns the
  external tool policy.

`assistant::local_mcp::list_tools` lists CLAI built-ins plus selected external
MCP tools via `mcp_client_manager.list_tools_for_servers`. `call_tool` rebuilds
a `ToolExecutionContext` and calls `tools::execute_tool`, so external MCP tool
calls again pass through `assistant::tools::router`.

Conclusion: today, CLI-backed runs should not connect directly to configured
external MCP servers. The CLI sees only CLAI's local MCP server. Permission
checks can be centralized in CLAI as long as we preserve and test that
invariant.

## Gaps

1. `McpServerConfig` has transport, auth, enabled, and name. It has no
   per-tool capability or permission policy.
2. Agents select whole servers via `selected_mcp_servers`. There is no
   per-tool allow/block policy.
3. `ExternalMcpToolDefinition` stores server id, tool name, display name,
   description, and input schema, but drops MCP `ToolAnnotations`.
4. `ToolDefinition` does not carry risk metadata, so the provider-visible and
   approval-visible tool lists cannot distinguish read-only from mutating
   tools.
5. `McpClientManager::execute_tool` resolves and calls external tools without
   a policy check.
6. `mcp_client_manager` is currently locked across external MCP execution.
   An approval prompt must not hold that mutex while waiting for the user.

There is also a separate trust boundary for stdio MCP servers: discovering
tools from a stdio server starts the configured command. Tool-call permissions
do not sandbox or validate that process. Adding or enabling a stdio MCP server
must remain a user-trust action.

## Policy Model

Add an MCP section to each agent's `ExecutionCapabilityConfig`.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpAccessMode {
    Off,
    Restricted,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpCapabilityConfig {
    #[serde(default)]
    pub mode: McpAccessMode,
    #[serde(default)]
    pub allowed_tools: Vec<McpToolGrant>,
    #[serde(default)]
    pub blocked_tools: Vec<McpToolGrant>,
    #[serde(default)]
    pub trusted_read_only_tools: Vec<McpToolGrant>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpToolGrant {
    pub server: crate::config::workspace_config::McpRef,
    pub tool_name: String,
}
```

Default mode should be `Restricted`.

Modes:

- `Off`: no external MCP tools are listed or callable for the agent.
- `Restricted`: selected server tools are listed, but mutating or unknown tools
  require approval unless covered by an allow rule. Block rules deny
  immediately.
- `Full`: selected server tools run without approval except blocked tools.
  This is appropriate only for trusted internal MCP servers.

Rules are per agent. They should use `McpRef` names for portability, matching
`selected_mcp_servers`. At runtime they resolve to server ids through the
current `AppConfig`.

## Tool Risk Classification

Extend external tool discovery to retain MCP annotations:

```rust
pub struct ExternalMcpToolDefinition {
    pub server_id: String,
    pub tool_name: String,
    pub display_name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub annotations: Option<rmcp::model::ToolAnnotations>,
}
```

Classify tools into:

- `ReadOnly`: the tool is expected not to modify external state.
- `Additive`: the tool may create state but should not overwrite/delete.
- `Mutating`: the tool can update external state.
- `Destructive`: the tool can delete, overwrite, revoke, publish, send, or
  otherwise cause high-impact side effects.
- `Unknown`: insufficient data.

MCP annotations can seed this:

- `readOnlyHint == true` suggests `ReadOnly`.
- `readOnlyHint == false` and `destructiveHint == false` suggests `Additive`.
- `destructiveHint == true` suggests `Destructive`.
- missing annotations means `Unknown`.

But annotations are hints. The `rmcp` model itself warns that clients should
not make tool-use decisions from annotations received from untrusted servers.
Therefore, CLAI should not silently trust them for auto-allow unless the user
has trusted that server or that specific tool classification.

Recommended behavior in `Restricted` mode:

- Durable blocked tool: deny and hide from `tools/list`.
- Durable allowed tool: allow.
- Durable trusted read-only tool plus `ReadOnly` classification: allow.
- Untrusted `ReadOnly`, `Additive`, `Mutating`, `Destructive`, or `Unknown`:
  prompt before execution.

The approval UI can show the server's claimed annotations as evidence, but the
decision belongs to the user.

## Approval Flow

Create a new module parallel to `commands::permissions`:

- `commands::mcp_permissions`
- `PendingMcpToolApprovals`
- events:
  - `mcpPermissions://request`
  - `mcpPermissions://attention`
  - `mcpPermissions://resolved`

Request payload:

```rust
pub struct McpToolPermissionRequest {
    pub request_id: String,
    pub workspace_id: Option<String>,
    pub agent_id: Option<String>,
    pub server_id: String,
    pub server_name: String,
    pub tool_name: String,
    pub display_name: String,
    pub description: String,
    pub risk: McpToolRisk,
    pub annotations: Option<McpToolAnnotationSummary>,
    pub arguments_preview: serde_json::Value,
}

pub enum McpToolDecision {
    AllowOnce,
    AllowAlways { scope: PermissionScope },
    TrustReadOnlyAlways { scope: PermissionScope },
    DenyOnce,
    DenyAlways { scope: PermissionScope },
}
```

The backend should persist `AllowAlways`, `TrustReadOnlyAlways`, and
`DenyAlways` before sending the oneshot decision to the waiting tool call, just
like shell command permissions do today. `AllowOnce` and `DenyOnce` should
update only run-scoped caches.

`arguments_preview` should be redacted before emission and persistence. A
basic first pass should redact object fields whose names contain `token`,
`secret`, `password`, `apikey`, `api_key`, `authorization`, or `credential`.
This is not perfect, but it avoids putting obvious secrets into UI events.

## Runtime Enforcement

The gate should sit in `assistant::tools::router::execute_external_mcp_tool`,
not inside CLI-specific code.

Proposed sequence:

1. Resolve the external MCP target from the assistant-visible tool name:
   server id, server name, remote tool name, qualified name, description,
   schema, annotations.
2. Drop the `mcp_client_manager` lock.
3. Evaluate the agent MCP policy plus run-scoped allow/block caches.
4. If approval is required, register a pending MCP approval and wait for the
   decision with the same long hygiene timeout used by shell approvals.
5. Update run-scoped caches from the decision.
6. If allowed, reacquire `mcp_client_manager` and call the external tool.

This avoids holding the MCP client mutex while a human is deciding.

`ToolExecutionContext` should gain run-scoped MCP caches:

```rust
pub session_allowed_mcp_tools: Arc<Mutex<Vec<McpToolKey>>>,
pub session_blocked_mcp_tools: Arc<Mutex<Vec<McpToolKey>>>,
pub session_trusted_read_only_mcp_tools: Arc<Mutex<Vec<McpToolKey>>>,
```

`McpToolKey` should use runtime server id plus tool name. Durable storage uses
portable server refs; runtime caches use resolved ids.

## Tool Listing Behavior

`tools/list` should be policy-aware:

- If MCP mode is `Off`, do not list external MCP tools.
- If a tool is durably blocked, do not list it.
- If a tool would require approval, still list it. Hiding it would prevent the
  model from asking for a user-approved action.
- Tool descriptions can be augmented internally with a short note such as
  "May require user approval before execution." This is useful for CLI-backed
  agents because the model only sees the local MCP tool list.

Both hosted provider setup and `local_mcp::list_tools` must use the same
policy-aware listing function.

## CLI Access Control Invariants

The current architecture supports centralized permission control because the
CLI sees only CLAI's local MCP server. We should make this an explicit
invariant:

1. CLI launches must never receive user-configured external MCP server configs.
2. Claude Code temporary MCP config must contain only `mcpServers.clai`.
3. Codex CLI command-line config must contain only `mcp_servers.clai.*` and
   must keep `--ignore-user-config`.
4. CLI-native shell/filesystem tools must remain disabled or disallowed.
5. `local_mcp::call_tool` must continue to dispatch through
   `tools::execute_tool`, not directly to `mcp_client_manager`.

Add tests around `write_mcp_config` and `add_codex_common_args` to assert no
external MCP server data can be passed through those paths. Add a local MCP
dispatch test proving an external MCP tool call hits the shared permission gate.

If a future CLI provider cannot disable user config or cannot restrict MCP
servers to CLAI's local bridge, it should not be allowed to run with external
MCP tools enabled.

## Migration

For existing agents:

- Keep selected MCP servers unchanged.
- Add `execution.mcp.mode = "restricted"` by default.
- Start with empty allow/block/trusted-read-only lists.
- Existing selected tools therefore remain visible but mutating or unknown
  calls prompt on first use.

This is more conservative than preserving today's behavior, but it directly
addresses the unsafe default. Users can switch trusted internal agents to
`Full` or approve tools persistently as they encounter them.

For app-level MCP server settings:

- No transport/auth schema migration is required for the first slice.
- Optionally add a later server-level setting:
  `trust_read_only_annotations: bool`, default `false`.

## Implementation Plan

1. Add data types:
   - `McpCapabilityConfig`, `McpAccessMode`, `McpToolGrant`, `McpToolRisk`.
   - Add `mcp` to `ExecutionCapabilityConfig`.
   - Extend `ExternalMcpToolDefinition` and possibly `ToolDefinition` with
     optional risk metadata for internal use.
2. Add policy evaluation:
   - Resolve durable `McpRef` rules to runtime server ids.
   - Classify discovered tools from annotations.
   - Unit-test default `Unknown -> approval required`.
3. Refactor MCP execution:
   - Split target resolution from external tool invocation.
   - Ensure no `mcp_client_manager` lock is held while awaiting approval.
   - Gate all calls in `execute_external_mcp_tool`.
4. Add pending approval backend:
   - New `commands::mcp_permissions` module.
   - AppState registry.
   - Tauri commands for listing pending requests, counts, and submitting
     decisions.
   - Run-scoped allow/block/trusted-read-only caches.
5. Add frontend approval UI:
   - Inline card similar to shell approvals.
   - Show server, tool, risk, description, redacted arguments, and decision
     buttons.
   - Add attention badge integration.
6. Make tool listing policy-aware:
   - Hosted provider tool list.
   - Local MCP `tools/list` for CLI-backed providers.
7. Add CLI invariant tests:
   - Claude config contains only `clai`.
   - Codex args configure only `mcp_servers.clai`.
   - A CLI-routed external tool call goes through the same policy gate.

## Open Questions

1. Should `Full` mode be available in the UI, or should users only build up
   persistent allowlists? I recommend keeping `Full` for trusted internal MCP
   servers because it is operationally useful, but it should be visually
   distinct from the default.
2. Should approvals be per tool only, or per tool plus argument pattern? The
   first implementation should be per tool. Argument-aware policies are useful
   but need a richer schema-aware editor to avoid false confidence.
3. Should "read-only annotations from this server are trusted" be a server-level
   setting? I recommend yes as a follow-up. The first implementation can use
   per-tool `TrustReadOnlyAlways`.
4. Should stdio MCP server launch require an approval separate from tool calls?
   This is a separate but real boundary. Adding/enabling a stdio MCP server
   already means executing a local command for discovery, so the settings UI
   should make that trust explicit.


MY COMMENTS BELOW:

I suggest a different approach:
- users can enable/disable mcp servers in the UI per turn, so I don't see necessary to include an Off access mode
- there are tools that are dangerous and probably difficult to evaluate, so i would not add the Full access mode.
- this leaves as in a single access mode, restricted, so I would just not make the mode configurable.
- What can we do in the default restricted access mode:
  - if the tool is readonly -> allow the execution 
  - if the tool is not readonly offer the user: Allow Once | Allow always | Deny Once 
  - approvals should be per tool only
  - no special approval to run stdio, user is responsible to run things on their hosts.

users can, similar to the commands, and paths, see the granted tools, per mcp server. and they can remove them at any point.
