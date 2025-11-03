# Terminal Tab Completion - Design Document

## Document Information

**Version:** 1.0
**Last Updated:** 2025-10-29
**Status:** Design Phase
**Owner:** Terminal Feature Team

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [User Experience](#user-experience)
4. [Architecture](#architecture)
5. [Implementation Phases](#implementation-phases)
6. [Detailed Specifications](#detailed-specifications)
7. [Testing Strategy](#testing-strategy)
8. [Future Enhancements](#future-enhancements)

---

## Overview

### Purpose

Implement intelligent tab completion for the TerminalEmulator component, enabling users to discover and efficiently input commands through keyboard-driven autocomplete functionality similar to traditional terminal applications (bash, zsh, fish).

### Motivation

- **Discoverability**: Users can explore available commands without consulting documentation
- **Efficiency**: Reduce typing and errors through autocomplete
- **Professional UX**: Match expectations from traditional terminal applications
- **Accessibility**: Provide multiple ways to interact with the command system

### Scope

This design covers:
- Command-level completion (top-level commands)
- Subcommand completion (nested command structures)
- Context-aware suggestions (dynamic completions based on application state)
- Visual feedback mechanisms
- Keyboard navigation

---

## Goals & Non-Goals

### Goals

✅ **Must Have (Phase 1-2)**
- Single-tab completion for unambiguous matches
- Double-tab to show all available options
- Command and subcommand completion
- Integration with existing command registry
- Minimal performance impact

✅ **Should Have (Phase 3)**
- Visual suggestions panel
- Tab key navigation through suggestions
- Context-aware completions from TabContext
- Fuzzy matching for typo tolerance

✅ **Nice to Have (Future)**
- Inline completion preview (ghost text)
- Command descriptions in suggestions
- Argument/flag completion
- File path completion
- Command history-based suggestions

### Non-Goals

❌ **Out of Scope**
- Natural language command parsing
- AI-powered command suggestions
- Command aliases (separate feature)
- Macro/script execution
- Remote command completion

---

## User Experience

### Behavior Specification

#### Single Tab Press

**Scenario 1: No Input**
```
user@netdata % [TAB]
→ Shows: Available commands: ctx, tab, tile, echo, help
```

**Scenario 2: Partial Command (Unique Match)**
```
user@netdata % ec[TAB]
→ Completes to: echo
```

**Scenario 3: Partial Command (Multiple Matches)**
```
user@netdata % t[TAB]
→ Completes to: t (common prefix)
→ Shows: tab, tile
```

**Scenario 4: Complete Command**
```
user@netdata % ctx [TAB]
→ Shows: add, remove, list, clear
```

**Scenario 5: Partial Subcommand**
```
user@netdata % ctx a[TAB]
→ Completes to: ctx add
```

#### Double Tab Press

**Any Context:**
```
user@netdata % t[TAB][TAB]
→ Output Area Shows:
   Available commands:
   • tab - Tab management
   • tile - Tile layout management
```

#### Escape Key

```
user@netdata % ctx [TAB][TAB]
[Suggestions visible]
[ESC]
→ Dismisses suggestions panel
```

#### Tab Key for navigation (Phase 3)

```
user@netdata % t[TAB][TAB]
[Suggestions: tab, tile]
[TAB] → Highlights: tab
[TAB] → Highlights the next one: tile (cycles)
[ENTER] → Completes: tile
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TerminalEmulator                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Input Handler                                         │ │
│  │  • Keyboard events (Tab, Enter, Escape)                │ │
│  │  • Cursor position tracking                           │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Completion Engine                                     │ │
│  │  • Parse input context                                │ │
│  │  • Query command registry                             │ │
│  │  • Generate suggestions                               │ │
│  │  • Apply completion logic                             │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Completion State                                      │ │
│  │  • Current suggestions                                │ │
│  │  • Selected index                                     │ │
│  │  • Visibility flags                                   │ │
│  │  • Tab timing                                         │ │
│  └────────────┬───────────────────────────────────────────┘ │
│               │                                              │
│               ▼                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  UI Rendering                                          │ │
│  │  • Output area messages                               │ │
│  │  • Suggestions panel (Phase 3)                        │ │
│  │  • Inline preview (Future)                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
           ┌─────────────────────────┐
           │   Command Registry      │
           │   • Static commands     │
           │   • Subcommands         │
           │   • Descriptions        │
           │   • Argument specs      │
           └─────────────────────────┘
                         │
                         ▼
           ┌─────────────────────────┐
           │   Context Providers     │
           │   • TabContext          │
           │   • TabManagerContext   │
           │   • CommandContext      │
           └─────────────────────────┘
```

### Data Flow

```
User presses Tab
    ↓
1. Capture keyboard event
    ↓
2. Detect single/double tab
    ↓
3. Extract input context (command, args, cursor position)
    ↓
4. Query completion engine
    ↓
5. Generate suggestions array
    ↓
6. Apply completion logic:
   - Single match? → Auto-complete
   - Multiple matches? → Show options
   - No matches? → No action
    ↓
7. Update state & UI
    ↓
8. Render feedback (output area or suggestions panel)
```

### File Structure

```
src/
├── components/
│   └── TerminalEmulator/
│       ├── TerminalEmulator.jsx          (Modified: Add tab handling)
│       ├── TerminalEmulator.module.css   (Modified: Add suggestion styles)
│       └── SuggestionsPanel.jsx          (New: Phase 3)
├── utils/
│   ├── commandRegistry.js                (New: Phase 1)
│   ├── completionEngine.js               (New: Phase 1)
│   └── completionHelpers.js              (New: Phase 2)
└── hooks/
    └── useTabCompletion.js               (New: Phase 2 - Optional)
```

---

## Implementation Phases

### Phase 1: Foundation (MVP) - 4-6 hours

**Goal:** Basic command completion with minimal UI

**Deliverables:**
1. ✅ Command registry structure
2. ✅ Basic completion engine
3. ✅ Tab key handler (single/double detection)
4. ✅ Output area feedback for suggestions
5. ✅ Command-level completion only

**Success Criteria:**
- Tab completes unambiguous commands
- Double-tab shows available commands in output area
- No visual regressions
- Performance < 50ms for completion operations

**Files to Create:**
- `src/utils/commandRegistry.js`
- `src/utils/completionEngine.js`

**Files to Modify:**
- `src/components/TerminalEmulator/TerminalEmulator.jsx`

---

### Phase 2: Subcommands & Context - 3-4 hours

**Goal:** Extend completion to subcommands and improve matching

**Deliverables:**
1. ✅ Subcommand completion (ctx add, tab new, etc.)
2. ✅ Common prefix completion for multiple matches
3. ✅ Improved completion algorithm (partial matching)
4. ✅ Integration with TabContext for dynamic suggestions
5. ✅ Helper utilities for completion logic

**Success Criteria:**
- Subcommands autocomplete correctly
- Context-aware suggestions work (e.g., tab names)
- Common prefix completion reduces typing
- No performance degradation

**Files to Create:**
- `src/utils/completionHelpers.js`

**Files to Modify:**
- `src/utils/completionEngine.js` (Extend)
- `src/utils/commandRegistry.js` (Add subcommands)
- `src/components/TerminalEmulator/TerminalEmulator.jsx` (Add context integration)

---

### Phase 3: Visual Polish & Navigation - 3-4 hours

**Goal:** Enhanced UI with dedicated suggestions panel

**Deliverables:**
1. ✅ Dedicated suggestions panel component
2. ✅ Tab key navigation through suggestions
3. ✅ Visual highlighting of selected suggestion
4. ✅ Command descriptions in suggestions
5. ✅ Smooth animations and transitions
6. ✅ Escape key to dismiss

**Success Criteria:**
- Suggestions panel is visually consistent with terminal design
- Tab keys navigate smoothly through options
- Animations are performant (60fps)
- Mobile-friendly (touch support)

**Files to Create:**
- `src/components/TerminalEmulator/SuggestionsPanel.jsx`
- `src/components/TerminalEmulator/SuggestionsPanel.module.css`

**Files to Modify:**
- `src/components/TerminalEmulator/TerminalEmulator.jsx` (Add panel)
- `src/components/TerminalEmulator/TerminalEmulator.module.css` (Add styles)
- `src/utils/completionEngine.js` (Add descriptions)

---

### Phase 4: Advanced Features (Future) - 6-8 hours

**Goal:** Professional-grade completion experience

**Deliverables:**
1. ✅ Fuzzy matching (typo tolerance)
2. ✅ Inline ghost text preview
3. ✅ Argument/flag completion
4. ✅ File path completion (if needed)
5. ✅ History-based suggestions
6. ✅ Custom completion providers

**Success Criteria:**
- Fuzzy matching finds commands with typos
- Ghost text provides visual preview
- Argument completion works for known commands
- Extensible architecture for future commands

---

## Detailed Specifications

### 1. Command Registry

**File:** `src/utils/commandRegistry.js`

```javascript
/**
 * Command Registry
 *
 * Centralized definition of all available commands, their structure,
 * and metadata for completion and help systems.
 */

export const commandRegistry = {
  // Visualization/Action Commands
  echo: {
    type: 'action',
    description: 'Display a message or execute an action',
    usage: 'echo <message>',
    args: [
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'Message to display'
      }
    ],
    examples: [
      'echo Hello World',
      'echo "Multi word message"'
    ]
  },

  // Context Management Commands
  ctx: {
    type: 'context',
    description: 'Manage tab context (nodes, alerts, charts)',
    usage: 'ctx <subcommand> [args]',
    subcommands: {
      add: {
        description: 'Add item to context',
        usage: 'ctx add <type> <id>',
        args: [
          { name: 'type', type: 'enum', values: ['node', 'alert', 'chart'], required: true },
          { name: 'id', type: 'string', required: true }
        ],
        dynamicCompletion: 'contextItems', // Fetch from TabContext
        examples: ['ctx add node server-01', 'ctx add alert cpu-high']
      },
      remove: {
        description: 'Remove item from context',
        usage: 'ctx remove <type> <id>',
        args: [
          { name: 'type', type: 'enum', values: ['node', 'alert', 'chart'], required: true },
          { name: 'id', type: 'string', required: true }
        ],
        dynamicCompletion: 'contextItems',
        examples: ['ctx remove node server-01']
      },
      list: {
        description: 'List all context items',
        usage: 'ctx list [type]',
        args: [
          { name: 'type', type: 'enum', values: ['node', 'alert', 'chart'], required: false }
        ],
        examples: ['ctx list', 'ctx list node']
      },
      clear: {
        description: 'Clear all context items',
        usage: 'ctx clear',
        args: [],
        examples: ['ctx clear']
      }
    }
  },

  // Tab Management Commands
  tab: {
    type: 'layout',
    description: 'Manage tabs in the workspace',
    usage: 'tab <subcommand> [args]',
    subcommands: {
      new: {
        description: 'Create a new tab',
        usage: 'tab new [name]',
        args: [
          { name: 'name', type: 'string', required: false, description: 'Tab name' }
        ],
        examples: ['tab new', 'tab new "Production Monitoring"']
      },
      close: {
        description: 'Close current or specified tab',
        usage: 'tab close [id]',
        args: [
          { name: 'id', type: 'string', required: false, description: 'Tab ID' }
        ],
        dynamicCompletion: 'tabList',
        examples: ['tab close', 'tab close tab-123']
      },
      switch: {
        description: 'Switch to a different tab',
        usage: 'tab switch <id>',
        args: [
          { name: 'id', type: 'string', required: true, description: 'Tab ID' }
        ],
        dynamicCompletion: 'tabList',
        examples: ['tab switch tab-123']
      },
      list: {
        description: 'List all open tabs',
        usage: 'tab list',
        args: [],
        examples: ['tab list']
      },
      rename: {
        description: 'Rename current or specified tab',
        usage: 'tab rename <name> [id]',
        args: [
          { name: 'name', type: 'string', required: true },
          { name: 'id', type: 'string', required: false }
        ],
        examples: ['tab rename "New Name"', 'tab rename "New Name" tab-123']
      }
    }
  },

  // Tile Management Commands
  tile: {
    type: 'layout',
    description: 'Manage tile layouts within tabs',
    usage: 'tile <subcommand> [args]',
    subcommands: {
      split: {
        description: 'Split current tile',
        usage: 'tile split <direction>',
        args: [
          { name: 'direction', type: 'enum', values: ['h', 'v', 'horizontal', 'vertical'], required: true }
        ],
        examples: ['tile split h', 'tile split vertical']
      },
      close: {
        description: 'Close current tile',
        usage: 'tile close',
        args: [],
        examples: ['tile close']
      },
      focus: {
        description: 'Focus a specific tile',
        usage: 'tile focus <direction>',
        args: [
          { name: 'direction', type: 'enum', values: ['up', 'down', 'left', 'right'], required: true }
        ],
        examples: ['tile focus left', 'tile focus up']
      }
    }
  },

  // Help Command
  help: {
    type: 'system',
    description: 'Show help information',
    usage: 'help [command]',
    args: [
      { name: 'command', type: 'string', required: false, description: 'Command name' }
    ],
    dynamicCompletion: 'commandList',
    examples: ['help', 'help ctx', 'help tab new']
  },

  // Clear Command
  clear: {
    type: 'system',
    description: 'Clear terminal output',
    usage: 'clear',
    args: [],
    examples: ['clear']
  }
};

/**
 * Get all top-level command names
 */
export function getCommandNames() {
  return Object.keys(commandRegistry);
}

/**
 * Get subcommands for a given command
 */
export function getSubcommands(commandName) {
  const command = commandRegistry[commandName];
  if (!command || !command.subcommands) {
    return [];
  }
  return Object.keys(command.subcommands);
}

/**
 * Get command definition
 */
export function getCommandDef(commandName, subcommandName = null) {
  const command = commandRegistry[commandName];
  if (!command) return null;

  if (subcommandName && command.subcommands) {
    return command.subcommands[subcommandName];
  }

  return command;
}

/**
 * Check if a command exists
 */
export function isValidCommand(commandName) {
  return commandName in commandRegistry;
}

/**
 * Check if a subcommand exists
 */
export function isValidSubcommand(commandName, subcommandName) {
  const command = commandRegistry[commandName];
  return command && command.subcommands && subcommandName in command.subcommands;
}
```

---

### 2. Completion Engine

**File:** `src/utils/completionEngine.js`

```javascript
/**
 * Completion Engine
 *
 * Core logic for generating command completions based on input context.
 */

import {
  commandRegistry,
  getCommandNames,
  getSubcommands,
  getCommandDef
} from './commandRegistry';

/**
 * Parse input to determine completion context
 */
export function parseCompletionContext(input, cursorPosition) {
  const beforeCursor = input.substring(0, cursorPosition);
  const afterCursor = input.substring(cursorPosition);

  // Split by whitespace, but preserve quoted strings
  const parts = beforeCursor.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

  // Determine if we're completing a partial token or starting a new one
  const isPartialToken = beforeCursor.length > 0 && !beforeCursor.endsWith(' ');

  return {
    parts,
    currentToken: isPartialToken ? parts[parts.length - 1] || '' : '',
    previousTokens: isPartialToken ? parts.slice(0, -1) : parts,
    isPartialToken,
    beforeCursor,
    afterCursor,
    fullInput: input
  };
}

/**
 * Get completions based on context
 */
export function getCompletions(input, cursorPosition, contextProviders = {}) {
  const context = parseCompletionContext(input, cursorPosition);
  const { parts, currentToken, previousTokens, isPartialToken } = context;

  // Case 1: Empty input or completing first token (command name)
  if (parts.length === 0 || (parts.length === 1 && isPartialToken)) {
    return filterMatches(getCommandNames(), currentToken);
  }

  // Case 2: Command is complete, completing subcommand or argument
  const commandName = previousTokens[0];
  const commandDef = getCommandDef(commandName);

  if (!commandDef) {
    return []; // Invalid command
  }

  // Case 2a: Command has subcommands
  if (commandDef.subcommands) {
    if (parts.length === 1 || (parts.length === 2 && isPartialToken)) {
      // Completing subcommand
      return filterMatches(getSubcommands(commandName), currentToken);
    }

    // Case 2b: Subcommand is complete, completing arguments
    const subcommandName = previousTokens[1];
    const subcommandDef = getCommandDef(commandName, subcommandName);

    if (subcommandDef && subcommandDef.dynamicCompletion) {
      // Dynamic completion from context providers
      return getDynamicCompletions(
        subcommandDef.dynamicCompletion,
        contextProviders,
        currentToken
      );
    }

    // Static argument completion (enum values)
    const argIndex = parts.length - (isPartialToken ? 2 : 1) - 1;
    if (subcommandDef && subcommandDef.args && subcommandDef.args[argIndex]) {
      const argDef = subcommandDef.args[argIndex];
      if (argDef.type === 'enum' && argDef.values) {
        return filterMatches(argDef.values, currentToken);
      }
    }
  }

  // Case 2c: Command without subcommands, completing arguments
  if (commandDef.dynamicCompletion) {
    return getDynamicCompletions(
      commandDef.dynamicCompletion,
      contextProviders,
      currentToken
    );
  }

  // Static argument completion
  const argIndex = parts.length - (isPartialToken ? 2 : 1);
  if (commandDef.args && commandDef.args[argIndex]) {
    const argDef = commandDef.args[argIndex];
    if (argDef.type === 'enum' && argDef.values) {
      return filterMatches(argDef.values, currentToken);
    }
  }

  return [];
}

/**
 * Filter matches based on prefix
 */
function filterMatches(candidates, prefix) {
  if (!prefix) return candidates;

  const lowerPrefix = prefix.toLowerCase();
  return candidates.filter(candidate =>
    candidate.toLowerCase().startsWith(lowerPrefix)
  );
}

/**
 * Get dynamic completions from context providers
 */
function getDynamicCompletions(completionType, contextProviders, currentToken) {
  switch (completionType) {
    case 'contextItems':
      // Get items from TabContext
      if (contextProviders.tabContext) {
        const items = [
          ...(contextProviders.tabContext.nodes || []),
          ...(contextProviders.tabContext.alerts || []),
          ...(contextProviders.tabContext.charts || [])
        ];
        return filterMatches(items.map(item => item.id || item.name), currentToken);
      }
      return [];

    case 'tabList':
      // Get tab names from TabManagerContext
      if (contextProviders.tabManager) {
        const tabs = contextProviders.tabManager.tabs || [];
        return filterMatches(tabs.map(tab => tab.id), currentToken);
      }
      return [];

    case 'commandList':
      // Get all command names for help
      return filterMatches(getCommandNames(), currentToken);

    default:
      return [];
  }
}

/**
 * Apply completion to input
 */
export function applyCompletion(input, cursorPosition, completion) {
  const context = parseCompletionContext(input, cursorPosition);
  const { beforeCursor, afterCursor, currentToken } = context;

  // Replace current token with completion
  const beforeToken = beforeCursor.substring(0, beforeCursor.length - currentToken.length);
  const newInput = beforeToken + completion + ' ' + afterCursor.trimStart();
  const newCursorPosition = beforeToken.length + completion.length + 1;

  return {
    input: newInput,
    cursorPosition: newCursorPosition
  };
}

/**
 * Find common prefix among multiple completions
 */
export function findCommonPrefix(completions) {
  if (completions.length === 0) return '';
  if (completions.length === 1) return completions[0];

  const sorted = completions.slice().sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let i = 0;

  while (i < first.length && first.charAt(i) === last.charAt(i)) {
    i++;
  }

  return first.substring(0, i);
}

/**
 * Get completion metadata (for UI display)
 */
export function getCompletionMetadata(completion, input, cursorPosition) {
  const context = parseCompletionContext(input, cursorPosition);
  const { previousTokens } = context;

  // Determine what type of completion this is
  if (previousTokens.length === 0) {
    // Top-level command
    const commandDef = getCommandDef(completion);
    return {
      type: 'command',
      description: commandDef?.description || '',
      usage: commandDef?.usage || ''
    };
  }

  const commandName = previousTokens[0];
  const commandDef = getCommandDef(commandName);

  if (commandDef && commandDef.subcommands && previousTokens.length === 1) {
    // Subcommand
    const subcommandDef = getCommandDef(commandName, completion);
    return {
      type: 'subcommand',
      description: subcommandDef?.description || '',
      usage: subcommandDef?.usage || ''
    };
  }

  // Argument or dynamic completion
  return {
    type: 'argument',
    description: '',
    usage: ''
  };
}
```

---

### 3. TerminalEmulator Integration (Phase 1)

**File:** `src/components/TerminalEmulator/TerminalEmulator.jsx`

**Changes to implement:**

```javascript
// Add imports
import { getCompletions, applyCompletion, findCommonPrefix } from '../../utils/completionEngine';

// Add state for tab completion
const [completionState, setCompletionState] = useState({
  suggestions: [],
  lastTabTime: 0,
  isDoubleTap: false
});

// Add tab key handler
const handleTabKey = (e) => {
  e.preventDefault();

  const now = Date.now();
  const timeSinceLastTab = now - completionState.lastTabTime;
  const isDoubleTap = timeSinceLastTab < 500; // 500ms threshold

  // Get cursor position
  const cursorPosition = e.target.selectionStart;

  // Get context providers for dynamic completions
  const contextProviders = {
    tabContext: tabContext,
    tabManager: { tabs: [] } // From useTabManager if needed
  };

  // Get completions
  const suggestions = getCompletions(inputValue, cursorPosition, contextProviders);

  if (isDoubleTap) {
    // Double-tab: Show all suggestions
    if (suggestions.length > 0) {
      addOutputMessage(
        `Available: ${suggestions.join(', ')}`,
        'info'
      );
    } else {
      addOutputMessage('No completions available', 'warning');
    }
  } else {
    // Single-tab: Complete or prepare for double-tap
    if (suggestions.length === 1) {
      // Single match: auto-complete
      const result = applyCompletion(inputValue, cursorPosition, suggestions[0]);
      setInputValue(result.input);
      // Set cursor position after state update
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(result.cursorPosition, result.cursorPosition);
        }
      }, 0);
    } else if (suggestions.length > 1) {
      // Multiple matches: complete common prefix
      const commonPrefix = findCommonPrefix(suggestions);
      const context = parseCompletionContext(inputValue, cursorPosition);

      if (commonPrefix.length > context.currentToken.length) {
        // There's a common prefix we can complete
        const result = applyCompletion(inputValue, cursorPosition, commonPrefix);
        setInputValue(result.input.trimEnd()); // Remove the space added by applyCompletion
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(result.cursorPosition - 1, result.cursorPosition - 1);
          }
        }, 0);
      }
      // If no common prefix, wait for double-tap to show options
    }
  }

  // Update completion state
  setCompletionState({
    suggestions,
    lastTabTime: now,
    isDoubleTap
  });
};

// Modify handleKeyDown to include Tab
const handleKeyDown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleCommandExecution(inputValue);
  } else if (e.key === 'Tab') {
    handleTabKey(e);
  } else if (e.key === 'Escape') {
    // Clear output on Escape
    setOutputMessages([]);
    setCompletionState({ suggestions: [], lastTabTime: 0, isDoubleTap: false });
  }
};

// Clear completion state when input changes
useEffect(() => {
  setCompletionState({ suggestions: [], lastTabTime: 0, isDoubleTap: false });
}, [inputValue]);
```

---

### 4. Suggestions Panel (Phase 3)

**File:** `src/components/TerminalEmulator/SuggestionsPanel.jsx`

```javascript
import React from 'react';
import styles from './SuggestionsPanel.module.css';

const SuggestionsPanel = ({
  suggestions,
  selectedIndex,
  onSelect,
  onDismiss,
  metadata = {}
}) => {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Suggestions</span>
        <span className={styles.hint}>
          Use [TAB] to navigate, Enter to select, Esc to dismiss
        </span>
      </div>
      <div className={styles.list}>
        {suggestions.map((suggestion, index) => {
          const meta = metadata[suggestion] || {};
          return (
            <div
              key={suggestion}
              className={`${styles.item} ${index === selectedIndex ? styles.itemSelected : ''}`}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => onSelect(suggestion, true)} // true = hover, don't apply
            >
              <div className={styles.itemMain}>
                <span className={styles.itemName}>{suggestion}</span>
                {meta.description && (
                  <span className={styles.itemDescription}>{meta.description}</span>
                )}
              </div>
              {meta.usage && (
                <div className={styles.itemUsage}>{meta.usage}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SuggestionsPanel;
```

**File:** `src/components/TerminalEmulator/SuggestionsPanel.module.css`

```css
.panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 8px;
  background: var(--color-bg-secondary, rgba(20, 20, 30, 0.95));
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease-out;
  z-index: 1000;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-tertiary, rgba(30, 30, 40, 0.5));
}

.title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.7));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hint {
  font-size: 11px;
  color: var(--color-text-tertiary, rgba(255, 255, 255, 0.5));
  font-family: var(--font-mono, 'Monaco', 'Courier New', monospace);
}

.list {
  overflow-y: auto;
  max-height: 250px;
}

.item {
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-left: 3px solid transparent;
}

.item:hover {
  background: var(--color-hover, rgba(255, 255, 255, 0.05));
}

.itemSelected {
  background: var(--color-selected, rgba(79, 192, 141, 0.15));
  border-left-color: var(--color-accent, #4fc08d);
}

.itemMain {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.itemName {
  font-family: var(--font-mono, 'Monaco', 'Courier New', monospace);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, rgba(255, 255, 255, 0.9));
}

.itemDescription {
  font-size: 12px;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
  flex: 1;
}

.itemUsage {
  font-family: var(--font-mono, 'Monaco', 'Courier New', monospace);
  font-size: 11px;
  color: var(--color-text-tertiary, rgba(255, 255, 255, 0.5));
  margin-top: 4px;
  padding-left: 0;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .panel {
    max-height: 200px;
  }

  .list {
    max-height: 160px;
  }

  .hint {
    display: none;
  }

  .itemDescription {
    display: none;
  }
}

/* Touch device optimization */
@media (pointer: coarse) {
  .item {
    padding: 14px 12px;
    min-height: 44px; /* iOS recommended touch target */
  }
}
```

---

## Testing Strategy

### Unit Tests

**File:** `src/utils/__tests__/completionEngine.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import {
  getCompletions,
  applyCompletion,
  findCommonPrefix,
  parseCompletionContext
} from '../completionEngine';

describe('Completion Engine', () => {
  describe('parseCompletionContext', () => {
    it('should parse empty input', () => {
      const result = parseCompletionContext('', 0);
      expect(result.parts).toEqual([]);
      expect(result.currentToken).toBe('');
    });

    it('should parse partial command', () => {
      const result = parseCompletionContext('ec', 2);
      expect(result.parts).toEqual(['ec']);
      expect(result.currentToken).toBe('ec');
      expect(result.isPartialToken).toBe(true);
    });

    it('should parse complete command with space', () => {
      const result = parseCompletionContext('echo ', 5);
      expect(result.parts).toEqual(['echo']);
      expect(result.currentToken).toBe('');
      expect(result.isPartialToken).toBe(false);
    });
  });

  describe('getCompletions', () => {
    it('should return all commands for empty input', () => {
      const completions = getCompletions('', 0);
      expect(completions).toContain('echo');
      expect(completions).toContain('ctx');
      expect(completions).toContain('tab');
    });

    it('should filter commands by prefix', () => {
      const completions = getCompletions('t', 1);
      expect(completions).toContain('tab');
      expect(completions).toContain('tile');
      expect(completions).not.toContain('echo');
    });

    it('should return subcommands for complete command', () => {
      const completions = getCompletions('ctx ', 4);
      expect(completions).toContain('add');
      expect(completions).toContain('remove');
      expect(completions).toContain('list');
      expect(completions).toContain('clear');
    });

    it('should filter subcommands by prefix', () => {
      const completions = getCompletions('ctx a', 5);
      expect(completions).toEqual(['add']);
    });
  });

  describe('applyCompletion', () => {
    it('should complete partial command', () => {
      const result = applyCompletion('ec', 2, 'echo');
      expect(result.input).toBe('echo ');
      expect(result.cursorPosition).toBe(5);
    });

    it('should complete subcommand', () => {
      const result = applyCompletion('ctx a', 5, 'add');
      expect(result.input).toBe('ctx add ');
      expect(result.cursorPosition).toBe(8);
    });
  });

  describe('findCommonPrefix', () => {
    it('should find common prefix', () => {
      const prefix = findCommonPrefix(['tab', 'tile']);
      expect(prefix).toBe('t');
    });

    it('should return full word if only one option', () => {
      const prefix = findCommonPrefix(['echo']);
      expect(prefix).toBe('echo');
    });

    it('should handle no common prefix', () => {
      const prefix = findCommonPrefix(['echo', 'tab']);
      expect(prefix).toBe('');
    });
  });
});
```

### Integration Tests

**File:** `src/components/TerminalEmulator/__tests__/TabCompletion.test.jsx`

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TerminalEmulator from '../TerminalEmulator';

describe('Terminal Tab Completion', () => {
  it('should complete unambiguous command on single tab', () => {
    const { container } = render(<TerminalEmulator userInfo={{}} />);
    const input = container.querySelector('input');

    // Type partial command
    fireEvent.change(input, { target: { value: 'ec' } });

    // Press Tab
    fireEvent.keyDown(input, { key: 'Tab' });

    // Should complete to 'echo '
    expect(input.value).toBe('echo ');
  });

  it('should show suggestions on double tab', () => {
    const { container } = render(<TerminalEmulator userInfo={{}} />);
    const input = container.querySelector('input');

    // Type ambiguous prefix
    fireEvent.change(input, { target: { value: 't' } });

    // Press Tab twice quickly
    fireEvent.keyDown(input, { key: 'Tab' });
    setTimeout(() => {
      fireEvent.keyDown(input, { key: 'Tab' });
    }, 100);

    // Should show output message with suggestions
    expect(screen.getByText(/Available:/)).toBeInTheDocument();
    expect(screen.getByText(/tab, tile/)).toBeInTheDocument();
  });

  it('should complete common prefix on single tab with multiple matches', () => {
    const { container } = render(<TerminalEmulator userInfo={{}} />);
    const input = container.querySelector('input');

    // Type 't' (matches 'tab' and 'tile')
    fireEvent.change(input, { target: { value: 't' } });

    // Press Tab
    fireEvent.keyDown(input, { key: 'Tab' });

    // Should complete to 't' (common prefix)
    expect(input.value).toBe('t');
  });
});
```

### Manual Testing Checklist

**Phase 1:**
- [ ] Empty input + Tab shows all commands
- [ ] Empty input + Tab Tab shows all commands with descriptions
- [ ] Partial command (unique) + Tab completes
- [ ] Partial command (multiple) + Tab completes common prefix
- [ ] Partial command + Tab Tab shows matching options
- [ ] Complete command + Tab shows subcommands
- [ ] Performance: Tab completion responds < 50ms

**Phase 2:**
- [ ] Subcommand completion works
- [ ] Context-aware suggestions (tab names, etc.) work
- [ ] Enum argument completion works
- [ ] Common prefix logic handles edge cases

**Phase 3:**
- [ ] Suggestions panel appears correctly
- [ ] Tab key navigate suggestions
- [ ] Enter applies selected suggestion
- [ ] Escape dismisses panel
- [ ] Panel animations are smooth (60fps)
- [ ] Mobile touch interactions work
- [ ] Panel respects safe areas on iOS

---

## Future Enhancements

### Phase 4: Advanced Features

#### 1. Fuzzy Matching
```javascript
// Allow typo-tolerant matching
"tba" → matches "tab"
"ctx ad" → matches "ctx add"
```

**Implementation:** Use Levenshtein distance or similar algorithm

#### 2. Inline Ghost Text
```javascript
// Show completion as ghost text
user@netdata % ec█
              ^^ echo (ghost text in gray)
```

**Implementation:** Overlay ghost text element with CSS

#### 3. Command History Suggestions
```javascript
// Suggest recently used commands
user@netdata % [Tab]
→ Shows: Recently used: ctx list, tab new, echo test
```

**Implementation:** Track command frequency in localStorage

#### 4. File Path Completion
```javascript
// If future commands need file paths
user@netdata % export /home/[Tab]
→ Shows: /home/user/documents, /home/user/downloads
```

**Implementation:** Integrate with file system API (if available in Tauri)

#### 5. Argument Descriptions
```javascript
// Show inline help for arguments
user@netdata % ctx add [Tab]
→ Shows: <type> - Type of item (node, alert, chart)
```

**Implementation:** Extract from command registry args metadata

#### 6. Custom Completion Providers
```javascript
// Allow commands to register custom completion logic
export const customCompletions = {
  'ctx add': async (context) => {
    // Fetch available items from API
    return await fetchAvailableNodes();
  }
};
```

**Implementation:** Plugin architecture for completion providers

---

## Performance Considerations

### Optimization Targets

- **Tab key response:** < 50ms
- **Suggestions rendering:** < 16ms (60fps)
- **Memory overhead:** < 1MB for completion state
- **Bundle size impact:** < 10KB (minified + gzipped)

### Strategies

1. **Lazy Loading:** Only load completion engine when first Tab is pressed
2. **Memoization:** Cache completion results for identical inputs
3. **Debouncing:** Debounce dynamic completions (API calls)
4. **Virtual Scrolling:** For large suggestion lists (100+ items)
5. **Web Workers:** Offload fuzzy matching to worker thread (Phase 4)

---

## Accessibility

### Keyboard Navigation

- **Tab:** Trigger completion
- **Shift+Tab:** Reverse tab (browser default, don't override)
- **Tab multiple times:** Navigate suggestions (Phase 3)
- **Enter:** Apply selected suggestion
- **Escape:** Dismiss suggestions panel
- **Ctrl+Space:** Alternative trigger for completion (consider)

### Screen Reader Support

```jsx
<div role="listbox" aria-label="Command suggestions">
  <div
    role="option"
    aria-selected={index === selectedIndex}
    aria-label={`${suggestion} - ${description}`}
  >
    {suggestion}
  </div>
</div>
```

### Visual Feedback

- Clear visual indication of selected suggestion
- High contrast colors for accessibility
- Support for reduced motion preferences
- Keyboard focus indicators

---

## Platform-Specific Considerations

### Mobile

**TERMINAL IS NOT AVAILABLE ON MOBILE**

### Desktop

**Enhancements:**
- Hover previews for suggestions
- Mouse click to select
- Richer metadata display
- Larger suggestions panel

---

## Migration & Rollout

### Phase 1 Rollout

1. Deploy behind feature flag: `ENABLE_TAB_COMPLETION`
2. Enable for internal testing (1 week)
3. Enable for beta users (1 week)
4. Full rollout

### Backwards Compatibility

- No breaking changes to existing command system
- Tab completion is additive feature
- Graceful degradation if completion fails

### Monitoring

Track metrics:
- Tab key usage frequency
- Completion acceptance rate
- Average time to complete command
- Error rates in completion engine

---

## Documentation

### User Documentation

**File:** `docs/terminal-tab-completion.md`

```markdown
# Terminal Tab Completion

## Overview
The terminal supports intelligent tab completion to help you discover and efficiently input commands.

## Basic Usage

### Single Tab Press
- **Empty input:** Shows all available commands
- **Partial command:** Completes if unambiguous, or completes common prefix
- **Complete command:** Shows subcommands or arguments

### Double Tab Press
- **Any context:** Shows all available options at current position

### Examples

**Complete a command:**
```
user@netdata % ec[TAB]
→ echo
```

**Show available commands:**
```
user@netdata % [TAB][TAB]
→ Available: ctx, tab, tile, echo, help, clear
```

**Complete subcommand:**
```
user@netdata % ctx [TAB]
→ Shows: add, remove, list, clear
```

## Keyboard Shortcuts

- `Tab` - Trigger completion
- `Tab Tab` - Show all options
- `↑` / `↓` - Navigate suggestions (when panel is visible)
- `Enter` - Apply selected suggestion
- `Esc` - Dismiss suggestions panel
```

### Developer Documentation

**File:** `docs/dev/tab-completion-api.md`

```markdown
# Tab Completion API

## Adding New Commands

To add a new command with tab completion support:

1. **Register in Command Registry** (`src/utils/commandRegistry.js`)
```javascript
export const commandRegistry = {
  // ... existing commands

  mycommand: {
    type: 'action',
    description: 'My new command',
    usage: 'mycommand <arg>',
    args: [
      { name: 'arg', type: 'string', required: true }
    ],
    examples: ['mycommand value']
  }
};
```

2. **Add Dynamic Completion (Optional)**
```javascript
mycommand: {
  // ... other properties
  dynamicCompletion: 'myCustomProvider'
}
```

3. **Implement Provider** (`src/utils/completionEngine.js`)
```javascript
function getDynamicCompletions(completionType, contextProviders, currentToken) {
  switch (completionType) {
    // ... existing cases

    case 'myCustomProvider':
      // Return array of completion strings
      return ['option1', 'option2', 'option3'];
  }
}
```

## Custom Completion Logic

For advanced completion needs, extend the `getCompletions` function or create a custom completion hook.
```

---

## Success Metrics

### Adoption Metrics
- **% of commands entered using tab completion:** Target > 40%
- **Average keystrokes saved per command:** Target > 5
- **User satisfaction score:** Target > 4.5/5

### Performance Metrics
- **P50 completion latency:** < 20ms
- **P95 completion latency:** < 50ms
- **P99 completion latency:** < 100ms

### Quality Metrics
- **Completion accuracy:** > 95%
- **Zero-result rate:** < 10%
- **Error rate:** < 0.1%

---

## Appendix

### A. Command Registry Schema

```typescript
interface CommandRegistry {
  [commandName: string]: CommandDefinition;
}

interface CommandDefinition {
  type: 'action' | 'context' | 'layout' | 'system';
  description: string;
  usage: string;
  args?: ArgumentDefinition[];
  subcommands?: {
    [subcommandName: string]: SubcommandDefinition;
  };
  dynamicCompletion?: string;
  examples?: string[];
}

interface SubcommandDefinition {
  description: string;
  usage: string;
  args?: ArgumentDefinition[];
  dynamicCompletion?: string;
  examples?: string[];
}

interface ArgumentDefinition {
  name: string;
  type: 'string' | 'number' | 'enum' | 'boolean';
  required: boolean;
  description?: string;
  values?: string[]; // For enum type
  default?: any;
}
```

### B. Completion Context Schema

```typescript
interface CompletionContext {
  parts: string[];
  currentToken: string;
  previousTokens: string[];
  isPartialToken: boolean;
  beforeCursor: string;
  afterCursor: string;
  fullInput: string;
}
```

### C. References

- [Bash Completion Documentation](https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion.html)
- [Zsh Completion System](https://zsh.sourceforge.io/Doc/Release/Completion-System.html)
- [Fish Shell Completions](https://fishshell.com/docs/current/completions.html)
- [Web Terminal Best Practices](https://github.com/xtermjs/xterm.js)

---

## Changelog

### Version 1.0 (2025-10-29)
- Initial design document
- Defined 3-phase implementation plan
- Specified command registry structure
- Outlined completion engine architecture
- Added testing strategy and success metrics

---

**End of Design Document**

