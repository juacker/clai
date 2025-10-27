# CommandContext Quick Reference

## Quick Start

### Import the Hook

```javascript
import { useCommand } from '../contexts/CommandContext';
```

### Basic Usage

```javascript
function MyComponent() {
  const { executeCommand, currentCommand, commandOutput } = useCommand();

  const handleCommand = () => {
    executeCommand('chart cpu --range 1h');
  };

  return (
    <div>
      {currentCommand && <p>Running: {currentCommand.name}</p>}
    </div>
  );
}
```

## Available State

```javascript
const {
  currentCommand,      // Current executing command
  commandHistory,      // Array of all commands
  commandOutput,       // Output from current command
  isExecuting,         // Boolean: command is executing
  error,              // Error message if any
} = useCommand();
```

## Available Methods

```javascript
const {
  executeCommand,           // Execute a command string or object
  clearCommand,            // Clear current command
  setOutput,              // Set command output
  setCommandError,        // Set command error
  getHistoryCommand,      // Get command from history by index
  replayCommand,          // Replay a command from history
  clearHistory,           // Clear all history
  getFilteredHistory,     // Get filtered history
  getVisualizationHistory, // Get only visualization commands
  cancelCommand,          // Cancel current command
} = useCommand();
```

## Command Types

### Navigation (Use SpaceRoomContext)
- `cd <space> [room]`
- `ls [space]`
- `pwd`

### Visualization (Use CommandContext)
- `chart <metric> [options]`
- `dashboard [name]`
- `alerts [filter]`
- `nodes [filter]`
- `metrics [category]`
- `logs [options]`
- `events [filter]`
- `topology`
- `health [node]`

### Data
- `query <metric> [options]`
- `export <type> [options]`
- `filter <criteria>`

### System
- `clear`
- `help [command]`
- `version`
- `settings [section]`

## Parsing Utilities

```javascript
import { parseCommand, validateCommand } from '../utils/commandParser';

// Parse command string
const cmd = parseCommand('chart cpu --range 1h');

// Validate command
const validation = validateCommand(cmd);
if (!validation.valid) {
  console.error(validation.errors);
}
```

## Command Object Structure

```javascript
{
  id: 'cmd_1234567890_abc123',
  type: 'chart',
  raw: 'chart cpu --range 1h',
  name: 'chart',
  args: {
    options: { range: '1h' },
    positional: ['cpu']
  },
  timestamp: 1234567890,
  status: 'pending' // 'pending' | 'executing' | 'success' | 'error' | 'cancelled'
}
```

## Integration Pattern

### Terminal Integration

```javascript
import { useCommand } from '../contexts/CommandContext';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import { parseCommand, isNavigationCommand } from '../utils/commandParser';

function Terminal() {
  const { executeCommand } = useCommand();
  const { changeSpace, changeRoom } = useSpaceRoom();

  const handleCommand = (input) => {
    const command = parseCommand(input);

    if (isNavigationCommand(command)) {
      // Handle with SpaceRoomContext
      handleNavigation(command);
    } else {
      // Handle with CommandContext
      executeCommand(command);
    }
  };

  return <TerminalInput onCommand={handleCommand} />;
}
```

### Home Page Integration

```javascript
import { useCommand } from '../contexts/CommandContext';

function Home() {
  const { currentCommand, clearCommand } = useCommand();

  const renderVisualization = () => {
    if (!currentCommand) return <Dashboard />;

    switch (currentCommand.type) {
      case 'chart':
        return <ChartView command={currentCommand} />;
      case 'alerts':
        return <AlertsView command={currentCommand} />;
      default:
        return <Dashboard />;
    }
  };

  return <div>{renderVisualization()}</div>;
}
```

### Visualization Component

```javascript
import { useCommand } from '../contexts/CommandContext';

function ChartView({ command }) {
  const { setOutput, setCommandError } = useCommand();

  useEffect(() => {
    fetchData()
      .then(data => setOutput(data))
      .catch(err => setCommandError(err.message));
  }, [command]);

  return <Chart />;
}
```

## Common Patterns

### Execute and Handle Result

```javascript
const handleExecute = async () => {
  const command = executeCommand('chart cpu');
  // Command is now in history and set as current
};
```

### Clear After Completion

```javascript
const handleClose = () => {
  clearCommand();
};
```

### Access History

```javascript
// Get last command
const lastCmd = getHistoryCommand(-1);

// Get all successful commands
const successful = getFilteredHistory(cmd => cmd.status === 'success');

// Get only visualization commands
const vizCommands = getVisualizationHistory();
```

### Replay Command

```javascript
// Replay last command
replayCommand(-1);

// Replay specific command
replayCommand(5);
```

## Files Created

- `src/utils/commandTypes.js` - Command type definitions and metadata
- `src/utils/commandParser.js` - Command parsing utilities
- `src/contexts/CommandContext.jsx` - CommandContext implementation
- `COMMAND_CONTEXT.md` - Full documentation
- `COMMAND_CONTEXT_QUICK_REF.md` - This quick reference

## Next Steps

1. Implement TerminalEmulator component to use both contexts
2. Update Home page to route based on currentCommand
3. Create visualization components (ChartView, AlertsView, etc.)
4. Add command autocomplete to terminal
5. Implement command validation feedback

## Related Documentation

- [Full Documentation](./COMMAND_CONTEXT.md)
- [Command Types](./src/utils/commandTypes.js)
- [Command Parser](./src/utils/commandParser.js)

