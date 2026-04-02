/**
 * Command parser for the CLAI terminal interface.
 *
 * Lightweight command parser that converts command strings into structured objects.
 * Philosophy: parse, don't validate. Let the registry handle command existence.
 */

import { COMMAND_STATUS } from './commandTypes';

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
 * Parse a command string into a structured command object
 *
 * @param {string} commandString - The raw command string
 * @returns {Object} Parsed command object
 *
 * @example
 * parseCommand('metrics --range 1h')
 * // Returns:
 * // {
 * //   id: 'cmd_1234567890_abc123',
 * //   type: 'metrics',
 * //   raw: 'metrics --range 1h',
 * //   name: 'metrics',
 * //   args: {
 * //     options: { range: '1h' },
 * //     positional: []
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
      type: '',
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

  // First part is the command name (normalized to lowercase)
  const commandName = (parts[0] || '').toLowerCase().trim();

  // Rest are arguments
  const argParts = parts.slice(1);
  const args = parseArguments(argParts);

  return {
    id: generateCommandId(),
    type: commandName, // Type is just the command name
    raw: commandString,
    name: commandName,
    args,
    timestamp: Date.now(),
    status: COMMAND_STATUS.PENDING
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
 * Check if a command is a layout command
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a layout command
 */
export const isLayoutCommand = (command) => {
  return ['tab', 'tile', 'reset-all'].includes(command.type);
};
