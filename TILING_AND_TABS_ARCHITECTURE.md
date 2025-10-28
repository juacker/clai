# Tiling and Tabs Architecture (Revised)

## Overview

This document describes the architecture for implementing tiling and tabs functionality in Netdata AI, allowing users to visualize multiple commands simultaneously. **Tabs contain tile layouts**, not the other way around.

## Goals

1. **Multiple Workspaces**: Each tab is a complete workspace/dashboard
2. **Flexible Layouts**: Within each tab, support tiling (split views)
3. **Terminal-Driven**: Create and manage tabs/tiles through terminal commands
4. **Intuitive Navigation**: Tab switching = complete context switch
5. **Responsive**: Tabs work great on mobile, splits on desktop only
6. **Maintain Existing Architecture**: Keep CommandContext working, add new layer on top

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MainLayout                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │              TerminalEmulator                     │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │                   Home Page                       │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │      TabManagerContext (Top Level)         │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  Tab Bar: [Prod][Dev][Compare]       │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │    Active Tab Content                 │  │  │  │
│  │  │  │  ┌─────────────┬─────────────────┐   │  │  │  │
│  │  │  │  │   Tile 1    │     Tile 2      │   │  │  │  │
│  │  │  │  │  (Echo)     │   (Chart)       │   │  │  │  │
│  │  │  │  └─────────────┴─────────────────┘   │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Tab = Workspace

A **Tab** is a complete workspace containing:
- A name/title
- A tile layout (can be single tile or splits)
- Independent state

**Tab Structure:**
```javascript
{
  id: 'tab_1234567890',
  title: 'Production Dashboard',
  createdAt: 1234567890,
  rootTile: {
    // Tile tree structure (see below)
  }
}
```

### 2. Tile = View Container

A **Tile** is a container within a tab that can:
- Hold a single command visualization
- Be split into child tiles (horizontal/vertical)

**Tile Structure:**
```javascript
{
  id: 'tile_1234567890',
  type: 'leaf' | 'split',

  // For leaf tiles (contains command):
  commandId: 'cmd_123',  // Reference to command in CommandContext

  // For split tiles (contains children):
  direction: 'horizontal' | 'vertical',
  children: [
    { /* Tile 1 */ },
    { /* Tile 2 */ }
  ],
  sizes: [50, 50]  // Percentage sizes for children
}
```

### 3. Hierarchy

```
TabManager (Top Level)
├── Tab 1: "Production"
│   └── Root Tile (split: horizontal)
│       ├── Tile A (leaf): CPU Chart
│       └── Tile B (split: vertical)
│           ├── Tile B1 (leaf): Memory Chart
│           └── Tile B2 (leaf): Alerts
├── Tab 2: "Development"
│   └── Root Tile (leaf): Single Echo
└── Tab 3: "Comparison"
    └── Root Tile (split: horizontal)
        ├── Tile A (leaf): Prod Metrics
        └── Tile B (leaf): Staging Metrics
```

## New Context: TabManagerContext

### State

```javascript
{
  // All tabs
  tabs: Tab[],

  // Active tab
  activeTabId: string,

  // Active tile within active tab
  activeTileId: string,

  // Tab history (for undo)
  tabHistory: Tab[],
  historyIndex: number,

  // UI settings
  showTabBar: boolean,
  minTileSize: number,
}
```

### Methods

```javascript
// Tab Management
createTab(title?)                    // Create new tab
closeTab(tabId)                      // Close a tab
setActiveTab(tabId)                  // Switch to tab
renameTab(tabId, newTitle)           // Rename tab
moveTab(fromIndex, toIndex)          // Reorder tabs

// Tile Management (within active tab)
splitTile(tileId, direction)         // Split a tile
closeTile(tileId)                    // Close a tile and merge
setActiveTile(tileId)                // Set active tile
resizeTile(tileId, size)             // Resize a tile

// Command Routing
executeCommandInTile(tileId, command)        // Execute in specific tile
executeCommandInActiveTile(command)          // Execute in active tile
executeCommandInNewTab(command, title?)      // Execute in new tab
executeCommandInNewSplit(command, direction) // Execute in new split

// Layout Operations
resetTabLayout(tabId)                // Reset tab to single tile
duplicateTab(tabId)                  // Duplicate entire tab layout
```

## Terminal Commands

### Tab Management

```bash
# Create new tab
tab                    # Create empty tab
tab Production        # Create tab with title
tab echo hello        # Create tab and run command

# Switch tabs
tab 2                 # Switch to tab 2 (1-based index)
tab next              # Next tab
tab prev              # Previous tab

# Manage tabs
tab-close             # Close current tab
tab-close 2           # Close tab 2
tab-rename Production # Rename current tab
tab-list              # List all tabs
```

### Tile Management (Within Current Tab)

```bash
# Split current tile
split-v               # Split vertically
split-h               # Split horizontally
split-v echo hello    # Split and run command

# Navigate tiles
tile 2                # Focus tile 2 (within current tab)
tile next             # Next tile
tile prev             # Previous tile

# Manage tiles
tile-close            # Close current tile
tile-resize 60        # Resize to 60%
```

### Layout Commands

```bash
# Tab layouts
tab-reset             # Reset current tab to single tile
tab-duplicate         # Duplicate current tab

# Global
reset-all             # Close all tabs, reset to single tab
```

## Command Execution Flow

### Current Flow (Single Command)
```
User: "echo hello"
  ↓
TerminalEmulator.handleCommandExecution()
  ↓
CommandContext.executeCommand()
  ↓
Home.renderVisualization()
  ↓
<Echo command={currentCommand} />
```

### New Flow (With Tabs & Tiles)
```
User: "echo hello"
  ↓
TerminalEmulator.handleCommandExecution()
  ↓
Is it a tab/tile command? (tab, split-v, etc.)
  YES → TabManagerContext.handleLayoutCommand()
  NO  → CommandContext.executeCommand()
        ↓
        TabManagerContext.addCommandToActiveTile()
        ↓
        Home → TabView
        ↓
        Renders active tab with its tile layout
        ↓
        Each tile renders appropriate component
```

## Data Flow

```
┌──────────────────────┐
│  TerminalEmulator    │
└──────────┬───────────┘
           │
           ├─── Tab/Tile Command? (tab, split-v, etc.)
           │         ↓
           │    ┌────────────────────┐
           │    │  TabManagerContext │
           │    └────────────────────┘
           │
           └─── Visualization Command? (echo, chart, etc.)
                     ↓
              ┌─────────────────┐
              │ CommandContext  │
              └────────┬────────┘
                       │
                       ↓
              ┌─────────────────────────┐
              │ TabManagerContext       │
              │ .addCommandToActiveTile │
              └─────────────────────────┘
```

## Component Structure

### TabView Component

```jsx
<TabView>
  {/* Tab Bar */}
  <TabBar
    tabs={tabs}
    activeTabId={activeTabId}
    onTabClick={setActiveTab}
    onTabClose={closeTab}
    onTabCreate={createTab}
  />

  {/* Active Tab Content */}
  <TabContent>
    <TileView
      tile={activeTab.rootTile}
      activeTileId={activeTileId}
      onTileClick={setActiveTile}
    />
  </TabContent>
</TabView>
```

### TileView Component (Recursive)

```jsx
<TileView tile={tile}>
  {tile.type === 'split' ? (
    <SplitContainer direction={tile.direction}>
      <TileView tile={tile.children[0]} />
      <ResizeHandle />
      <TileView tile={tile.children[1]} />
    </SplitContainer>
  ) : (
    <TileContent
      tile={tile}
      isActive={tile.id === activeTileId}
      onClick={() => setActiveTile(tile.id)}
    >
      <CommandVisualization
        command={getCommand(tile.commandId)}
      />
    </TileContent>
  )}
</TileView>
```

### Home Page (Updated)

```jsx
function Home() {
  const { tabs, activeTabId, activeTileId } = useTabManager();
  const { getCommand } = useCommand();

  // If no tabs, show default dashboard
  if (tabs.length === 0) {
    return <DefaultDashboard />;
  }

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className={styles.homePage}>
      <TabView
        tabs={tabs}
        activeTab={activeTab}
        activeTileId={activeTileId}
      />
    </div>
  );
}
```

## Implementation Roadmap

### Phase 1: Foundation (Tab Management)
**Goal**: Set up tab system without tiling

1. ✅ **Create TabManagerContext**
   - Define tab data structure
   - Implement tab creation/deletion
   - Add active tab tracking
   - Single tile per tab (no splits yet)

2. ✅ **Create TabBar Component**
   - Render tabs horizontally
   - Active tab highlighting
   - Close button per tab
   - Add new tab button

3. ✅ **Create TabContent Component**
   - Render active tab's content
   - Single command visualization per tab
   - No splits yet

4. ✅ **Integrate with Home Page**
   - Replace single command with TabView
   - Maintain backward compatibility

5. ✅ **Test Basic Tabs**
   - Create multiple tabs
   - Switch between tabs
   - Close tabs
   - Commands in different tabs

### Phase 2: Terminal Commands (Tab Management)
**Goal**: Control tabs from terminal

1. ✅ **Add Tab Command Types**
   - Register tab, tab-close, tab-rename commands
   - Update commandParser

2. ✅ **Implement Tab Command Handlers**
   - Handle tab creation from terminal
   - Handle tab switching (tab 2, tab next, tab prev)
   - Handle tab closing and renaming

3. ✅ **Command Routing to Active Tab**
   - Route visualization commands to active tab
   - Each tab has its own command

4. ✅ **Test Terminal Integration**
   - Test: `echo hello` → shows in current tab
   - Test: `tab` → creates new tab
   - Test: `tab 2` → switches to tab 2

### Phase 3: Tiling (Within Tabs)
**Goal**: Add split views within each tab

1. ✅ **Add Tile Structure to Tabs**
   - Update tab to have rootTile
   - Define tile tree structure
   - Add activeTileId per tab

2. ✅ **Create TileView Component**
   - Recursive tile rendering
   - Split container with direction
   - Leaf tile with command

3. ✅ **Implement Split Commands**
   - Add split-v, split-h commands
   - Handle tile creation within active tab
   - Update active tile tracking

4. ✅ **Test Tiling**
   - Test: `split-v` → splits current tile
   - Test: `echo world` → shows in new tile
   - Test: Multiple splits in same tab

### Phase 4: Advanced Features
**Goal**: Polish and enhance

1. ✅ **Tile Resizing**
   - Add resize handles between tiles
   - Drag to resize
   - Resize command

2. ✅ **Layout History (Undo/Redo)**
   - Track tab layout changes
   - Implement undo/redo per tab
   - Keyboard shortcuts

3. ✅ **Tab Duplication**
   - Duplicate entire tab with layout
   - Copy command references

4. ✅ **Visual Polish**
   - Smooth tab transitions
   - Tile split animations
   - Active tile/tab indicators
   - Hover effects

### Phase 5: Mobile Optimization
**Goal**: Great mobile experience

1. ✅ **Mobile Tab Bar**
   - Horizontal scrolling tabs
   - Touch-friendly tab switching
   - Swipe gestures between tabs

2. ✅ **No Splits on Mobile**
   - Each tab shows single view
   - Split commands disabled on mobile
   - Clear messaging

3. ✅ **Mobile-Specific Commands**
   - Simplified command set
   - Touch-optimized controls

### Phase 6: Persistence & Polish
**Goal**: Save state and finalize

1. ✅ **Tab Persistence**
   - Save tabs to localStorage
   - Restore tabs on app start
   - Persist tile layouts per tab

2. ✅ **Keyboard Shortcuts**
   - Ctrl+T: New tab
   - Ctrl+W: Close tab
   - Ctrl+Tab: Next tab
   - Ctrl+Shift+Tab: Previous tab
   - Ctrl+1-9: Switch to tab N
   - Ctrl+Shift+V: Vertical split
   - Ctrl+Shift+H: Horizontal split

3. ✅ **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - Focus management

4. ✅ **Documentation**
   - Update ECHO_COMMAND_EXAMPLE.md
   - Create TILING_TUTORIAL.md
   - Help command

## Example Usage Scenarios

### Scenario 1: Multiple Workspaces

```bash
# Create production monitoring workspace
tab Production
echo Production Status
split-v
chart cpu.usage
split-h
chart memory.usage

# Create development workspace
tab Development
echo Dev Environment
split-v
alerts

# Switch between workspaces
tab 1  # Back to production
tab 2  # Back to development
```

Result:
```
[Production] [Development]
┌─────────────────────────────┐
│ Current: Production         │
├──────────────┬──────────────┤
│ Production   │ CPU Chart    │
│ Status       ├──────────────┤
│              │ Memory Chart │
└──────────────┴──────────────┘
```

### Scenario 2: Comparison Across Tabs

```bash
# Tab 1: Production metrics
tab Production
chart prod.cpu

# Tab 2: Staging metrics
tab Staging
chart staging.cpu

# Tab 3: Development metrics
tab Development
chart dev.cpu

# Quick switching
tab 1  # View production
tab 2  # View staging
tab 3  # View development
```

### Scenario 3: Complex Dashboard in Single Tab

```bash
tab Dashboard
chart cpu.usage
split-v
chart memory.usage
split-h
alerts critical
tile 1
split-h
chart network.traffic
```

Result:
```
[Dashboard]
┌──────────────┬──────────────┐
│ CPU Chart    │ Memory Chart │
│──────────────├──────────────┤
│ Network      │ Alerts       │
└──────────────┴──────────────┘
```

## Design Considerations

### Tab Behavior
- **First tab**: Created automatically on first command
- **Tab names**: Auto-generated or user-specified
- **Empty tabs**: Allowed (for future commands)
- **Max tabs**: No hard limit, but recommend < 10

### Tile Behavior (Within Tab)
- **Minimum tile size**: 200px width/height
- **Maximum splits**: Recommend 4-6 tiles per tab
- **Default split**: Vertical (side-by-side)
- **Active tile**: Receives new commands by default

### Mobile Behavior
- **Tabs**: Full support with swipe gestures
- **Tiles**: No splits, each tab = single view
- **Commands**: Split commands show error on mobile

### Visual Design
- **Tab bar**: Compact, scrollable, at top
- **Active tab**: Highlighted background
- **Tile borders**: Subtle, 1px
- **Active tile**: Brighter border
- **Resize handles**: Desktop only, appear on hover

### Performance
- **Lazy rendering**: Only render active tab content
- **Command caching**: Keep commands in CommandContext
- **Tile virtualization**: For many tiles

## Edge Cases

1. **Closing last tab**: Show default dashboard
2. **Closing last tile in tab**: Close the tab
3. **Switching tabs**: Preserve tile layout
4. **Mobile splits**: Show error message
5. **Deep nesting**: Warn after 3 levels
6. **Tab overflow**: Horizontal scroll
7. **Command in empty tab**: Create single tile
8. **Split single tile**: Create 50/50 split

## Success Metrics

- ✅ Can create tabs from terminal
- ✅ Can switch tabs easily
- ✅ Can split tiles within tabs
- ✅ Multiple commands visible in different tabs
- ✅ Layout persists per tab
- ✅ Works on mobile (tabs only)
- ✅ Intuitive for new users
- ✅ Smooth performance

## Comparison: Old vs New

### Old Design (Tiles contain tabs) ❌
```
Tile Layout
├── Tile 1 [Tab A][Tab B][Tab C]
├── Tile 2 [Tab D][Tab E]
└── Tile 3 [Tab F]

Problems:
- Confusing: Which tab in which tile?
- Hard to navigate: Need to remember tile+tab combo
- Doesn't match user expectations
- Complex state management
```

### New Design (Tabs contain tiles) ✅
```
[Tab 1: Prod] [Tab 2: Dev] [Tab 3: Compare]
Current: Tab 1
├── Tile A: CPU
├── Tile B: Memory
└── Tile C: Alerts

Benefits:
- Clear: Tab = complete workspace
- Easy navigation: Switch tabs = switch context
- Matches user expectations (browsers, IDEs)
- Simpler state management
- Mobile-friendly
```

## Conclusion

The revised architecture with **tabs containing tiles** provides a much more intuitive and powerful way to organize multiple visualizations. Each tab is a complete workspace with its own tile layout, making it easy to organize different monitoring contexts while maintaining the ability to view multiple commands simultaneously within each tab.

---

**Next Steps**: Begin Phase 1 implementation with TabManagerContext and TabBar component.

