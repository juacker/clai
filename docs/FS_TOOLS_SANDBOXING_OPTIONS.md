# Sandboxing `fs_*` Tools

## Problem

In the Flatpak build, `fs_request_grant` can grant a path that the in-process
`fs_*` tools cannot actually use.

Example:

1. The agent calls `fs_request_grant({ path: "/tmp", access: "read_write" })`.
2. The user approves.
3. The tool result says the grant is active.
4. The agent then calls `fs_write("/tmp/file.md", ...)`.
5. `fs_write` rejects the call with:
   `granted but unreachable by fs_* tools in the Flatpak build`.

This happens because `fs_*` tools run inside the already-running CLAI backend
process. In Flatpak, that process sees the Flatpak mount namespace, where
`/tmp` is private and most host paths outside home are absent or divergent.

`bash_exec` is different. On Linux it starts a child process under bwrap. In
Flatpak, that bwrap invocation is launched on the host through
`flatpak-spawn --host bwrap ...`, so its path grants are interpreted against
the host filesystem. A grant to host `/tmp` is meaningful for `bash_exec`, but
not for in-process `fs_write`.

The current code already knows this:

- `fs_glob` drops Flatpak-unreachable grants.
- `fs_read` and `fs_list` reject unreachable paths before checking existence.
- `fs_write` rejects unreachable paths before writing.
- `fs_request_grant` does not warn that the grant is shell-usable but
  `fs_*`-unusable.

That creates a bad interaction loop: the user approves a grant, the model sees
success, then the next natural `fs_*` call fails.

## Why `fs_*` Cannot Simply "Use bwrap" In Place

bwrap creates a mount namespace for a child process. It cannot retrofit new
mounts into the already-running CLAI backend process. The current `fs_*`
implementation performs Rust `std::fs` operations directly in the Tauri
process, so it is bound by the Tauri process's existing filesystem namespace.

To give `fs_*` the same host-path semantics as `bash_exec`, the actual read,
write, list, or glob operation must happen in a sandboxed child process. That
means one of:

- invoke host tools inside bwrap for every filesystem operation;
- run a dedicated filesystem helper binary inside bwrap;
- replace or supplement `fs_*` with a host-side service that owns sandboxed
  filesystem operations.

The current `SandboxCommand` runner is command-oriented: it takes argv, cwd,
timeout, output limit, and a `SandboxProfile`; it launches bwrap; captures
stdout/stderr; and exits. That is enough for shell commands, but `fs_*` needs
structured results, binary-safe input/output, precise errors, and no shell
injection risk.

## Constraints

Security:

- `fs_*` must enforce the same workspace and path-grant policy as today.
- It must not expose host paths beyond the agent's workspace and approved
  grants.
- It should avoid symlink escapes and time-of-check/time-of-use races.
- It should not widen Flatpak app permissions to make in-process access easier.

UX:

- A path grant should not appear more capable than it is.
- Tool errors should tell the agent what action is possible next.
- Hosted-provider and CLI-provider behavior should stay consistent.

Portability:

- Native Linux can use bwrap directly.
- Flatpak can use host bwrap through `flatpak-spawn --host`.
- macOS and Windows currently have no equivalent sandbox backend.

Implementation:

- `fs_write` must handle arbitrary text content without shell escaping.
- Future support may need binary reads/writes.
- `fs_glob` and recursive list need stable result limits.
- The backend should keep structured JSON tool results.

## Options

### Option 1: Keep `fs_*` In-Process, Improve Grant UX

Keep the current architecture. Add explicit Flatpak reachability metadata to
`fs_request_grant` and the approval UI.

Changes:

- When a Flatpak non-home path is approved, return:
  `usableByFsTools: false`, `usableByShell: true`.
- Add a tool-result note:
  `This grant is usable by bash_exec only in Flatpak. Use bash_exec for this path.`
- Show the same warning in the path-grant approval card.
- Fix `~` expansion in `fs_request_grant` to use the real host home, not the
  Flatpak app `$HOME`.
- Update system prompts/tool descriptions so agents prefer writing into the
  workspace with `fs_write`, and use `bash_exec` for approved non-home Flatpak
  paths.

Pros:

- Smallest change.
- Keeps `fs_*` fast and simple.
- Does not introduce helper binaries or new IPC.
- Preserves current `bash_exec` workaround.

Cons:

- `fs_*` still cannot operate on approved host paths outside home in Flatpak.
- The model must choose the right tool after reading metadata.
- Non-home grants have split semantics: shell can use them, `fs_*` cannot.

This should be the immediate fix even if we later implement a deeper change.

### Option 2: Implement `fs_*` With Host Utilities Inside bwrap

Translate each `fs_*` operation into a sandboxed command:

- `fs_read`: `cat` or another direct reader.
- `fs_write`: write content through stdin to a destination.
- `fs_list`: `find`, `stat`, or similar.
- `fs_glob`: `find` plus pattern filtering.

The command would run under the same `SandboxProfile` as `bash_exec`, so Flatpak
host paths and grants would behave the same way.

Pros:

- Reuses the existing bwrap runner.
- No separate helper binary.
- Fixes Flatpak non-home paths for `fs_*`.

Cons:

- Shelling out safely is harder than it looks.
- `SandboxCommand` currently uses null stdin; `fs_write` would need stdin
  support.
- Avoiding `/bin/sh -c` is important to prevent shell injection, but pure argv
  versions of `find`, `stat`, and write operations are more fiddly.
- Host utility behavior varies by platform and distro.
- Parsing tool output back into structured JSON is brittle.
- Text encoding, file names with newlines, and binary content are awkward.

This is viable only as a short-lived bridge. It is not a good long-term
implementation for precise filesystem tools.

### Option 3: Add a Sandboxed Filesystem Helper Binary

Add a small helper process that runs inside bwrap and performs filesystem
operations in Rust. CLAI sends it a JSON request over stdin and reads a JSON
response from stdout.

Example request:

```json
{
  "op": "write",
  "path": "/tmp/cloud-insights-tool-errors-issue.md",
  "content": "...",
  "createParents": false
}
```

The helper would implement:

- `list`
- `glob`
- `read`
- `write`
- possibly future binary read/write variants

CLAI would still do policy evaluation before launching the helper. The helper
would run in a sandbox that only contains the workspace and approved grants, so
even a bug in path validation has a smaller blast radius.

Flatpak complication:

The normal CLAI binary lives inside the Flatpak filesystem, usually under
`/app`. Host bwrap launched through `flatpak-spawn --host` cannot directly exec
that `/app` path because `/app` is not a host path. A helper for Flatpak must
therefore be available from a host-visible path.

Practical approaches:

- Bundle a small static helper artifact and copy it to a host-visible cache
  directory such as `~/.clai/cache/fs-helper/<version>/clai-fs-helper`.
- Verify checksum and executable mode before use.
- Execute that cached helper inside host bwrap.

Pros:

- Gives `fs_*` and `bash_exec` the same path-grant semantics on Linux/Flatpak.
- Keeps structured JSON results.
- Avoids shell escaping and host utility parsing.
- Lets us keep the existing Rust filesystem behavior in a focused helper.
- Improves security by moving filesystem operations into a per-call sandbox.

Cons:

- More implementation work.
- Requires stdin support in the sandbox runner.
- Requires helper versioning, checksum validation, install/copy flow, and tests.
- Static helper builds add packaging complexity.
- Still needs a fallback for platforms without a sandbox backend.

This is the strongest long-term option.

### Option 4: Run a Long-Lived Sandboxed Filesystem Service

Instead of launching a helper per tool call, start one helper per run or per
session inside bwrap and communicate over stdin/stdout or a private socket.

Pros:

- Lower per-call process startup overhead.
- Can cache directory traversal state or compiled glob patterns.

Cons:

- More lifecycle complexity.
- Harder cancellation semantics.
- Must restart when grants change mid-run.
- A long-lived process increases the impact of helper bugs.
- More complicated to tie to run cancellation and workspace deletion.

This is not recommended for v1. Per-call helpers are simpler and safer.

### Option 5: Broaden Flatpak Filesystem Permissions

Change the Flatpak manifest to expose more host filesystem paths to the CLAI
process, so in-process `fs_*` can see them.

Pros:

- Minimal code changes.

Cons:

- Breaks the per-agent/workspace permission model. The whole app process would
  see more host filesystem state, not just the approved agent operation.
- Cannot express dynamic per-run grants.
- Makes the Flatpak boundary less meaningful.
- Still does not solve arbitrary future paths unless permissions become very
  broad.

This is not recommended.

## Recommended Direction

Use a two-phase approach.

### Phase 1: Fix the UX and Metadata

Implement Option 1 immediately:

1. Add a helper such as `fs_path_reachability(path) -> FsPathReachability`.
2. In Flatpak, classify non-home paths as:
   - `usable_by_fs_tools = false`
   - `usable_by_shell = true`
3. Include that classification in `fs_request_grant` results.
4. Include it in `PathGrantRequest` so the approval card can warn the user.
5. Fix `canonicalize_requested_path` to expand `~` with the real host home.
6. Update the `fs_request_grant` tool description to say non-home Flatpak
   grants may require `bash_exec`.

This removes the surprising "grant succeeded, write failed" loop without
changing the sandbox architecture.

### Phase 2: Add a Sandboxed FS Helper for Linux

Implement Option 3.

Design:

- Add `src-tauri/src/assistant/fs_helper_protocol.rs` with request/response
  types shared by CLAI and the helper.
- Build a small static `clai-fs-helper` binary for Linux.
- On startup or first use, install the helper into a host-visible cache path
  under the real home directory.
- Extend `SandboxCommand` to support stdin bytes and a separate output mode for
  helper JSON.
- Build the same `SandboxProfile` currently used by `bash_exec`.
- Launch the helper with argv like:
  `clai-fs-helper --json`
- Send one operation as JSON on stdin.
- Parse one JSON response from stdout.
- Keep policy checks in the main CLAI process before launching the helper.

Rollout:

- Native Linux: use helper for all `fs_*` calls, or initially only for paths
  that are unreachable in-process.
- Flatpak: use helper for all `fs_*` calls once the helper install path is
  reliable.
- macOS/Windows: keep current in-process `fs_*` until sandbox backends exist.

The more consistent choice is to use the helper for all Linux `fs_*` calls.
That avoids path-dependent behavior and makes Linux filesystem access uniformly
sandboxed.

## Testing Plan

Unit tests:

- Flatpak reachability classification:
  - host home path is `fs_*` reachable;
  - `/tmp` is not `fs_*` reachable but is shell-sandbox reachable;
  - unknown host home fails open or produces a conservative warning.
- `~` expansion uses real host home.
- Grant result includes reachability metadata.
- Blocked/out-of-grant paths are still denied before helper launch.

Sandbox argument tests:

- Helper launch binds workspace and grants in the same order as `bash_exec`.
- Read-only grants use `--ro-bind`.
- Read-write grants use `--bind`.
- Workspace bind remains read-write and wins over read-only ancestors.

Integration tests:

- In Flatpak or a Flatpak-like harness, approve `/tmp` and verify:
  - Phase 1: `fs_request_grant` warns that only `bash_exec` can use it.
  - Phase 2: `fs_write` writes to host `/tmp` through the helper.
- Verify a denied path is not readable or writable even if the helper is called
  with that path.
- Verify recursive listing respects result limits.
- Verify write content with quotes, shell metacharacters, and newlines does not
  require shell escaping and lands exactly as provided.

## Documentation Updates

Update `LOCAL_EXECUTION_SANDBOX_DESIGN.md`.

The current text says Flatpak path grants outside the Flatpak filesystem scope
should fail at configuration time. That is only true for in-process `fs_*`
tools. With host-side bwrap, those same grants can be meaningful for
`bash_exec`, and with a future helper they can be meaningful for `fs_*` too.

The doc should distinguish:

- app-process reachability;
- host-side sandbox reachability;
- user-granted policy reachability.

Those are currently conflated.

