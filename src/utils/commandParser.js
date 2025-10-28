/**
 * Command Parser for Netdata AI CLI
 *
 * This module provides utilities for parsing command strings into
 * structured command objects that can be executed by the application.
 */

import { COMMAND_TYPES, COMMAND_STATUS } from './commandTypes';

/**
 * Generate a unique command ID
 */
const generateCommandId = () => {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Parse command line arguments into key-value pairs
 * Supports both --flag and --key=value formats
 *
 * @param {string[]} args - Array of argument strings
 * @returns {Object} Parsed options and positional arguments
 */
export const parseArguments = (args) => {
  const options = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle --key=value format
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      options[key] = valueParts.join('=');
    }
    // Handle --flag or --key value format
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value (doesn't start with --)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[i + 1];
        i++; // Skip next arg since we consumed it
      } else {
        // It's a boolean flag
        options[key] = true;
      }
    }
    // Handle -f format (short flags)
    else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      // Check if next arg is a value
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[key] = args[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    }
    // Positional argument
    else {
      positional.push(arg);
    }
  }

  return { options, positional };
};

/**
 * Determine command type from command name
 *
 * @param {string} commandName - The command name
 * @returns {string} Command type from COMMAND_TYPES
 */
export const getCommandType = (commandName) => {
  const normalized = commandName.toLowerCase().trim();

  // Check if it matches any known command type
  const matchedType = Object.values(COMMAND_TYPES).find(
    type => type === normalized
  );

  return matchedType || COMMAND_TYPES.UNKNOWN;
};

/**
 * Parse a command string into a structured command object
 *
 * @param {string} commandString - The raw command string
 * @returns {Object} Parsed command object
 *
 * @example
 * parseCommand('chart cpu --range 1h --node server1')
 * // Returns:
 * // {
 * //   id: 'cmd_1234567890_abc123',
 * //   type: 'chart',
 * //   raw: 'chart cpu --range 1h --node server1',
 * //   name: 'chart',
 * //   args: {
 * //     options: { range: '1h', node: 'server1' },
 * //     positional: ['cpu']
 * //   },
 * //   timestamp: 1234567890,
 * //   status: 'pending'
 * // }
 */
export const parseCommand = (commandString) => {
  // Trim and handle empty commands
  const trimmed = commandString.trim();
  if (!trimmed) {
    return {
      id: generateCommandId(),
      type: COMMAND_TYPES.UNKNOWN,
      raw: commandString,
      name: '',
      args: { options: {}, positional: [] },
      timestamp: Date.now(),
      status: COMMAND_STATUS.PENDING,
      error: 'Empty command'
    };
  }

  // Split command into parts, respecting quoted strings
  const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];

  // First part is the command name
  const commandName = parts[0] || '';
  const commandType = getCommandType(commandName);

  // Rest are arguments
  const argParts = parts.slice(1);
  const args = parseArguments(argParts);

  return {
    id: generateCommandId(),
    type: commandType,
    raw: commandString,
    name: commandName,
    args,
    timestamp: Date.now(),
    status: COMMAND_STATUS.PENDING
  };
};

/**
 * Validate a parsed command
 *
 * @param {Object} command - Parsed command object
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateCommand = (command) => {
  const errors = [];

  if (!command) {
    errors.push('Command is null or undefined');
    return { valid: false, errors };
  }

  if (!command.name) {
    errors.push('Command name is required');
  }

  if (command.type === COMMAND_TYPES.UNKNOWN) {
    errors.push(`Unknown command: ${command.name}`);
  }

  // Add specific validation rules for different command types
  switch (command.type) {
    case COMMAND_TYPES.CHART:
      if (command.args.positional.length === 0) {
        errors.push('Chart command requires a metric name');
      }
      break;

    case COMMAND_TYPES.CD:
      if (command.args.positional.length === 0) {
        errors.push('cd command requires a space name');
      }
      break;

    case COMMAND_TYPES.QUERY:
      if (command.args.positional.length === 0) {
        errors.push('Query command requires a metric name');
      }
      break;

    // Add more validation rules as needed
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Format a command object back to a string
 *
 * @param {Object} command - Command object
 * @returns {string} Formatted command string
 */
export const formatCommand = (command) => {
  if (!command) return '';

  let formatted = command.name;

  // Add positional arguments
  if (command.args?.positional?.length > 0) {
    formatted += ' ' + command.args.positional.join(' ');
  }

  // Add options
  if (command.args?.options) {
    for (const [key, value] of Object.entries(command.args.options)) {
      if (value === true) {
        formatted += ` --${key}`;
      } else {
        formatted += ` --${key}=${value}`;
      }
    }
  }

  return formatted;
};

/**
 * Get command suggestions based on partial input
 *
 * @param {string} partial - Partial command string
 * @returns {string[]} Array of suggested commands
 */
export const getCommandSuggestions = (partial) => {
  if (!partial) {
    return Object.values(COMMAND_TYPES).filter(
      type => type !== COMMAND_TYPES.UNKNOWN
    );
  }

  const normalized = partial.toLowerCase().trim();
  const parts = normalized.split(' ');

  // If only typing the command name, suggest matching commands
  if (parts.length === 1) {
    return Object.values(COMMAND_TYPES)
      .filter(type => type !== COMMAND_TYPES.UNKNOWN)
      .filter(type => type.startsWith(normalized))
      .sort();
  }

  // If typing arguments, could suggest common options
  // This can be extended based on command type
  return [];
};

/**
 * Check if a command is a navigation command
 *
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a navigation command
 */
export const isNavigationCommand = (command) => {
  return [
    COMMAND_TYPES.CD,
    COMMAND_TYPES.LS,
    COMMAND_TYPES.PWD
  ].includes(command.type);
};

/**
 * Check if a command is a visualization command
 *
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a visualization command
 */
export const isVisualizationCommand = (command) => {
  return [
    COMMAND_TYPES.CHART,
    COMMAND_TYPES.DASHBOARD,
    COMMAND_TYPES.ALERTS,
    COMMAND_TYPES.NODES,
    COMMAND_TYPES.METRICS,
    COMMAND_TYPES.LOGS,
    COMMAND_TYPES.EVENTS,
    COMMAND_TYPES.TOPOLOGY,
    COMMAND_TYPES.HEALTH
  ].includes(command.type);
};

/**
 * Extract space and room from cd command
 *
 * @param {Object} command - Parsed cd command
 * @returns {Object} { space: string, room: string|null }
 */
export const extractNavigationTarget = (command) => {
  if (command.type !== COMMAND_TYPES.CD) {
    return { space: null, room: null };
  }

  const [space, room] = command.args.positional;

  return {
    space: space || null,
    room: room || null
  };
};

/**
 * Check if a command is a layout command (tab/tile management)
 *
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a layout command
 */
export const isLayoutCommand = (command) => {
  return [
    COMMAND_TYPES.TAB,
    COMMAND_TYPES.TAB_CLOSE,
    COMMAND_TYPES.TAB_RENAME,
    COMMAND_TYPES.TAB_LIST,
    COMMAND_TYPES.TAB_RESET,
    COMMAND_TYPES.TAB_DUPLICATE,
    COMMAND_TYPES.SPLIT_V,
    COMMAND_TYPES.SPLIT_H,
    COMMAND_TYPES.TILE,
    COMMAND_TYPES.TILE_CLOSE,
    COMMAND_TYPES.TILE_RESIZE,
    COMMAND_TYPES.RESET_ALL
  ].includes(command.type);
};

