<p align="center">
  <img src="public/icon.png" alt="CLAI" width="128" height="128">
</p>

<h1 align="center">CLAI - Netdata AI Desktop</h1>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
  <a href="https://github.com/juacker/clai/releases"><img src="https://img.shields.io/github/v/release/juacker/clai" alt="GitHub release"></a>
  <a href="https://github.com/juacker/clai/actions/workflows/ci.yml"><img src="https://github.com/juacker/clai/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  A desktop app for Netdata Cloud with AI-powered monitoring insights and autonomous workers.
</p>

## Features

- **AI Chat** - Query your infrastructure using natural language. Ask about anomalies, alerts, performance, and get instant analysis.

- **AI Workers (Auto-pilot)** - Autonomous AI agents that continuously monitor your infrastructure. Workers use Claude Code, Gemini CLI, or Codex to analyze metrics, detect issues, and visualize findings on a canvas - all without manual intervention.

- **Interactive Canvas** - Workers display charts and visualizations automatically. Review what the AI found, add charts to your dashboard, and explore the data.

- **Terminal Interface** - Vim-inspired command system with tabs, split tiles, and keyboard shortcuts. Type `/help` to see all commands.

## Installation

Download the latest release for your platform from the [Releases page](https://github.com/juacker/clai/releases):

| Platform | Download |
|----------|----------|
| Windows | `.msi` or `.exe` |
| macOS | `.dmg` |
| Linux | `.deb`, `.rpm`, or `.flatpak` |

## Getting Started

1. **Login** - Enter your Netdata Cloud API token
2. **Select Context** - Choose a space and room to monitor
3. **Chat** - Type questions directly to chat with the AI
4. **Enable Auto-pilot** - Configure an AI provider (Claude Code, Gemini CLI, or Codex) and enable auto-pilot to let AI workers monitor for you

## AI Workers Setup

To use AI Workers, you need one of these CLI tools installed:

- **[Claude Code](https://claude.ai/code)** - `claude` CLI (recommended)
- **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** - `gemini` CLI
- **[Codex](https://github.com/openai/codex)** - `codex` CLI

Configure your provider in the app settings, then enable auto-pilot. Workers will periodically analyze your infrastructure and report findings.

## Development

```bash
# Clone and install
git clone https://github.com/juacker/clai.git
cd clai && npm install

# Run development
make dev

# Run CI checks before pushing
make ci
```

## License

MIT
