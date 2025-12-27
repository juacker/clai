# CLAI - Command Line AI Interface

A cross-platform desktop application that integrates Netdata Cloud monitoring with AI-powered insights through a terminal-like interface.

## Features

- **Terminal Emulator Interface** - Command-line style input with history navigation and auto-focus
- **AI Chat Integration** - Real-time streaming conversations with Netdata's AI service
- **Vim-inspired Tab & Tile System** - Split views horizontally or vertically, manage multiple tabs
- **Data Visualization** - Interactive charts including time series, bar charts, and bubble charts
- **Conversation Management** - Persistent chat history with auto-generated titles
- **Context Switching** - Seamlessly switch between Netdata spaces and rooms

## Installation

### Prerequisites

- Node.js (v18+)
- Rust (for Tauri)
- Platform-specific build tools (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

### Setup

```bash
# Clone the repository
git clone https://github.com/juacker/clai.git
cd clai

# Install dependencies
npm install
```

## Usage

### Development

```bash
# Start Vite dev server
npm run dev

# Start full desktop app with hot reload
npm run tauri dev
```

### Build

```bash
# Build frontend only
npm run build

# Build desktop application
npm run tauri build
```

## Commands

Commands are entered in the terminal input. Prefix with `/` for system commands, or type directly to chat with AI.

| Command | Description |
|---------|-------------|
| `/help` | Display command reference |
| `/ctx` | Manage space/room context |
| `/tab new` | Create new tab |
| `/tab close` | Close current tab |
| `/tab next` | Switch to next tab |
| `/tab prev` | Switch to previous tab |
| `/tile split-h` | Split tile horizontally |
| `/tile split-v` | Split tile vertically |
| `/tile close` | Close current tile |
| `/tile next` | Focus next tile |
| `/tile prev` | Focus previous tile |
| `/reset-all` | Reset entire layout |

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Focus terminal | `Cmd+L` | `Ctrl+L` |
| New tab | `Cmd+T` | `Ctrl+T` |
| Close tab | `Cmd+W` | `Ctrl+W` |
| Next tab | `Cmd+Tab` | `Ctrl+Tab` |
| Previous tab | `Cmd+Shift+Tab` | `Ctrl+Shift+Tab` |
| Go to tab 1-9 | `Alt+1-9` | `Alt+1-9` |
| Split vertical | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Split horizontal | `Cmd+-` | `Ctrl+-` |
| Close tile | `Cmd+Shift+W` | `Ctrl+Shift+W` |
| Next tile | `Cmd+]` | `Ctrl+]` |
| Previous tile | `Cmd+[` | `Ctrl+[` |
| Toggle chat | `Cmd+Shift+C` | `Ctrl+Shift+C` |

## Configuration

### Authentication

On first launch, you'll be prompted to enter:
- **Netdata API Token** - Your Netdata Cloud bearer token
- **Base URL** - Defaults to `https://app.netdata.cloud`

### Tauri Settings

Configuration is in `src-tauri/tauri.conf.json`:
- Window dimensions (default: 800x600)
- App identifier: `com.juacker.clai`
- Build commands and paths

## Tech Stack

**Frontend**
- React 19
- Vite
- D3.js for charts
- React Router DOM

**Desktop**
- Tauri 2
- Rust

**Styling**
- CSS Modules
- React Resizable Panels

## Project Structure

```
clai/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React Context state
│   ├── hooks/              # Custom hooks
│   ├── pages/              # Route pages
│   ├── utils/              # Utilities & command handlers
│   └── api/                # API client
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source
│   └── tauri.conf.json     # Tauri config
└── docs/                   # Architecture docs
```

## License

MIT
