# Terminal Navigation Architecture

## Overview

This document describes the architecture for terminal-based navigation in Netdata AI, where the Terminal Emulator acts as the primary navigation interface and the Home page dynamically displays content based on the terminal's current "location".

## Conceptual Model

Think of the app as a **file system hierarchy**:

```
/ (root)
├── space-1/
│   ├── room-1/
│   │   ├── overview/
│   │   ├── nodes/
│   │   ├── alerts/
│   │   ├── metrics/
│   │   └── reports/
│   └── room-2/
│       ├── overview/
│       └── ...
└── space-2/
    └── ...
```

- **Spaces** = Root directories
- **Rooms** = Subdirectories
- **Views** = Content types (overview, nodes, alerts, metrics, reports)
- **Terminal** = Shell that navigates this structure
- **Home Page** = Visual representation of current location

## Communication Pattern

### Current Implementation ✅

```
Terminal Emulator → SpaceRoomContext → Home Page
     (writes)            (state)          (reads)
```

**What's already working:**
- Terminal changes space/room via context methods
- Home page reads space/room from context
- Shared state ensures synchronization

### Extended Implementation 🎯

```
Terminal Commands → Navigation Context → Home Page Components
   cd nodes            currentView         <NodesView />
   cd alerts           currentPath         <AlertsView />
   cd metrics          breadcrumbs         <MetricsView />
```

## Implementation Strategy

### 1. Extend SpaceRoomContext to NavigationContext

Add navigation state to track the full hierarchy:

```javascript
// Extended context state
{
  // Existing
  spaces: [],
  selectedSpace: {},
  selectedRoom: {},
  rooms: [],

  // New navigation state
  currentView: 'overview', // 'overview' | 'nodes' | 'alerts' | 'metrics' | 'reports'
  currentPath: '/space-name/room-name/overview',
  navigationHistory: [],

  // New methods
  navigateTo: (view) => {},
  goBack: () => {},
  getCurrentContext: () => {}
}
```

### 2. Terminal Command System

Implement terminal commands that update the navigation context:

```javascript
// Terminal commands
const commands = {
  'cd overview': () => navigateTo('overview'),
  'cd nodes': () => navigateTo('nodes'),
  'cd alerts': () => navigateTo('alerts'),
  'cd metrics': () => navigateTo('metrics'),
  'cd reports': () => navigateTo('reports'),
  'ls': () => listAvailableViews(),
  'pwd': () => showCurrentPath(),
  'cd ..': () => goBack()
};
```

### 3. Home Page Dynamic Rendering

The Home page becomes a router that renders different views based on context:

```javascript
const Home = () => {
  const { currentView, selectedSpace, selectedRoom } = useNavigation();

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <OverviewView space={selectedSpace} room={selectedRoom} />;
      case 'nodes':
        return <NodesView space={selectedSpace} room={selectedRoom} />;
      case 'alerts':
        return <AlertsView space={selectedSpace} room={selectedRoom} />;
      case 'metrics':
        return <MetricsView space={selectedSpace} room={selectedRoom} />;
      case 'reports':
        return <ReportsView space={selectedSpace} room={selectedRoom} />;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div className={styles.homePage}>
      <Breadcrumbs />
      {renderView()}
    </div>
  );
};
```

## Detailed Implementation Plan

### Phase 1: Extend Context (Foundation)

**File:** `src/contexts/NavigationContext.jsx`

```javascript
import React, { createContext, useContext, useState, useCallback } from 'react';
import { useSpaceRoom } from './SpaceRoomContext';

const NavigationContext = createContext(null);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

export const NavigationProvider = ({ children }) => {
  const spaceRoomContext = useSpaceRoom();
  const [currentView, setCurrentView] = useState('overview');
  const [navigationHistory, setNavigationHistory] = useState([]);

  // Compute current path
  const currentPath = useCallback(() => {
    const { selectedSpace, selectedRoom } = spaceRoomContext;
    if (!selectedSpace) return '/';
    if (!selectedRoom) return `/${selectedSpace.name}`;
    return `/${selectedSpace.name}/${selectedRoom.name}/${currentView}`;
  }, [spaceRoomContext, currentView]);

  // Navigate to a view
  const navigateTo = useCallback((view) => {
    setNavigationHistory(prev => [...prev, currentView]);
    setCurrentView(view);
  }, [currentView]);

  // Go back in history
  const goBack = useCallback(() => {
    if (navigationHistory.length > 0) {
      const previous = navigationHistory[navigationHistory.length - 1];
      setCurrentView(previous);
      setNavigationHistory(prev => prev.slice(0, -1));
    }
  }, [navigationHistory]);

  // Get available views for current context
  const getAvailableViews = useCallback(() => {
    const { selectedRoom } = spaceRoomContext;
    if (!selectedRoom) return ['overview'];

    return ['overview', 'nodes', 'alerts', 'metrics', 'reports'];
  }, [spaceRoomContext]);

  // Reset view when space/room changes
  React.useEffect(() => {
    setCurrentView('overview');
    setNavigationHistory([]);
  }, [spaceRoomContext.selectedSpace?.id, spaceRoomContext.selectedRoom?.id]);

  const value = {
    ...spaceRoomContext,
    currentView,
    currentPath: currentPath(),
    navigationHistory,
    navigateTo,
    goBack,
    getAvailableViews
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
```

### Phase 2: Update Terminal Emulator

**File:** `src/components/TerminalEmulator/TerminalEmulator.jsx`

Add command input and processing:

```javascript
import { useNavigation } from '../../contexts/NavigationContext';

const TerminalEmulator = ({ userInfo }) => {
  const navigation = useNavigation();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const inputRef = useRef(null);

  const handleCommand = (cmd) => {
    const trimmed = cmd.trim().toLowerCase();

    switch (true) {
      case trimmed === 'ls':
        const views = navigation.getAvailableViews();
        setOutput([...output, `$ ${cmd}`, views.join('  ')]);
        break;

      case trimmed === 'pwd':
        setOutput([...output, `$ ${cmd}`, navigation.currentPath]);
        break;

      case trimmed.startsWith('cd '):
        const target = trimmed.substring(3);
        if (navigation.getAvailableViews().includes(target)) {
          navigation.navigateTo(target);
          setOutput([...output, `$ ${cmd}`]);
        } else {
          setOutput([...output, `$ ${cmd}`, `cd: no such view: ${target}`]);
        }
        break;

      case trimmed === 'cd ..':
        navigation.goBack();
        setOutput([...output, `$ ${cmd}`]);
        break;

      default:
        setOutput([...output, `$ ${cmd}`, `command not found: ${trimmed}`]);
    }

    setCommand('');
  };

  // ... rest of component
};
```

### Phase 3: Update Home Page

**File:** `src/pages/Home.jsx`

```javascript
import { useNavigation } from '../contexts/NavigationContext';
import OverviewView from '../components/views/OverviewView';
import NodesView from '../components/views/NodesView';
import AlertsView from '../components/views/AlertsView';
import MetricsView from '../components/views/MetricsView';
import ReportsView from '../components/views/ReportsView';

const Home = () => {
  const { userInfo } = useOutletContext();
  const {
    currentView,
    currentPath,
    selectedSpace,
    selectedRoom,
    loading
  } = useNavigation();

  const renderView = () => {
    const props = { space: selectedSpace, room: selectedRoom };

    switch (currentView) {
      case 'nodes':
        return <NodesView {...props} />;
      case 'alerts':
        return <AlertsView {...props} />;
      case 'metrics':
        return <MetricsView {...props} />;
      case 'reports':
        return <ReportsView {...props} />;
      case 'overview':
      default:
        return <OverviewView {...props} />;
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className={styles.homePage}>
      {/* Breadcrumbs showing current path */}
      <div className={styles.breadcrumbs}>
        <span className={styles.path}>{currentPath}</span>
      </div>

      {/* Welcome section (only on overview) */}
      {currentView === 'overview' && (
        <div className={styles.welcomeSection}>
          <h1>Welcome to Netdata AI</h1>
          {userInfo && (
            <p className={styles.greeting}>
              Hello, <span className={styles.userName}>{userInfo.name}</span>
            </p>
          )}
        </div>
      )}

      {/* Dynamic content based on current view */}
      <div className={styles.viewContent}>
        {renderView()}
      </div>
    </div>
  );
};
```

### Phase 4: Create View Components

**Directory structure:**
```
src/components/views/
├── OverviewView.jsx
├── NodesView.jsx
├── AlertsView.jsx
├── MetricsView.jsx
└── ReportsView.jsx
```

**Example:** `src/components/views/NodesView.jsx`

```javascript
const NodesView = ({ space, room }) => {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch nodes for current room
    fetchNodes(space.id, room.id).then(setNodes);
  }, [space.id, room.id]);

  return (
    <div className={styles.nodesView}>
      <h2>Nodes in {room.name}</h2>
      <div className={styles.nodesList}>
        {nodes.map(node => (
          <NodeCard key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
};
```

## Key Benefits of This Architecture

### 1. **Separation of Concerns**
- Terminal handles user input and commands
- Context manages navigation state
- Home page handles rendering
- View components focus on specific content types

### 2. **Scalability**
- Easy to add new views (just add a new case)
- Easy to add new commands (just extend command handler)
- Context can be extended without breaking existing code

### 3. **Testability**
- Each component has clear responsibilities
- Context can be tested independently
- Commands can be unit tested

### 4. **User Experience**
- Terminal provides power-user interface
- Home page provides visual feedback
- Navigation state is always synchronized
- History allows going back

### 5. **Future Extensibility**
- Can add nested navigation (e.g., `/space/room/nodes/node-123`)
- Can add command autocomplete
- Can add command history (up/down arrows)
- Can add shortcuts and aliases

## Mobile Considerations

For mobile users who won't use the terminal:

### Option 1: Tab Navigation
Add tabs at the top of the Home page:
```javascript
<div className={styles.viewTabs}>
  <button onClick={() => navigateTo('overview')}>Overview</button>
  <button onClick={() => navigateTo('nodes')}>Nodes</button>
  <button onClick={() => navigateTo('alerts')}>Alerts</button>
  <button onClick={() => navigateTo('metrics')}>Metrics</button>
</div>
```

### Option 2: Bottom Navigation Bar
```css
@media (max-width: 768px) {
  .bottomNav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-around;
  }
}
```

### Option 3: Hamburger Menu
Use SpaceRoomSelector pattern but extend it with view navigation.

## Implementation Checklist

- [ ] Create `NavigationContext.jsx`
- [ ] Update `MainLayout.jsx` to wrap with `NavigationProvider`
- [ ] Add command input to `TerminalEmulator.jsx`
- [ ] Implement command handler in Terminal
- [ ] Update `Home.jsx` to use navigation context
- [ ] Create view component directory structure
- [ ] Implement `OverviewView.jsx` (migrate current Home content)
- [ ] Implement `NodesView.jsx`
- [ ] Implement `AlertsView.jsx`
- [ ] Implement `MetricsView.jsx`
- [ ] Implement `ReportsView.jsx`
- [ ] Add breadcrumbs component
- [ ] Add mobile navigation (tabs or bottom nav)
- [ ] Add command history (up/down arrows)
- [ ] Add command autocomplete
- [ ] Add keyboard shortcuts

## Example User Flows

### Desktop User (Terminal-driven)

```bash
# User starts at overview
user@netdata /production/web-servers/overview % ls
overview  nodes  alerts  metrics  reports

# Navigate to nodes
user@netdata /production/web-servers/overview % cd nodes
user@netdata /production/web-servers/nodes %

# Home page now shows NodesView component with node list

# Check current location
user@netdata /production/web-servers/nodes % pwd
/production/web-servers/nodes

# Go back
user@netdata /production/web-servers/nodes % cd ..
user@netdata /production/web-servers/overview %
```

### Mobile User (Touch-driven)

1. Opens app → sees Overview
2. Taps "Nodes" tab at bottom
3. Sees node list
4. Taps back button → returns to Overview

## Future Enhancements

### 1. Deep Navigation
```bash
cd nodes/web-01  # Navigate to specific node
cd alerts/critical  # Filter alerts by severity
```

### 2. Command Aliases
```bash
alias n='cd nodes'
alias a='cd alerts'
```

### 3. Search
```bash
find "cpu"  # Search across all views
```

### 4. Filters
```bash
cd alerts --severity=critical
cd nodes --status=offline
```

### 5. Actions
```bash
ack alert-123  # Acknowledge alert
restart node-456  # Restart node
```

## Conclusion

This architecture provides a clean, scalable solution for terminal-based navigation while maintaining excellent UX on both desktop and mobile. The key insight is that **the context acts as a router**, translating terminal commands into navigation state that the Home page can render appropriately.

The beauty of this approach is that it's already partially implemented in your app—you just need to extend it with the `currentView` concept and create the view components!

