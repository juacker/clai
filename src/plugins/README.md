# CLAI Plugin System

This directory contains the core plugin system infrastructure for CLAI.

## Overview

The plugin system allows CLAI to support multiple data providers (Netdata, Prometheus, Datadog, etc.) through a unified interface. Each plugin can provide different capabilities (data queries, chat, alerts, etc.).

## Architecture

### Two-Level Architecture

1. **Global Plugin Instances**: All configured plugin instances exist globally
2. **Per-Tab Active Plugins**: Each tab maintains its own list of active plugins

### Key Concepts

- **Plugin Type**: A class that implements the PluginInterface (e.g., NetdataPlugin, PrometheusPlugin)
- **Plugin Instance**: A specific instance of a plugin type with its own configuration (e.g., "Netdata Production", "Prometheus K8s")
- **Active Plugins**: The plugins currently active in a specific tab
- **Capabilities**: Features that a plugin supports (data, chat, alerts, etc.)

## Files

- **PluginInterface.js**: Base interface that all plugins must implement
- **PluginManager.js**: Manages plugin instances lifecycle and storage
- **PluginRegistry.js**: Registry of available plugin types
- **index.js**: Public API exports

## Usage

### 1. Register a Plugin Type

```javascript
import { registerPlugin } from './plugins';
import NetdataPlugin from './plugins/netdata/NetdataPlugin';

// Register the plugin type
registerPlugin(NetdataPlugin);
```

### 2. Initialize the Plugin System

```javascript
import { initializePluginSystem } from './plugins';

// In your app initialization
await initializePluginSystem();
```

### 3. Use in Components

```javascript
import { usePlugin } from '../contexts/PluginContext';

function MyComponent() {
  const {
    // Global plugin management
    allPluginInstances,
    createPluginInstance,
    removePluginInstance,

    // Tab-specific active plugins
    activePlugins,
    addPluginToTab,
    removePluginFromTab,

    // Capability-based queries (from active plugins)
    getDataProviders,
    getChatProviders,
    getPluginById,
  } = usePlugin();

  // Get all data providers active in this tab
  const dataProviders = getDataProviders();

  // Query data from a specific plugin
  const plugin = getPluginById('netdata_prod_001');
  const data = await plugin.queryData({ ... });

  return <div>...</div>;
}
```

## Plugin Capabilities

Plugins can implement different capabilities:

- **`data`**: Can query metrics/data
- **`chat`**: Can provide AI chat functionality
- **`alerts`**: Can provide alerts/notifications
- **`context`**: Has context hierarchy (spaces/rooms/namespaces)
- **`streaming`**: Supports real-time data streaming
- **`auth`**: Requires authentication

## Creating a New Plugin

See `PLUGIN_DEVELOPMENT.md` for a detailed guide on creating new plugins.

## Context Providers

### PluginProvider (Global)

Place at the root of your application to provide global plugin access:

```jsx
import { PluginProvider } from '../contexts/PluginContext';

function App() {
  return (
    <PluginProvider>
      <YourApp />
    </PluginProvider>
  );
}
```

### TabPluginProvider (Per-Tab)

Wrap each tab's content to provide tab-specific plugin context:

```jsx
import { TabPluginProvider } from '../contexts/PluginContext';

function TabContent({ tabId, activePluginIds, onActivePluginsChange }) {
  return (
    <TabPluginProvider
      tabId={tabId}
      activePluginIds={activePluginIds}
      onActivePluginsChange={onActivePluginsChange}
    >
      <YourTabContent />
    </TabPluginProvider>
  );
}
```

## Storage

Plugin instances are persisted to localStorage under the key `clai_plugin_instances`.

## Example Flow

1. User creates a Netdata plugin instance in settings
2. Plugin instance is stored globally
3. User opens Tab 1 and adds the Netdata plugin to it
4. Tab 1 now has `activePluginIds: ['netdata_prod_001']`
5. Components in Tab 1 query for data providers and get the Netdata plugin
6. User opens Tab 2 and adds a different plugin
7. Tab 2 has its own independent active plugins list

## Next Steps

- Phase 2: Implement the Netdata plugin
- Phase 3: Integrate plugin system into the application core
- Phase 4: Update UI for plugin management

