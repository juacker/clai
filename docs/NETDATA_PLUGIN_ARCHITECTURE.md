# Netdata Plugin Architecture

## Overview

This document provides a visual representation of the Netdata plugin architecture and its integration with the CLAI plugin system.

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLAI Application                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Plugin System                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │ Plugin Manager │  │ Plugin Registry  │  │ Registration    │ │
│  │                │  │                  │  │ Manager         │ │
│  └────────────────┘  └──────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Netdata Plugin                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   NetdataPlugin.js                        │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │ Plugin Interface Implementation                 │     │  │
│  │  │ • Lifecycle Methods                             │     │  │
│  │  │ • Data Methods                                  │     │  │
│  │  │ • Chat Methods                                  │     │  │
│  │  │ • Context Methods                               │     │  │
│  │  └─────────────────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    NetdataAPI.js                         │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │ API Client                                      │     │  │
│  │  │ • User & Account APIs                           │     │  │
│  │  │ • Space & Room APIs                             │     │  │
│  │  │ • Conversation APIs                             │     │  │
│  │  │ • Chat Completion (SSE)                         │     │  │
│  │  │ • Data Query APIs                               │     │  │
│  │  └─────────────────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────┬───────────┴───────────┬──────────────────┐  │
│  │               │                       │                  │  │
│  ▼               ▼                       ▼                  ▼  │
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │ Context  │ │ Config   │ │ index.js     │ │ README.md    │  │
│ │ Provider │ │ UI       │ │ (exports)    │ │ (docs)       │  │
│ └──────────┘ └──────────┘ └──────────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Netdata Cloud API                             │
│  • Authentication                                                │
│  • Spaces & Rooms                                                │
│  • Conversations & Chat                                          │
│  • Metrics & Data                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Plugin Registration (Level 1)

```
User (Settings Page)
      │
      │ Enters credentials
      ▼
┌──────────────────┐
│  NetdataConfig   │  (mode: 'registration')
│  Component       │
└────────┬─────────┘
         │ Validates credentials
         ▼
┌──────────────────┐
│  NetdataAPI      │  getUserInfo()
│                  │
└────────┬─────────┘
         │ Success
         ▼
┌──────────────────┐
│  Registration    │  Stores credentials
│  Manager         │
└──────────────────┘
```

### 2. Plugin Instance Creation (Level 2)

```
User (Context Panel)
      │
      │ Clicks "Add Plugin"
      ▼
┌──────────────────┐
│  NetdataConfig   │  (mode: 'instance')
│  Component       │
└────────┬─────────┘
         │ Fetches spaces
         ▼
┌──────────────────┐
│  NetdataAPI      │  getSpaces()
│                  │  getRooms(spaceId)
└────────┬─────────┘
         │ Returns contexts
         ▼
┌──────────────────┐
│  User selects    │  Chooses Space/Room
│  Space & Room    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Plugin Manager  │  Creates instance
│                  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  NetdataPlugin   │  initialize()
│  Instance        │
└──────────────────┘
```

### 3. Data Query Flow

```
Component (e.g., Chart)
      │
      │ Needs data
      ▼
┌──────────────────┐
│  usePlugin()     │  Gets active plugins
│  hook            │
└────────┬─────────┘
         │ Returns Netdata plugin
         ▼
┌──────────────────┐
│  NetdataPlugin   │  queryData(params)
│  Instance        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  NetdataAPI      │  getData(spaceId, roomId, params)
│                  │
└────────┬─────────┘
         │ HTTP POST
         ▼
┌──────────────────┐
│  Netdata Cloud   │  Returns data
│  API             │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Component       │  Renders data
│                  │
└──────────────────┘
```

### 4. Chat Flow (with Streaming)

```
Component (e.g., Chat)
      │
      │ User sends message
      ▼
┌──────────────────┐
│  NetdataPlugin   │  sendMessage(chatId, message, options)
│  Instance        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  NetdataAPI      │  createChatCompletion(...)
│                  │
└────────┬─────────┘
         │ Fetch API with SSE
         ▼
┌──────────────────┐
│  Netdata Cloud   │  Streams response
│  API             │
└────────┬─────────┘
         │ SSE chunks
         │
         ▼
┌──────────────────┐
│  onChunk         │  Processes each chunk
│  callback        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Component       │  Updates UI in real-time
│                  │
└──────────────────┘
```

## Class Diagram

```
┌────────────────────────────────────────┐
│         PluginInterface                │
├────────────────────────────────────────┤
│ + static id: string                    │
│ + static name: string                  │
│ + static version: string               │
│ + static capabilities: string[]        │
├────────────────────────────────────────┤
│ + constructor(config, id, name, regId) │
│ + initialize(): Promise<void>          │
│ + activate(): Promise<void>            │
│ + deactivate(): Promise<void>          │
│ + destroy(): Promise<void>             │
│ + authenticate(creds): Promise<Object> │
│ + queryData(params): Promise<Object>   │
│ + createChat(params): Promise<Object>  │
│ + sendMessage(...): Promise<Object>    │
│ + getContextDisplay(): Object          │
│ + getStatus(): Object                  │
└────────────────────────────────────────┘
                 △
                 │ extends
                 │
┌────────────────────────────────────────┐
│         NetdataPlugin                  │
├────────────────────────────────────────┤
│ + static id = 'netdata'                │
│ + static capabilities = [...]          │
│ - api: NetdataAPI                      │
│ - _spacesCache: Array                  │
│ - _roomsCache: Object                  │
│ - _userInfoCache: Object               │
├────────────────────────────────────────┤
│ + static getRegistrationSchema()       │
│ + static getInstanceParametersSchema() │
│ + static fetchAvailableContexts()      │
│ + static validateInstanceParameters()  │
│ + initialize(): Promise<void>          │
│ + queryData(params): Promise<Object>   │
│ + createChat(): Promise<Object>        │
│ + sendMessage(...): Promise<Object>    │
│ + listChats(): Promise<Array>          │
│ + getContextInfo(): Object             │
└────────────────────────────────────────┘
                 │ uses
                 ▼
┌────────────────────────────────────────┐
│          NetdataAPI                    │
├────────────────────────────────────────┤
│ - baseUrl: string                      │
│ - token: string                        │
│ - client: AxiosInstance                │
├────────────────────────────────────────┤
│ + constructor(config)                  │
│ + setToken(token): void                │
│ + setBaseUrl(url): void                │
│ + getUserInfo(): Promise<Object>       │
│ + getSpaces(): Promise<Object>         │
│ + getRooms(spaceId): Promise<Object>   │
│ + createConversation(...): Promise<..> │
│ + createChatCompletion(...): Promise<> │
│ + getData(...): Promise<Object>        │
│ + getContexts(...): Promise<Object>    │
└────────────────────────────────────────┘
```

## State Management

### Plugin Instance State

```javascript
{
  // Plugin metadata
  instanceId: 'netdata_prod_001',
  instanceName: 'Production Monitoring',
  registrationId: 'netdata_reg_1',
  status: 'active',  // 'inactive' | 'active' | 'error'
  error: null,

  // Configuration (merged registration + instance params)
  config: {
    // Level 1 (Registration)
    token: 'Bearer_token_here',
    baseUrl: 'https://app.netdata.cloud',

    // Level 2 (Instance)
    spaceId: 'space-prod',
    roomId: 'room-web'
  },

  // Cached data
  _spacesCache: [...],
  _roomsCache: { 'space-prod': [...] },
  _userInfoCache: { ... }
}
```

### Context Provider State

```javascript
{
  // Data
  spaces: [
    { id: 'space-1', name: 'Production', ... },
    { id: 'space-2', name: 'Development', ... }
  ],
  rooms: [
    { id: 'room-1', name: 'Web Servers', ... },
    { id: 'room-2', name: 'API Servers', ... }
  ],

  // Status
  loading: false,
  error: null,

  // Current context
  currentSpace: { id: 'space-1', name: 'Production', ... },
  currentRoom: { id: 'room-1', name: 'Web Servers', ... },

  // Methods
  fetchContexts: Function,
  fetchRoomsForSpace: Function,
  refresh: Function
}
```

## Lifecycle

### Plugin Lifecycle States

```
┌──────────┐
│ Created  │  (constructor called)
└────┬─────┘
     │
     │ initialize()
     ▼
┌──────────┐
│ Inactive │  (initialized but not in use)
└────┬─────┘
     │
     │ activate() (added to tab)
     ▼
┌──────────┐
│  Active  │  (in use on a tab)
└────┬─────┘
     │
     │ deactivate() (removed from tab)
     ▼
┌──────────┐
│ Inactive │
└────┬─────┘
     │
     │ destroy() (instance removed)
     ▼
┌──────────┐
│ Destroyed│
└──────────┘
```

### Error State Handling

```
┌──────────┐
│  Active  │
└────┬─────┘
     │
     │ API call fails
     ▼
┌──────────┐
│  Error   │  (error state, can retry)
└────┬─────┘
     │
     │ retry success
     ▼
┌──────────┐
│  Active  │
└──────────┘
```

## Integration Points

### With Plugin Manager

```
PluginManager
    │
    ├─ registerPluginType(NetdataPlugin)
    │   └─ Registers Netdata as available plugin type
    │
    ├─ createPluginInstance(type, name, regId, params)
    │   └─ Creates new NetdataPlugin instance
    │
    ├─ getPluginInstance(instanceId)
    │   └─ Returns specific instance
    │
    └─ removePluginInstance(instanceId)
        └─ Destroys instance
```

### With Registration Manager

```
PluginRegistrationManager
    │
    ├─ registerPlugin(type, name, config)
    │   └─ Stores credentials (Level 1)
    │
    ├─ getRegistration(registrationId)
    │   └─ Returns stored credentials
    │
    └─ removeRegistration(registrationId)
        └─ Removes credentials and all instances
```

### With Tab Context

```
TabContext
    │
    ├─ activePlugins: ['netdata_prod_001', 'netdata_dev_002']
    │   └─ List of active plugin instance IDs for current tab
    │
    ├─ addPluginToTab(tabId, pluginId)
    │   └─ Adds plugin instance to tab
    │
    └─ removePluginFromTab(tabId, pluginId)
        └─ Removes plugin instance from tab
```

## Capabilities Matrix

| Capability | Netdata | Prometheus | Datadog |
|------------|---------|------------|---------|
| data       | ✅      | ✅         | ✅      |
| chat       | ✅      | ❌         | ❌      |
| context    | ✅      | ✅         | ✅      |
| auth       | ✅      | ✅         | ✅      |
| streaming  | ✅      | ❌         | ❌      |
| alerts     | ❌      | ✅         | ✅      |

## Configuration UI Flow

```
Settings Page
    │
    ├─ Registration Form (Level 1)
    │   ├─ Input: token
    │   ├─ Input: baseUrl
    │   ├─ Button: Validate
    │   └─ Button: Save
    │       └─> Stores in PluginRegistrationManager
    │
Context Panel
    │
    └─ Instance Creation (Level 2)
        ├─ Dropdown: Select Registration
        ├─ Dropdown: Select Space (fetched from API)
        ├─ Dropdown: Select Room (fetched from API)
        ├─ Input: Instance Name
        └─ Button: Add
            └─> Creates instance and adds to tab
```

## Security Considerations

### Credential Storage

```
Registration (Level 1)
    │
    ├─ Token stored in localStorage
    │   └─ Key: 'clai_plugin_registrations'
    │
    └─ Future: Consider encryption
        └─ encrypt(token) before storage
```

### API Communication

```
NetdataAPI
    │
    ├─ HTTPS only (enforced by baseUrl validation)
    │
    ├─ Bearer token in Authorization header
    │
    └─ Automatic token refresh (future)
```

## Performance Optimizations

### Caching Strategy

```
NetdataPlugin
    │
    ├─ User Info Cache
    │   └─ Cached until plugin destroyed
    │
    ├─ Spaces Cache
    │   └─ Cached until plugin destroyed
    │
    └─ Rooms Cache (per space)
        └─ Cached until plugin destroyed
```

### Lazy Loading

```
Plugin System
    │
    ├─ Plugin types registered at startup
    │
    ├─ Plugin instances created on demand
    │
    └─ API clients created per instance
```

## Error Handling Strategy

```
API Error
    │
    ├─ Authentication Error (401/403)
    │   └─> Flag plugin as error state
    │       └─> Show re-authentication UI
    │
    ├─ Network Error
    │   └─> Show retry UI
    │       └─> Keep plugin active
    │
    └─ Validation Error
        └─> Show error message
            └─> Keep plugin active
```

## Future Enhancements

1. **Credential Encryption**
   - Encrypt tokens before localStorage
   - Decrypt on plugin initialization

2. **Token Refresh**
   - Automatic token refresh
   - Handle token expiration gracefully

3. **Connection Pooling**
   - Share API clients across instances
   - Reduce memory usage

4. **Advanced Caching**
   - Time-based cache invalidation
   - Cache size limits
   - Cache persistence

5. **Health Monitoring**
   - Periodic health checks
   - Auto-reconnect on failure
   - Status dashboard

---

**Document Version:** 1.0

**Last Updated:** 2025-11-20

**Related Documents:**
- [Plugin System Architecture](PLUGIN_SYSTEM_ARCHITECTURE.md)
- [Phase 2 Implementation Summary](PHASE2_IMPLEMENTATION_SUMMARY.md)
- [Netdata Plugin README](../src/plugins/netdata/README.md)

