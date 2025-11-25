# Netdata Plugin

The Netdata Plugin provides integration with Netdata Cloud for monitoring data and AI-powered chat capabilities.

## Features

- **Data Querying**: Query metrics and time-series data from Netdata Cloud
- **Chat Support**: AI-powered chat conversations about your infrastructure
- **Context Management**: Support for Spaces and Rooms hierarchy
- **Streaming**: Real-time chat completion with Server-Sent Events (SSE)
- **Authentication**: Secure Bearer token authentication

## Capabilities

The Netdata plugin supports the following capabilities:

- `data` - Query metrics and monitoring data
- `chat` - AI-powered chat conversations
- `context` - Hierarchical context (Spaces → Rooms)
- `auth` - Authentication required
- `streaming` - Real-time data streaming

## Architecture

### Two-Level Architecture

The Netdata plugin follows the two-level architecture pattern:

1. **Level 1 - Registration** (Settings Page)
   - User registers Netdata credentials (token + base URL)
   - One registration unlocks access to all spaces/rooms

2. **Level 2 - Instance Creation** (Context Panel)
   - User creates specific instances by selecting Space/Room
   - Multiple instances can be created from one registration
   - Each instance represents a specific Space/Room combination

### Components

- **NetdataPlugin.js** - Main plugin class implementing PluginInterface
- **NetdataAPI.js** - API client for Netdata Cloud REST APIs
- **NetdataContext.jsx** - React context for managing Netdata-specific state
- **NetdataConfig.jsx** - Configuration UI component

## Usage

### Registration (Level 1)

```javascript
// In settings page
const registrationConfig = {
  token: 'your-netdata-cloud-token',
  baseUrl: 'https://app.netdata.cloud'
};

await pluginRegistrationManager.registerPlugin('netdata', 'My Netdata', registrationConfig);
```

### Instance Creation (Level 2)

```javascript
// In context panel
const instanceParams = {
  spaceId: 'space-123',
  roomId: 'room-456'
};

const instance = await pluginManager.createPluginInstance(
  'netdata',
  'Production Environment',
  registrationId,
  instanceParams
);
```

### Using the Plugin

```javascript
// Query data
const data = await plugin.queryData({
  scope: {
    contexts: ['system.cpu'],
    nodes: ['node1', 'node2']
  },
  window: {
    after: Math.floor(Date.now() / 1000) - 3600,
    before: Math.floor(Date.now() / 1000),
    points: 100
  },
  aggregations: {
    metrics: [
      { aggregation: 'avg', group_by: ['dimension'] }
    ],
    time: {
      time_group: 'average',
      time_resampling: 60
    }
  }
});

// Create chat
const chat = await plugin.createChat();

// Send message with streaming
await plugin.sendMessage(chat.id, 'What is the CPU usage?', {
  onChunk: (chunk) => {
    if (chunk.type === 'content_block_delta') {
      console.log(chunk.delta.text);
    }
  }
});

// List conversations
const chats = await plugin.listChats();

// Get context info
const contextInfo = plugin.getContextInfo();
console.log(contextInfo);
// Output: { 'Plugin': 'Netdata', 'Space ID': 'space-123', 'Room ID': 'room-456', ... }
```

## Configuration Schema

### Registration Schema (Level 1)

```json
{
  "type": "object",
  "properties": {
    "token": {
      "type": "string",
      "title": "Authentication Token",
      "description": "Netdata Cloud Bearer token"
    },
    "baseUrl": {
      "type": "string",
      "title": "Base URL",
      "description": "Netdata Cloud base URL",
      "default": "https://app.netdata.cloud"
    }
  },
  "required": ["token", "baseUrl"]
}
```

### Instance Parameters Schema (Level 2)

```json
{
  "type": "object",
  "properties": {
    "spaceId": {
      "type": "string",
      "title": "Space",
      "description": "Netdata Cloud Space ID"
    },
    "roomId": {
      "type": "string",
      "title": "Room",
      "description": "Netdata Cloud Room ID"
    }
  },
  "required": ["spaceId", "roomId"]
}
```

## API Methods

### Authentication

- `authenticate(credentials)` - Authenticate with Netdata Cloud
- `isAuthenticated()` - Check authentication status
- `getUserInfo()` - Get current user information

### Data Queries

- `queryData(params)` - Query metrics and time-series data
- `getMetadata(params)` - Get available contexts and metrics
- `getAvailableContexts()` - Get spaces and rooms

### Chat

- `createChat(params)` - Create a new conversation
- `sendMessage(chatId, message, options)` - Send a message (with streaming support)
- `listChats()` - List all conversations
- `getChat(chatId)` - Get a specific conversation
- `deleteChat(chatId)` - Delete a conversation
- `updateChatTitle(chatId, messageContent)` - Generate and update conversation title

### Context

- `getContextDisplay()` - Get display information for UI
- `getContextInfo()` - Get detailed context information

## Error Handling

The plugin handles errors consistently:

- Authentication errors (401/403) are caught and flagged
- API errors include detailed error messages
- Network errors are handled gracefully
- All async methods throw descriptive errors

## Caching

The plugin caches the following data to reduce API calls:

- User information
- Spaces list
- Rooms list (per space)

Cache is refreshed on:
- Plugin initialization
- Explicit refresh calls
- Authentication changes

## Example: Complete Workflow

```javascript
// 1. Register Netdata credentials (once)
const registration = await pluginRegistrationManager.registerPlugin(
  'netdata',
  'My Netdata Account',
  {
    token: 'your-token',
    baseUrl: 'https://app.netdata.cloud'
  }
);

// 2. Create instances for different spaces/rooms
const prodInstance = await pluginManager.createPluginInstance(
  'netdata',
  'Production',
  registration.id,
  { spaceId: 'space-prod', roomId: 'room-web' }
);

const devInstance = await pluginManager.createPluginInstance(
  'netdata',
  'Development',
  registration.id,
  { spaceId: 'space-dev', roomId: 'room-api' }
);

// 3. Use instances in different tabs
// Tab 1: Production monitoring
await pluginManager.addPluginToTab('tab1', prodInstance.id);

// Tab 2: Development monitoring
await pluginManager.addPluginToTab('tab2', devInstance.id);

// 4. Query data from production
const prodData = await prodInstance.queryData({
  scope: { contexts: ['system.cpu'], nodes: ['*'] },
  window: { after: now - 3600, before: now },
  aggregations: { /* ... */ }
});

// 5. Chat about development environment
const chat = await devInstance.createChat();
await devInstance.sendMessage(chat.id, 'Show me API errors', {
  onChunk: (chunk) => console.log(chunk)
});
```

## Development

### Adding New Features

To add new features to the Netdata plugin:

1. Add methods to `NetdataAPI.js` for new API endpoints
2. Implement corresponding methods in `NetdataPlugin.js`
3. Update capabilities if needed
4. Add tests
5. Update this README

### Testing

```bash
# Run plugin tests
npm test -- src/plugins/netdata

# Test integration
npm run test:integration
```

## Troubleshooting

### Authentication Issues

- Verify token is valid and not expired
- Check base URL is correct
- Ensure network connectivity to Netdata Cloud

### Data Query Issues

- Verify space/room IDs are correct
- Check time window parameters
- Ensure nodes exist in the selected room

### Chat Issues

- Verify chat capability is enabled
- Check conversation ID is valid
- Ensure proper error handling for streaming

## Related Files

- `src/plugins/PluginInterface.js` - Base plugin interface
- `src/plugins/PluginManager.js` - Plugin lifecycle management
- `src/plugins/PluginRegistry.js` - Plugin registration
- `src/api/client.js` - Original Netdata API implementation (deprecated)

## Migration from Legacy API

If migrating from the old `src/api/client.js`:

```javascript
// Old way
import { getData, createConversation } from '../api/client';
const data = await getData(token, spaceId, roomId, params);

// New way
import { usePlugin } from '../contexts/PluginContext';
const { activePlugins } = usePlugin();
const netdataPlugin = activePlugins.find(p => p.constructor.id === 'netdata');
const data = await netdataPlugin.queryData(params);
```

## License

Same as CLAI application license.

