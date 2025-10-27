# CommandContext Documentation

## Overview

The CommandContext provides a centralized system for managing CLI command execution in the Netdata AI application. It's designed to work alongside SpaceRoomContext to create a powerful "CLI with graph capabilities" interface.

## Architecture

### Context Separation

The application uses two separate contexts for different concerns:

- **SpaceRoomContext**: Manages navigation state (WHERE you are)
  - Space/Room selection
  - Persistent state with localStorage
  - Used by: SpaceRoomSelector, Terminal (for navigation), Header components

- **CommandContext**: Manages action execution (WHAT you want to do)
  - Command parsing and execution
  - Command history and output
  - Transient action state
  - Used by: Terminal (for commands), Home page (for visualization routing)

## Usage

### Basic Setup

The CommandContext is already integrated into the MainLayout:

```javascript
import { CommandProvider } from '../contexts/CommandContext';
import { SpaceRoomProvider } from '../contexts/SpaceRoomContext';

<SpaceRoomProvider>
  <CommandProvider>
    {/* Your app components */}
  </CommandProvider>
</SpaceRoomProvider>
```

### Using the Context

Import and use the `useCommand` hook in your components:

```javascript
import { useCommand } from '../contexts/CommandContext';

function MyComponent() {
  const {
    currentCommand,
    commandHistory,
    commandOutput,
    isExecuting,
    error,
    executeCommand,
    clearCommand,
    setOutput,
    setCommandError
  } = useCommand();

  // Execute a command
  const handleExecute = () => {
    executeCommand('chart cpu --range 1h');
  };

  return (
    <div>
      {currentCommand && (
        <p>Current: {currentCommand.name}</p>
      )}
    </div>
  );
}
```

## Command Types

### Available Commands

The system supports several command categories:

#### Navigation Commands (Handled by SpaceRoomContext)
- `cd <space> [room]` - Change current space/room
- `ls [space]` - List spaces or rooms
- `pwd` - Print current space and room

#### Visualization Commands (Handled by CommandContext)
- `chart <metric> [options]` - Display metric charts
- `dashboard [name]` - Show dashboard
- `alerts [filter]` - Display alerts
- `nodes [filter]` - Show node information
- `metrics [category]` - Display metrics overview
- `logs [options]` - Show system logs
- `events [filter]` - Display system events
- `topology` - Show network topology
- `health [node]` - Display system health

#### Data Commands
- `query <metric> [options]` - Query metrics data
- `export <type> [options]` - Export data
- `filter <criteria>` - Filter current view

#### System Commands
- `clear` - Clear terminal
- `help [command]` - Show help
- `version` - Show version
- `settings [section]` - Open settings

### Command Structure

Parsed commands have the following structure:

```javascript
{
  id: 'cmd_1234567890_abc123',
  type: 'chart',
  raw: 'chart cpu --range 1h --node server1',
  name: 'chart',
  args: {
    options: { range: '1h', node: 'server1' },
    positional: ['cpu']
  },
  timestamp: 1234567890,
  status: 'pending' // 'pending' | 'executing' | 'success' | 'error' | 'cancelled'
}
```

## Integration Examples

### Terminal Emulator Integration

The Terminal should use both contexts:

```javascript
import { useCommand } from '../contexts/CommandContext';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import { parseCommand, isNavigationCommand } from '../utils/commandParser';

function TerminalEmulator() {
  const { executeCommand } = useCommand();
  const { changeSpace, changeRoom, spaces, rooms } = useSpaceRoom();

  const handleCommand = (input) => {
    // Parse the command
    const command = parseCommand(input);

    // Handle navigation commands with SpaceRoomContext
    if (isNavigationCommand(command)) {
      if (command.type === 'cd') {
        const [spaceName, roomName] = command.args.positional;
        const space = spaces.find(s => s.name === spaceName);
        if (space) {
          changeSpace(space);
          if (roomName) {
            const room = rooms.find(r => r.name === roomName);
            if (room) changeRoom(room);
          }
        }
      }
      // Handle other navigation commands...
      return;
    }

    // Handle visualization/action commands with CommandContext
    executeCommand(command);
  };

  return (
    <Terminal onCommand={handleCommand} />
  );
}
```

### Home Page Integration

The Home page consumes CommandContext to render appropriate visualizations:

```javascript
import { useCommand } from '../contexts/CommandContext';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';

function Home() {
  const { selectedSpace, selectedRoom } = useSpaceRoom();
  const { currentCommand, commandOutput, clearCommand } = useCommand();

  // Route to appropriate visualization based on command
  const renderVisualization = () => {
    if (!currentCommand) {
      return <DefaultDashboard />;
    }

    switch (currentCommand.type) {
      case 'chart':
        return (
          <ChartVisualization
            command={currentCommand}
            space={selectedSpace}
            room={selectedRoom}
            output={commandOutput}
            onClose={clearCommand}
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
        return (
          <NodesVisualization
            command={currentCommand}
            space={selectedSpace}
            room={selectedRoom}
          />
        );

      case 'metrics':
        return (
          <MetricsVisualization
            command={currentCommand}
            space={selectedSpace}
            room={selectedRoom}
          />
        );

      default:
        return <DefaultDashboard />;
    }
  };

  return (
    <div>
      <Header space={selectedSpace} room={selectedRoom} />
      {renderVisualization()}
    </div>
  );
}
```

### Visualization Component Example

Visualization components receive the command and can set output:

```javascript
import { useCommand } from '../contexts/CommandContext';
import { useEffect } from 'react';

function ChartVisualization({ command, space, room, onClose }) {
  const { setOutput, setCommandError } = useCommand();

  useEffect(() => {
    // Fetch data based on command
    const fetchData = async () => {
      try {
        const metric = command.args.positional[0];
        const range = command.args.options.range || '1h';
        const node = command.args.options.node;

        const data = await fetchMetricData(space.id, room.id, metric, range, node);

        // Set command output
        setOutput(data);
      } catch (error) {
        setCommandError(error.message);
      }
    };

    fetchData();
  }, [command, space, room]);

  return (
    <div>
      <h2>Chart: {command.args.positional[0]}</h2>
      {/* Render chart visualization */}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

## Command Parsing Utilities

### parseCommand(commandString)

Parses a command string into a structured command object:

```javascript
import { parseCommand } from '../utils/commandParser';

const command = parseCommand('chart cpu --range 1h --node server1');
// Returns:
// {
//   id: 'cmd_...',
//   type: 'chart',
//   name: 'chart',
//   args: {
//     options: { range: '1h', node: 'server1' },
//     positional: ['cpu']
//   },
//   timestamp: ...,
//   status: 'pending'
// }
```

### validateCommand(command)

Validates a parsed command:

```javascript
import { validateCommand } from '../utils/commandParser';

const validation = validateCommand(command);
// Returns: { valid: true/false, errors: [...] }
```

### getCommandSuggestions(partial)

Gets command suggestions for autocomplete:

```javascript
import { getCommandSuggestions } from '../utils/commandParser';

const suggestions = getCommandSuggestions('ch');
// Returns: ['chart']
```

## Command History

### Accessing History

```javascript
const { commandHistory, getHistoryCommand } = useCommand();

// Get last command
const lastCommand = getHistoryCommand(-1);

// Get command by index
const firstCommand = getHistoryCommand(0);
```

### Filtering History

```javascript
const { getFilteredHistory, getVisualizationHistory } = useCommand();

// Get only successful commands
const successfulCommands = getFilteredHistory(
  cmd => cmd.status === 'success'
);

// Get only visualization commands (excludes navigation)
const vizCommands = getVisualizationHistory();
```

### Replaying Commands

```javascript
const { replayCommand } = useCommand();

// Replay last command
replayCommand(-1);

// Replay specific command
replayCommand(5);
```

### Clearing History

```javascript
const { clearHistory } = useCommand();

clearHistory();
```

## Error Handling

### Setting Errors

```javascript
const { setCommandError } = useCommand();

try {
  // Execute some operation
} catch (error) {
  setCommandError(error.message);
}
```

### Displaying Errors

```javascript
const { error, currentCommand } = useCommand();

if (error) {
  return <ErrorDisplay message={error} command={currentCommand} />;
}
```

## Best Practices

### 1. Separate Navigation from Actions

Always handle navigation commands (cd, ls, pwd) with SpaceRoomContext and visualization commands with CommandContext.

### 2. Validate Commands Before Execution

```javascript
import { parseCommand, validateCommand } from '../utils/commandParser';

const command = parseCommand(input);
const validation = validateCommand(command);

if (!validation.valid) {
  console.error('Invalid command:', validation.errors);
  return;
}

executeCommand(command);
```

### 3. Set Command Output

When a visualization completes, always set the output:

```javascript
const { setOutput } = useCommand();

// After fetching data
setOutput(data);
```

### 4. Handle Command Cancellation

```javascript
const { cancelCommand, isExecuting } = useCommand();

if (isExecuting) {
  return (
    <div>
      <p>Executing command...</p>
      <button onClick={cancelCommand}>Cancel</button>
    </div>
  );
}
```

### 5. Clear Commands When Done

```javascript
const { clearCommand } = useCommand();

// When closing a visualization
<button onClick={clearCommand}>Close</button>
```

## Command Status Lifecycle

Commands go through the following status lifecycle:

1. **pending** - Command parsed and validated
2. **executing** - Command is being executed
3. **success** - Command completed successfully
4. **error** - Command failed with error
5. **cancelled** - Command was cancelled by user

## LocalStorage Persistence

Command history is automatically persisted to localStorage:

- **Key**: `netdata_command_history`
- **Max Size**: 100 commands
- **Auto-save**: On every command execution

## TypeScript Support

For TypeScript projects, the command types are available:

```typescript
import { COMMAND_TYPES, COMMAND_STATUS, COMMAND_CATEGORIES } from '../utils/commandTypes';

type CommandType = typeof COMMAND_TYPES[keyof typeof COMMAND_TYPES];
type CommandStatus = typeof COMMAND_STATUS[keyof typeof COMMAND_STATUS];
```

## Future Enhancements

Potential future features for the CommandContext:

- Command queue for batch operations
- Command validation middleware
- Command execution middleware
- Command result caching
- Command autocomplete with context awareness
- Command aliases
- Command macros
- Command scripting

## Troubleshooting

### Commands Not Executing

1. Check that CommandProvider is wrapping your components
2. Verify command parsing with `parseCommand`
3. Check validation with `validateCommand`
4. Look for errors in `error` state

### History Not Persisting

1. Check browser localStorage is enabled
2. Verify localStorage quota not exceeded
3. Check console for localStorage errors

### Commands Not Clearing

1. Ensure you're calling `clearCommand()` when needed
2. Check that visualization components properly handle unmounting

## Related Documentation

- [Command Types Reference](../utils/commandTypes.js)
- [Command Parser Reference](../utils/commandParser.js)
- [SpaceRoomContext Documentation](./SPACEROOM_CONTEXT.md)

