# Echo Command Implementation Example

## Overview

This document demonstrates how to implement the "echo" command as a complete example of how CommandContext integrates with your CLI application.

## Complete Flow

### 1. Command Type Registration ✅

The `echo` command is already registered in `src/utils/commandTypes.js`:

```javascript
COMMAND_TYPES.ECHO = 'echo'

COMMAND_METADATA[COMMAND_TYPES.ECHO] = {
  name: 'echo',
  category: COMMAND_CATEGORIES.SYSTEM,
  description: 'Print text to the screen',
  usage: 'echo <text>',
  examples: [
    'echo hello world',
    'echo "Hello, Netdata!"',
    'echo System is running'
  ],
  handledBy: 'CommandContext'
}
```

### 2. User Types Command in Terminal

**User input:** `echo hello world`

### 3. TerminalEmulator Handles Input

```javascript
// src/components/TerminalEmulator.jsx
import { useCommand } from '../contexts/CommandContext';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import { parseCommand, isNavigationCommand } from '../utils/commandParser';

function TerminalEmulator() {
  const { executeCommand } = useCommand();
  const { changeSpace, changeRoom, spaces, rooms } = useSpaceRoom();

  const handleCommand = (input) => {
    // Parse the command string
    const command = parseCommand(input);
    // command = {
    //   id: 'cmd_1234567890_abc123',
    //   type: 'echo',
    //   raw: 'echo hello world',
    //   name: 'echo',
    //   args: {
    //     options: {},
    //     positional: ['hello', 'world']
    //   },
    //   timestamp: 1234567890,
    //   status: 'pending'
    // }

    // Check if it's a navigation command
    if (isNavigationCommand(command)) {
      handleNavigation(command);
      return;
    }

    // It's a visualization/action command - execute with CommandContext
    executeCommand(command);
  };

  const handleNavigation = (command) => {
    switch (command.type) {
      case 'cd':
        const [spaceName, roomName] = command.args.positional;
        const space = spaces.find(s => s.name === spaceName);
        if (space) {
          changeSpace(space);
          if (roomName) {
            const room = rooms.find(r => r.name === roomName);
            if (room) changeRoom(room);
          }
        }
        break;
      // Handle other navigation commands...
    }
  };

  return (
    <div>
      {/* Your terminal UI */}
      <input onSubmit={handleCommand} />
    </div>
  );
}
```

### 4. CommandContext Receives and Stores Command

When `executeCommand(command)` is called:

```javascript
// Inside CommandContext
const executeCommand = (command) => {
  // Parse if string
  const parsedCommand = typeof command === 'string'
    ? parseCommand(command)
    : command;

  // Validate
  const validation = validateCommand(parsedCommand);

  // Set as current command
  setCurrentCommand(parsedCommand);

  // Add to history
  setCommandHistory(prev => [...prev, parsedCommand]);

  return parsedCommand;
};
```

### 5. Home Page Watches and Routes to Echo Component

```javascript
// src/pages/Home.jsx
import React from 'react';
import { useCommand } from '../contexts/CommandContext';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import Echo from '../components/Echo';
import ChartVisualization from '../components/ChartVisualization';
import AlertsVisualization from '../components/AlertsVisualization';
// ... other imports

function Home() {
  const { currentCommand, clearCommand } = useCommand();
  const { selectedSpace, selectedRoom } = useSpaceRoom();

  // Route to appropriate visualization based on command type
  const renderVisualization = () => {
    // No command - show default dashboard
    if (!currentCommand) {
      return <DefaultDashboard space={selectedSpace} room={selectedRoom} />;
    }

    // Route based on command type
    switch (currentCommand.type) {
      case 'echo':
        return <Echo command={currentCommand} />;

      case 'chart':
        return (
          <ChartVisualization
            command={currentCommand}
            space={selectedSpace}
            room={selectedRoom}
          />
        );

      case 'alerts':
        return (
          <AlertsVisualization
            command={currentCommand}
            space={selectedSpace}
            room={selectedRoom}
          />
        );

      case 'nodes':
        return <NodesVisualization command={currentCommand} />;

      case 'metrics':
        return <MetricsVisualization command={currentCommand} />;

      default:
        return <DefaultDashboard space={selectedSpace} room={selectedRoom} />;
    }
  };

  return (
    <div className={styles.homePage}>
      <Header space={selectedSpace} room={selectedRoom} />

      <div className={styles.content}>
        {renderVisualization()}
      </div>

      {/* Optional: Close button overlay */}
      {currentCommand && (
        <button
          className={styles.closeButton}
          onClick={clearCommand}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default Home;
```

### 6. Echo Component Receives Command and Displays

```javascript
// src/components/Echo.jsx (already created)
import React, { useEffect } from 'react';
import { useCommand } from '../contexts/CommandContext';
import styles from './Echo.module.css';

const Echo = ({ command }) => {
  const { setOutput } = useCommand();

  useEffect(() => {
    // Mark command as complete
    if (command) {
      const text = command.args.positional.join(' ');
      setOutput({ text, timestamp: Date.now() });
    }
  }, [command, setOutput]);

  // Extract text from command arguments
  const text = command?.args?.positional?.join(' ') || '';

  return (
    <div className={styles.echoContainer}>
      <div className={styles.echoOutput}>
        <span className={styles.echoPrompt}>$</span>
        <span className={styles.echoText}>{text}</span>
      </div>

      <div className={styles.echoMeta}>
        <span className={styles.echoCommand}>
          Command: {command?.raw}
        </span>
        <span className={styles.echoTimestamp}>
          {new Date(command?.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default Echo;
```

## What You Were Missing

Your understanding was **almost perfect**! Here are the key clarifications:

### ✅ What You Got Right:
1. Echo component receives the command as a prop
2. Home page evaluates `currentCommand` and renders `<Echo command={currentCommand} />`
3. The component parses the arguments and displays the text

### 📝 What to Note:

1. **Command Parsing Happens in Terminal**
   - The TerminalEmulator calls `parseCommand()` first
   - Then passes the parsed command to `executeCommand()`

2. **CommandContext Stores the Command**
   - `executeCommand()` stores the command in `currentCommand` state
   - Home page watches `currentCommand` from the context

3. **Props Are Passed from Home to Component**
   ```javascript
   <Echo command={currentCommand} />
   ```

4. **Optional: Mark Command as Complete**
   ```javascript
   const { setOutput } = useCommand();
   setOutput({ text: 'hello world', timestamp: Date.now() });
   ```
   This marks the command as successfully executed.

5. **Clearing Commands**
   - Call `clearCommand()` when you want to dismiss the visualization
   - This resets `currentCommand` to null
   - Home page then shows the default dashboard

## Complete Data Flow Diagram

```
User Types: "echo hello world"
         ↓
TerminalEmulator receives input
         ↓
parseCommand() → {
  type: 'echo',
  args: { positional: ['hello', 'world'] }
}
         ↓
executeCommand(command)
         ↓
CommandContext stores in currentCommand
         ↓
Home page watches currentCommand
         ↓
currentCommand.type === 'echo' ?
         ↓
<Echo command={currentCommand} />
         ↓
Echo extracts: command.args.positional.join(' ')
         ↓
Displays: "hello world"
```

## Testing the Flow

### 1. Type in Terminal:
```bash
echo hello world
```

### 2. Command Object Created:
```javascript
{
  id: 'cmd_1234567890_abc123',
  type: 'echo',
  raw: 'echo hello world',
  name: 'echo',
  args: {
    options: {},
    positional: ['hello', 'world']
  },
  timestamp: 1234567890,
  status: 'pending'
}
```

### 3. Home Page Renders:
```jsx
<Echo command={{
  type: 'echo',
  args: { positional: ['hello', 'world'] },
  raw: 'echo hello world',
  timestamp: 1234567890
}} />
```

### 4. Echo Displays:
```
┌─────────────────────────────┐
│ $ hello world               │
├─────────────────────────────┤
│ Command: echo hello world   │
│ 10:30:45 AM                 │
└─────────────────────────────┘
```

## Next Steps

Now you can implement other visualization commands the same way:

1. **Add command type** to `commandTypes.js`
2. **Create component** (e.g., `ChartVisualization.jsx`)
3. **Add route** in Home page's switch statement
4. **Component receives** command prop
5. **Extract data** from `command.args`
6. **Render visualization**
7. **Call setOutput()** when done

## Summary

Your understanding was **correct**! The flow is:

1. ✅ Terminal → `executeCommand()`
2. ✅ CommandContext → stores in `currentCommand`
3. ✅ Home → watches `currentCommand`, routes to component
4. ✅ Echo → receives `command` prop, extracts args, displays

The key insight is that CommandContext acts as the **bridge** between the Terminal (input) and Home page (visualization routing).

