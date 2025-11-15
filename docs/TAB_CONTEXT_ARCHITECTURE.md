# Tab Context Architecture

## Overview

This document describes the architectural redesign to move SpaceRoomContext from the global application level to the tab level. This change allows each tab to have its own independent context (space/room selection and potentially other context data), enabling users to work with different environments simultaneously.

## Motivation

### Current Architecture Problems
1. **Global Context**: Single SpaceRoomContext shared across all tabs
2. **No Isolation**: All tabs see the same space/room selection
3. **Limited Flexibility**: Cannot work with production and staging simultaneously
4. **Poor UX**: Changing space/room affects all tabs at once

### Proposed Solution Benefits
1. **Tab-Level Context**: Each tab has its own space/room selection
2. **Context Isolation**: Tabs are independent workspaces
3. **Multi-Environment**: Work with prod, staging, dev simultaneously in different tabs
4. **Better UX**: Context changes only affect the current tab
5. **Future-Proof**: Foundation for additional tab-specific context (custom key-value pairs, etc.)

## Architecture Design

### 1. TabContext Structure

**TabContext** is a wrapper that contains all tab-specific context data, including SpaceRoomContext and future extensibility for custom context data.

```javascript
// Tab Context Data Structure
{
  // Space/Room Context
  spaceRoom: {
    selectedSpace: Space | null,
    selectedRoom: Room | null,
  },

  // Future: Custom context key-value pairs
  customContext: {
    // User-defined context variables
    // Example: { environment: 'production', region: 'us-east-1' }
  },

  // Future: Other tab-specific settings
  settings: {
    // Tab-specific preferences
  }
}
```

### 2. Updated Tab Data Structure

```javascript
// Tab Interface (in TabManagerContext)
{
  id: string,                    // Unique tab ID
  title: string,                 // Tab title
  createdAt: number,             // Timestamp

  // NEW: Tab-specific context
  context: {
    spaceRoom: {
      selectedSpaceId: string | null,
      selectedRoomId: string | null,
    },
    customContext: Record<string, any>,
  },

  // Tile layout (for Phase 3)
  rootTile: Tile,
}
```

### 3. Component Hierarchy

#### Current (Global SpaceRoomContext)
```
MainLayout
└── SpaceRoomProvider (GLOBAL)
    └── CommandProvider
        └── TabManagerProvider
            └── TerminalEmulator
            └── Home
                └── TabView
                    └── [All tabs share same context]
```

#### Proposed (Tab-Level Context)
```
MainLayout
└── CommandProvider
    └── TabManagerProvider
        └── SharedSpaceRoomDataProvider (Shared data cache)
            └── TerminalEmulator
            └── Home
                └── TabView
                    └── TabContent (for each tab)
                        └── TabContextProvider (PER TAB)
                            └── [Tab-specific content]
```

### 4. Two-Layer Context Architecture

To optimize performance and avoid redundant API calls, we'll use a **two-layer approach**:

#### Layer 1: SharedSpaceRoomData (Global)
- **Purpose**: Shared cache of spaces and rooms data
- **Responsibility**: Fetch and cache spaces/rooms from API
- **Location**: High in component tree (below TabManagerProvider)
- **State**:
  ```javascript
  {
    spaces: Space[],           // All available spaces
    roomsCache: Map<spaceId, Room[]>,  // Cached rooms per space
    loading: boolean,
    error: Error | null,
    refetch: () => void,
  }
  ```

#### Layer 2: TabContext (Per Tab)
- **Purpose**: Tab-specific space/room selection
- **Responsibility**: Manage selected space/room for this tab
- **Location**: Wraps each tab's content
- **State**:
  ```javascript
  {
    // Space/Room Selection
    selectedSpace: Space | null,
    selectedRoom: Room | null,
    rooms: Room[],              // Rooms for selected space

    // Methods
    changeSpace: (space: Space) => void,
    changeRoom: (room: Room) => void,

    // Custom Context (Future)
    customContext: Record<string, any>,
    setCustomContext: (key: string, value: any) => void,
  }
  ```

### 5. Data Flow

```
┌─────────────────────────────────────────────────┐
│     SharedSpaceRoomDataProvider (Global)        │
│  - Fetches spaces from API once                 │
│  - Caches rooms per space                       │
│  - Provides shared data to all tabs             │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
┌──────▼──────┐         ┌──────▼──────┐
│  Tab 1      │         │  Tab 2      │
│  Context    │         │  Context    │
│             │         │             │
│ Space: Prod │         │ Space: Dev  │
│ Room: Web   │         │ Room: API   │
└─────────────┘         └─────────────┘
```

## Implementation Plan

### Phase 1: Create SharedSpaceRoomData Context

**Goal**: Extract data fetching logic into a shared provider

1. **Create `SharedSpaceRoomDataContext.jsx`**
   - Fetch spaces on mount
   - Cache rooms per space (lazy load)
   - Provide shared data to consumers
   - No selection state (that's per-tab)

2. **API Methods**:
   ```javascript
   {
     spaces: Space[],
     getRoomsForSpace: (spaceId: string) => Promise<Room[]>,
     loading: boolean,
     error: Error | null,
     refetch: () => void,
   }
   ```

### Phase 2: Create TabContext Provider

**Goal**: Create per-tab context wrapper

1. **Create `TabContext.jsx`**
   - Wraps tab content
   - Receives tab context data as props
   - Provides TabContext to children
   - Manages space/room selection for this tab

2. **Component Structure**:
   ```jsx
   <TabContextProvider tabId={tab.id} initialContext={tab.context}>
     {/* Tab content */}
   </TabContextProvider>
   ```

3. **API Methods**:
   ```javascript
   {
     // Current tab ID
     tabId: string,

     // Space/Room
     selectedSpace: Space | null,
     selectedRoom: Room | null,
     rooms: Room[],
     changeSpace: (space: Space) => void,
     changeRoom: (room: Room) => void,

     // Custom Context (Future)
     customContext: Record<string, any>,
     setCustomContext: (key: string, value: any) => void,
   }
   ```

### Phase 3: Update Tab Data Structure

**Goal**: Add context data to tabs

1. **Update `TabManagerContext.jsx`**
   - Add `context` field to Tab interface
   - Initialize context when creating tabs
   - Update context when tab context changes
   - Persist context to localStorage

2. **Tab Context Updates**:
   ```javascript
   // In TabManagerContext
   updateTabContext: (tabId: string, context: Partial<TabContext>) => void
   ```

### Phase 4: Integrate TabContext with Tab Rendering

**Goal**: Wrap each tab's content with TabContext

1. **Update `TabView.jsx` or `Home.jsx`**
   - Wrap active tab content with `TabContextProvider`
   - Pass tab's context data
   - Handle context updates

2. **Example**:
   ```jsx
   <TabContextProvider
     tabId={activeTab.id}
     initialContext={activeTab.context}
     onContextChange={(context) => updateTabContext(activeTab.id, context)}
   >
     <TileView tile={activeTab.rootTile} />
   </TabContextProvider>
   ```

### Phase 5: Remove Global SpaceRoomContext

**Goal**: Remove old global context

1. **Remove from `MainLayout.jsx`**
   - Remove `SpaceRoomProvider` wrapper
   - Add `SharedSpaceRoomDataProvider` instead

2. **Update Context Hierarchy**:
   ```jsx
   <CommandProvider>
     <TabManagerProvider>
       <SharedSpaceRoomDataProvider>
         {/* Rest of app */}
       </SharedSpaceRoomDataProvider>
     </TabManagerProvider>
   </CommandProvider>
   ```

### Phase 6: Update Terminal Integration

**Goal**: Terminal reads context from active tab

1. **Update `TerminalEmulator.jsx`**
   - Remove `useSpaceRoom()` hook
   - Use `useTabContext()` hook instead
   - Read space/room from active tab's context
   - Navigation commands update active tab's context

2. **Changes**:
   ```javascript
   // OLD
   const { selectedSpace, selectedRoom, changeSpace, changeRoom } = useSpaceRoom();

   // NEW
   const { selectedSpace, selectedRoom, changeSpace, changeRoom } = useTabContext();
   ```

3. **Shell Prompt**:
   - Display space/room from active tab
   - Update only when active tab changes

### Phase 7: Update SpaceRoomSelector (Mobile)

**Goal**: Mobile UI uses active tab's context

1. **Update `SpaceRoomSelector.jsx`**
   - Use `useTabContext()` instead of `useSpaceRoom()`
   - Changes affect only active tab

### Phase 8: Update Command Execution

**Goal**: Commands execute with tab's context

1. **Update Command Execution Flow**
   - Commands read context from their tab
   - Context passed to command handlers
   - Each tile (Phase 3) inherits tab's context

### Phase 9: Add Context Persistence

**Goal**: Save and restore tab contexts

1. **Update localStorage Logic**
   - Save tab context with tab data
   - Restore context on app load
   - Handle missing/invalid context gracefully

2. **Storage Structure**:
   ```javascript
   {
     tabs: [
       {
         id: 'tab_123',
         title: 'Production',
         context: {
           spaceRoom: {
             selectedSpaceId: 'space_prod',
             selectedRoomId: 'room_web',
           },
           customContext: {},
         },
         rootTile: { /* ... */ },
       },
     ],
   }
   ```

### Phase 10: Add Context Management UI

**Goal**: UI to manage tab context

1. **Tab Context Indicator**
   - Show current space/room in tab (badge, tooltip, or subtitle)
   - Visual indicator of tab's context

2. **Context Commands**
   - `context` - Show current tab's context
   - `context set <key> <value>` - Set custom context (future)
   - `context clear` - Clear custom context (future)

3. **Visual Examples**:
   ```
   Tab Bar:
   [Production (space-prod/web-room)] [Development (space-dev/api-room)]

   Or with badges:
   [Production 🟢] [Development 🔵]
   ```

### Phase 11: Testing

**Goal**: Comprehensive testing of context isolation

1. **Test Scenarios**:
   - ✅ Create multiple tabs with different contexts
   - ✅ Switch between tabs - context persists
   - ✅ Change space/room in one tab - others unaffected
   - ✅ Navigate with `cd` command - only affects current tab
   - ✅ Terminal prompt shows correct context for active tab
   - ✅ Persistence: Reload app - contexts restored
   - ✅ Mobile: SpaceRoomSelector works with tab context

### Phase 12: Documentation

**Goal**: Update all documentation

1. **Update Files**:
   - `TILING_AND_TABS_ARCHITECTURE.md` - Add context section
   - `README.md` - Document tab context feature
   - Code comments in new files

## Technical Decisions

### Decision 1: Two-Layer Architecture
**Decision**: Use SharedSpaceRoomData + TabContext (two layers)
**Rationale**:
- **Performance**: Avoid redundant API calls
- **Efficiency**: Share space/room data across tabs
- **Isolation**: Each tab has independent selection
- **Scalability**: Easy to add more tabs without performance hit

**Alternatives Considered**:
- ❌ Per-tab SpaceRoomContext instances: Too many API calls
- ❌ Single global context: No tab isolation
- ✅ Hybrid approach: Best of both worlds

### Decision 2: Context Storage in Tab Data
**Decision**: Store context as part of tab data structure
**Rationale**:
- **Simplicity**: One source of truth (TabManagerContext)
- **Persistence**: Easy to save/restore with tabs
- **Consistency**: Context lifecycle tied to tab lifecycle

### Decision 3: TabContext as Wrapper Component
**Decision**: TabContext wraps tab content, not individual components
**Rationale**:
- **Scoping**: Clear context boundaries
- **Performance**: Single provider per tab
- **Flexibility**: Easy to add more context data

### Decision 4: Backward Compatibility
**Decision**: Maintain similar API to old SpaceRoomContext
**Rationale**:
- **Migration**: Easier to update existing code
- **Familiarity**: Developers know the API
- **Safety**: Less chance of breaking changes

## Migration Strategy

### Step-by-Step Migration

1. **Add new contexts alongside old**
   - Don't remove SpaceRoomContext yet
   - Add SharedSpaceRoomData and TabContext
   - Test in isolation

2. **Update components one by one**
   - Start with Terminal
   - Then SpaceRoomSelector
   - Then other consumers

3. **Remove old context**
   - Once all components migrated
   - Remove SpaceRoomContext from MainLayout
   - Clean up old code

### Rollback Plan

If issues arise:
1. Keep old SpaceRoomContext code in git history
2. Revert commits in order
3. Document issues for future attempt

## Future Enhancements

### 1. Custom Context Variables
Allow users to set custom context per tab:
```bash
context set environment production
context set region us-east-1
```

Commands can then use these variables:
```bash
query "SELECT * FROM metrics WHERE env=${environment}"
```

### 2. Context Templates
Predefined context templates:
```bash
context load production-template
# Sets: space=prod, room=web, environment=production
```

### 3. Context Sharing
Share context between tabs:
```bash
context copy 1 2  # Copy context from tab 1 to tab 2
```

### 4. Context History
Track context changes per tab:
```bash
context history  # Show context change history for current tab
```

## API Reference

### SharedSpaceRoomData Context

```typescript
interface SharedSpaceRoomDataContext {
  // Data
  spaces: Space[];
  loading: boolean;
  error: Error | null;

  // Methods
  getRoomsForSpace: (spaceId: string) => Promise<Room[]>;
  refetch: () => void;
}

// Hook
const useSharedSpaceRoomData = () => SharedSpaceRoomDataContext;
```

### TabContext

```typescript
interface TabContext {
  // Tab ID
  tabId: string;

  // Space/Room
  selectedSpace: Space | null;
  selectedRoom: Room | null;
  rooms: Room[];
  changeSpace: (space: Space) => void;
  changeRoom: (room: Room) => void;

  // Custom Context (Future)
  customContext: Record<string, any>;
  setCustomContext: (key: string, value: any) => void;
  getCustomContext: (key: string) => any;
  clearCustomContext: () => void;
}

// Hook
const useTabContext = () => TabContext;
```

### TabManagerContext (Updated)

```typescript
interface Tab {
  id: string;
  title: string;
  createdAt: number;

  // NEW: Context data
  context: {
    spaceRoom: {
      selectedSpaceId: string | null;
      selectedRoomId: string | null;
    };
    customContext: Record<string, any>;
  };

  rootTile: Tile;
}

interface TabManagerContext {
  // ... existing methods ...

  // NEW: Context management
  updateTabContext: (tabId: string, context: Partial<Tab['context']>) => void;
  getTabContext: (tabId: string) => Tab['context'];
}
```

## Example Usage

### Scenario 1: Multiple Environments

```bash
# Create production tab
tab Production
cd space-prod web-room
echo "Production Dashboard"

# Create staging tab
tab Staging
cd space-staging api-room
echo "Staging Dashboard"

# Switch between tabs - each maintains its context
tab 1  # Shows prod context in prompt
tab 2  # Shows staging context in prompt
```

### Scenario 2: Custom Context (Future)

```bash
# Set custom context
context set environment production
context set region us-east-1

# Use in commands
query "metrics WHERE env=${environment} AND region=${region}"
```

## Success Criteria

- ✅ Each tab has independent space/room selection
- ✅ Terminal prompt shows active tab's context
- ✅ Navigation commands only affect active tab
- ✅ Context persists across tab switches
- ✅ Context persists across app restarts
- ✅ No redundant API calls (shared data cache)
- ✅ Mobile SpaceRoomSelector works with tab context
- ✅ Performance: No noticeable slowdown
- ✅ UX: Clear and intuitive

## Conclusion

Moving SpaceRoomContext to the tab level is a significant architectural improvement that provides better isolation, flexibility, and user experience. The two-layer approach (SharedSpaceRoomData + TabContext) balances performance with functionality, and the design is future-proof for additional context features.

The implementation will be done in phases to minimize risk and allow for testing at each step. The migration strategy ensures we can roll back if needed, and the API design maintains familiarity while adding new capabilities.

---

**Status**: Design Complete ✅
**Next Step**: Begin Phase 1 - Create SharedSpaceRoomData Context

