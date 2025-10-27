/**
 * Command Types for Netdata AI CLI
 *
 * This file defines all available command types that can be executed
 * through the terminal interface. Each command type corresponds to
 * a specific visualization or action in the application.
 */

// Command Categories
export const COMMAND_CATEGORIES = {
  NAVIGATION: 'navigation',
  VISUALIZATION: 'visualization',
  DATA: 'data',
  SYSTEM: 'system',
  HELP: 'help'
};

// Command Types
export const COMMAND_TYPES = {
  // Navigation commands (handled by SpaceRoomContext)
  CD: 'cd',
  LS: 'ls',
  PWD: 'pwd',

  // Visualization commands (handled by CommandContext)
  CHART: 'chart',
  DASHBOARD: 'dashboard',
  ALERTS: 'alerts',
  NODES: 'nodes',
  METRICS: 'metrics',
  LOGS: 'logs',
  EVENTS: 'events',
  TOPOLOGY: 'topology',
  HEALTH: 'health',

  // Data commands
  QUERY: 'query',
  EXPORT: 'export',
  FILTER: 'filter',

  // System commands
  CLEAR: 'clear',
  ECHO: 'echo',
  HELP: 'help',
  VERSION: 'version',
  SETTINGS: 'settings',

  // Unknown command
  UNKNOWN: 'unknown'
};

// Command Status
export const COMMAND_STATUS = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

// Command metadata - describes each command
export const COMMAND_METADATA = {
  [COMMAND_TYPES.CD]: {
    name: 'cd',
    category: COMMAND_CATEGORIES.NAVIGATION,
    description: 'Change current space or room',
    usage: 'cd <space> [room]',
    examples: [
      'cd myspace',
      'cd myspace myroom'
    ],
    handledBy: 'SpaceRoomContext'
  },
  [COMMAND_TYPES.LS]: {
    name: 'ls',
    category: COMMAND_CATEGORIES.NAVIGATION,
    description: 'List spaces or rooms',
    usage: 'ls [space]',
    examples: [
      'ls',
      'ls myspace'
    ],
    handledBy: 'SpaceRoomContext'
  },
  [COMMAND_TYPES.PWD]: {
    name: 'pwd',
    category: COMMAND_CATEGORIES.NAVIGATION,
    description: 'Print current space and room',
    usage: 'pwd',
    examples: ['pwd'],
    handledBy: 'SpaceRoomContext'
  },
  [COMMAND_TYPES.CHART]: {
    name: 'chart',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Display a chart for specific metrics',
    usage: 'chart <metric> [options]',
    examples: [
      'chart cpu',
      'chart memory --range 1h',
      'chart network --node server1'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.DASHBOARD]: {
    name: 'dashboard',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Show the main dashboard',
    usage: 'dashboard [name]',
    examples: [
      'dashboard',
      'dashboard overview',
      'dashboard custom-dash'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.ALERTS]: {
    name: 'alerts',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Display active alerts',
    usage: 'alerts [filter]',
    examples: [
      'alerts',
      'alerts --critical',
      'alerts --node server1'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.NODES]: {
    name: 'nodes',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Show node information and status',
    usage: 'nodes [filter]',
    examples: [
      'nodes',
      'nodes --online',
      'nodes --filter name=server'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.METRICS]: {
    name: 'metrics',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Display metrics overview',
    usage: 'metrics [category]',
    examples: [
      'metrics',
      'metrics system',
      'metrics network'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.LOGS]: {
    name: 'logs',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Show system logs',
    usage: 'logs [options]',
    examples: [
      'logs',
      'logs --tail 100',
      'logs --level error'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.EVENTS]: {
    name: 'events',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Display system events',
    usage: 'events [filter]',
    examples: [
      'events',
      'events --today',
      'events --type alert'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.TOPOLOGY]: {
    name: 'topology',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Show network topology',
    usage: 'topology',
    examples: ['topology'],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.HEALTH]: {
    name: 'health',
    category: COMMAND_CATEGORIES.VISUALIZATION,
    description: 'Display system health overview',
    usage: 'health [node]',
    examples: [
      'health',
      'health server1'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.QUERY]: {
    name: 'query',
    category: COMMAND_CATEGORIES.DATA,
    description: 'Query metrics data',
    usage: 'query <metric> [options]',
    examples: [
      'query cpu.usage',
      'query memory --range 24h'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.EXPORT]: {
    name: 'export',
    category: COMMAND_CATEGORIES.DATA,
    description: 'Export data to file',
    usage: 'export <type> [options]',
    examples: [
      'export metrics',
      'export alerts --format csv'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.FILTER]: {
    name: 'filter',
    category: COMMAND_CATEGORIES.DATA,
    description: 'Filter current view',
    usage: 'filter <criteria>',
    examples: [
      'filter status=critical',
      'filter node=server1'
    ],
    handledBy: 'CommandContext'
  },
  [COMMAND_TYPES.CLEAR]: {
    name: 'clear',
    category: COMMAND_CATEGORIES.SYSTEM,
    description: 'Clear terminal screen',
    usage: 'clear',
    examples: ['clear'],
    handledBy: 'Terminal'
  },
  [COMMAND_TYPES.ECHO]: {
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
  },
  [COMMAND_TYPES.HELP]: {
    name: 'help',
    category: COMMAND_CATEGORIES.HELP,
    description: 'Show help information',
    usage: 'help [command]',
    examples: [
      'help',
      'help chart',
      'help cd'
    ],
    handledBy: 'Terminal'
  },
  [COMMAND_TYPES.VERSION]: {
    name: 'version',
    category: COMMAND_CATEGORIES.SYSTEM,
    description: 'Show application version',
    usage: 'version',
    examples: ['version'],
    handledBy: 'Terminal'
  },
  [COMMAND_TYPES.SETTINGS]: {
    name: 'settings',
    category: COMMAND_CATEGORIES.SYSTEM,
    description: 'Open settings',
    usage: 'settings [section]',
    examples: [
      'settings',
      'settings theme',
      'settings notifications'
    ],
    handledBy: 'CommandContext'
  }
};

// Helper function to get command metadata
export const getCommandMetadata = (commandType) => {
  return COMMAND_METADATA[commandType] || COMMAND_METADATA[COMMAND_TYPES.UNKNOWN];
};

// Helper function to check if command is a navigation command
export const isNavigationCommand = (commandType) => {
  const metadata = getCommandMetadata(commandType);
  return metadata.category === COMMAND_CATEGORIES.NAVIGATION;
};

// Helper function to check if command is a visualization command
export const isVisualizationCommand = (commandType) => {
  const metadata = getCommandMetadata(commandType);
  return metadata.category === COMMAND_CATEGORIES.VISUALIZATION;
};

// Helper function to get all commands by category
export const getCommandsByCategory = (category) => {
  return Object.values(COMMAND_METADATA).filter(cmd => cmd.category === category);
};

