<p align="center">
  <img src="public/icon.svg" alt="CLAI" width="128" height="128">
</p>

<h1 align="center">CLAI</h1>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://github.com/juacker/clai/releases"><img src="https://img.shields.io/github/v/release/juacker/clai" alt="GitHub release"></a>
  <a href="https://github.com/juacker/clai/actions/workflows/ci.yml"><img src="https://github.com/juacker/clai/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  A desktop app for building, running, and supervising small teams of AI agents.<br>
  Each workspace is a conversation with a main agent that can delegate to helper
  agents, use MCP tools, and operate on a private filesystem and shell.
</p>

<img width="1920" height="1125" alt="image" src="https://github.com/user-attachments/assets/95facd8d-d08c-40c1-8aad-b8f39d2d1d87" />

## Concept

CLAI organises work around **workspaces**. A workspace is an ongoing
conversation between you and a **main agent** — a configurable LLM that owns
the workspace's tools, provider, skills, and capability grants. The main
agent can:

- **Talk to you** in a chat-first surface that is always visible
- **Use tools** through attached MCP servers and a local execution sandbox
  (filesystem grants, shell access modes)
- **Persist context** in the workspace's private directory — memories and
  artifacts the agent writes are inspectable from the workspace header
- **Delegate to helper agents** that live inside the same workspace, each
  with their own skills, MCP access, and execution policy
- **Run on a schedule** — workspaces with a periodic main agent fire on
  their interval with the current workspace context

The **Fleet** view supervises every workspace: scheduled ones float to the
top, attention items (failed or blocked tasks, needs-input prompts) are
highlighted, and selecting a card slides in a live chat preview.

## Features

- **Workspace-local agent teams** — Add helper agents to a workspace (e.g.
  a Code Reviewer, a SoW Tracker) with their own prompts, skills, MCP
  servers, providers, and execution policy. The main agent calls them as
  tools and inspects their transcripts.

- **Bundled skills + templates** — Ships with reusable skills (iterative
  review, code-review checklist, delegation, self-reflection, second
  opinion, SoW workflow) and agent templates (`code-reviewer`,
  `sow-tracker`) ready to drop into a workspace.

- **MCP-native tools** — Configure MCP servers once in Settings, then
  attach them to a workspace or to individual helper agents. Both HTTP and
  stdio transports are supported.

- **Local execution sandbox** — Per-agent filesystem grants and shell
  access. Three shell modes: *Off*, *Restricted* (only explicitly allowed
  command prefixes — `kubectl get` permits `kubectl get pods` but not
  `kubectl delete`), and *Full* (anything not blocked).

- **Periodic workspaces** — A workspace's main agent can run on a
  schedule. The Fleet view sorts periodic workspaces above ad-hoc ones.

- **Inspectable tasks** — When the main agent delegates work, you get a
  task entry with a live transcript panel that streams the helper agent's
  full conversation, tool calls, and verdict.

- **Memory and artifacts** — Agents persist findings to a workspace
  directory; the drawer surfaces both, and clicking opens a read-only
  preview (markdown rendered, JSON pretty-printed, anything else as
  monospaced text).

- **Run notices** — When a run hits a policy denial, it completes with an
  amber "warnings" state and the Fleet surfaces it so you can adjust
  permissions instead of guessing why something silently misbehaved.

- **Provider flexibility** — Connect any OpenAI-compatible provider
  (OpenAI, together.ai, Groq, local vLLM/llama.cpp endpoints, etc.). Each
  agent can choose its own provider connection.

> **Important: local execution is not sandboxed.** Shell commands run as
> your OS user with full privileges. The allow/block lists control *which
> commands* an agent can invoke, but not *what those commands can access*
> — if you allow `cat`, the agent can read any file your user can. Path
> grants only apply to the built-in `fs.read`/`fs.write` tools, not to
> shell commands. Use *Restricted* mode with a minimal allow list and
> review run notices to catch anything you didn't anticipate.

## Installation

Download the latest release for your platform from the
[Releases page](https://github.com/juacker/clai/releases):

| Platform | Download |
|----------|----------|
| Windows  | `.msi` or `.exe` |
| macOS    | `.dmg` |
| Linux    | `.deb`, `.rpm`, or `.flatpak` |

## Getting Started

1. **Connect a provider** — In Settings, add an OpenAI-compatible
   provider and choose a default model.
2. **Add MCP servers** — Register local or remote MCP servers in Settings
   if you want the assistant to use external tools.
3. **Create a workspace** — From the Fleet view, hit *Create Workspace*.
   Each new workspace starts with an empty main agent; open its settings
   (gear icon in the header) to attach a provider, MCP servers, and any
   bundled skills.
4. **Chat with the workspace** — Talk to its main agent directly.
5. **Add helper agents (optional)** — Open the *Agents* drawer and add a
   helper, either by picking a bundled template (code-reviewer,
   sow-tracker) or building one from scratch. The main agent can then
   delegate to it.
6. **Make it periodic (optional)** — Toggle *Schedule* in the workspace
   settings to have the main agent run on an interval.

## Capability Model

CLAI scopes every capability explicitly:

- **MCP servers** are configured globally in Settings, then attached per
  workspace or per helper agent.
- **Skills** ship bundled (re-materialized on every startup) or live in
  your personal skill source; agents opt into the ones they need.
- **Local execution** is per agent: a private workspace directory,
  optional extra path grants (read-only or read-write), and shell access
  via the three modes above.
- **Inter-agent calls** are typed and depth-limited; helper agents
  declare exposed tools with input/output JSON schemas so the main agent
  invokes them like any other tool.
- **Tasks** carry a `sessionId` and stream transcripts to the UI so you
  can see exactly what a helper agent did.

## Provider Setup

CLAI uses configured provider connections for chat, Fleet inspections,
and scheduled runs. In Settings:

- connect an **OpenAI-compatible** provider using an API key
- optionally set a custom base URL for compatible providers
- choose the default model for assistant sessions and automations

Compatible with **OpenAI**, **together.ai**, **Groq**, **local
OpenAI-compatible endpoints** (vLLM, llama.cpp, Ollama with the OpenAI
adapter), and other compatible providers.

## Development

```bash
# Clone and install
git clone https://github.com/juacker/clai.git
cd clai
npm install

# Run the desktop app in development
make dev

# Verify builds and lints
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Architecture

- **Frontend** — React + Tauri. Chat-first workspace surface with a side
  drawer for agents / tasks / memories / artifacts, and slide-out panels
  for transcripts and file previews.
- **Workspace runtime** — Each workspace owns one or more agent rows
  (`workspace_agents`) and a persistent session. The default "manager"
  agent is the workspace's main agent and is hidden as an implementation
  detail.
- **Assistant runtime** — Session-scoped built-in tools (filesystem,
  inter-agent calls, task management) plus MCP tools, optionally fs/shell
  access depending on the agent's policy.
- **Scheduler** — Periodic workspaces are owned by the agent runner,
  which loads agent config straight from SQLite and emits the same
  streaming events as interactive chat.
- **Skills + templates** — Bundled assets ship via `include_dir!` and are
  re-materialised under the user's data directory on every startup;
  personal skill sources sit alongside them.
- **MCP support** — Per-server config, optional bearer auth, HTTP and
  stdio transports.

## License

MIT
