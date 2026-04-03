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
  A desktop multi-agent orchestration app with MCP-native tools, local execution capabilities, shared workspaces, and scheduled automations.
</p>

<img width="1920" height="1125" alt="image" src="https://github.com/user-attachments/assets/95facd8d-d08c-40c1-8aad-b8f39d2d1d87" />

## Features

- **MCP-Native Assistant** - Attach MCP servers to a tab and the assistant uses their tools directly. Each tab scopes its own capability access.

- **Scheduled Automations** - Create automations that run on a schedule with their own MCP servers, filesystem grants, and shell policies.

- **Local Execution** - Agents get a private workspace directory and can optionally read/write additional paths and run shell commands, controlled by per-agent allow/block lists.

- **Shell Access Modes** - Three modes per agent: *Off* (no shell), *Restricted* (only explicitly allowed command prefixes can run), and *Full* (anything not blocked). Prefix matching supports subcommands — allowing `kubectl get` permits `kubectl get pods` but not `kubectl delete`.

- **Run Notices** - When an agent hits a policy denial, the run completes with an amber "warnings" state instead of failing silently. The Fleet view surfaces these so you can adjust permissions.

- **Workspace Orchestration** - The assistant can split tiles, add canvas nodes, open anomalies panels, and create dashboard charts as part of a workflow.

- **Canvas and Dashboards** - Automations and chat sessions create visual artifacts directly in the workspace with explicit targets.

- **Tabbed Capability Scopes** - Normal tabs start with no MCP access until you attach servers. Automation tabs inherit their MCP and execution config.

- **Provider Flexibility** - Connect any OpenAI-compatible provider and model, including OpenAI, together.ai, Groq, and local endpoints.

> **Important: local execution is not sandboxed.** Shell commands run as your OS user with full privileges. The allow/block lists control *which commands* the agent can invoke, but do not restrict *what those commands can access* — if you allow `cat`, the agent can read any file your user can, not just the paths in the grant list. Path grants only apply to the built-in `fs.read`/`fs.write` tools, not to shell commands. LLMs can also chain commands in unexpected ways. Always use *Restricted* mode with a minimal allow list, and review run notices to catch anything you didn't anticipate.

## Installation

Download the latest release for your platform from the [Releases page](https://github.com/juacker/clai/releases):

| Platform | Download |
|----------|----------|
| Windows | `.msi` or `.exe` |
| macOS | `.dmg` |
| Linux | `.deb`, `.rpm`, or `.flatpak` |

## Getting Started

1. **Connect a provider** - In Settings, add an OpenAI-compatible provider and choose a default model
2. **Add MCP servers** - Register local or remote MCP servers in Settings
3. **Attach servers to a tab** - Use the `Add MCP` badge in the tab context bar to grant tools
4. **Chat or orchestrate** - Ask the assistant to inspect tools, fetch data, open panels, or build visualizations
5. **Create agents** - Set up scheduled automations with their own MCP servers and local execution policies
6. **Configure local execution** - Grant filesystem paths and shell access per agent, starting with Restricted mode

## Capability Model

CLAI scopes every capability explicitly:

- **MCP servers** are configured globally in Settings, then attached per tab or per automation
- **Normal tabs** have no MCP access until you attach servers
- **Automations** use the MCP servers and execution policy from their config
- **Built-in tools** handle workspace orchestration — tabs, canvas, dashboards, anomalies panels
- **Local execution** is per agent: a private workspace directory, optional extra path grants (read-only or read-write), and shell access with prefix-based allow/block lists
- **Domain tools** come from MCP servers

## Provider Setup

CLAI uses a configured provider plus a default model for chat, Fleet interventions, and scheduled automations.

In Settings:

- connect an **OpenAI-compatible** provider using an API key
- optionally set a custom base URL for compatible providers
- choose the default model for assistant sessions and automations

Compatible with **OpenAI**, **together.ai**, **Groq**, **local OpenAI-compatible endpoints**, and other compatible providers.

## Netdata Cloud Integration

Adding a [Netdata Cloud](https://www.netdata.cloud) MCP server unlocks extra workspace tools:

- **Dashboard charts** — the assistant can add live metric charts directly to the workspace
- **Anomaly panels** — open dedicated anomaly investigation views for any monitored node
- **Canvas visualizations** — build visual topologies with metric chart nodes, status badges, and markdown

These tools (`dashboard.addChart`, `canvas.addChart`, `anomalies.open`) appear automatically when a Netdata-capable MCP server is attached to the session.

## Development

```bash
# Clone and install
git clone https://github.com/juacker/clai.git
cd clai
npm install

# Run the desktop app in development
make dev

# Verify builds
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Architecture

- **Frontend**: React + Tauri
- **Workspace runtime**: tabs, split tiles, canvas, dashboards, anomalies panels
- **Assistant runtime**: session-scoped built-ins + MCP tools, optional fs/shell access
- **Automation runtime**: scheduled agents with private workspaces and execution policies
- **MCP support**: per-server config, optional bearer auth, HTTP and stdio transports

## License

MIT
