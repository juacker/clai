/**
 * Command Types for Netdata AI CLI
 *
 * Simplified command type definitions.
 * Only includes commands that are actually used in the system.
 *
 * Philosophy: Lightweight & Minimalistic
 * - No over-engineering for future features
 * - Only define what exists and is used
 * - Command components are registered in commandRegistry.js
 */

// Command Status
export const COMMAND_STATUS = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

// System Commands (handled by Terminal)
export const SYSTEM_COMMANDS = {
  CLEAR: 'clear',
  HELP: 'help',
  VERSION: 'version',
  CTX: 'ctx'
};

// Layout Commands (handled by TabManagerContext)
export const LAYOUT_COMMANDS = {
  TAB: 'tab',
  TILE: 'tile',
  RESET_ALL: 'reset-all'
};

// Content Commands (create entry in CommandRegistry, display in tiles)
export const CONTENT_COMMANDS = {
  CANVAS: 'canvas',
  DASHBOARD: 'dashboard',
  ANOMALIES: 'anomalies',
  HELP: 'help',
  ECHO: 'echo',
  CHAT: 'chat'
};

/**
 * Check if a command is a layout command
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a layout command
 */
export const isLayoutCommand = (command) => {
  return Object.values(LAYOUT_COMMANDS).includes(command.type);
};

/**
 * Check if a command is a system command
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a system command
 */
export const isSystemCommand = (command) => {
  return Object.values(SYSTEM_COMMANDS).includes(command.type);
};

/**
 * Check if a command is a content command
 * Content commands create entries in CommandRegistry and render in tiles
 * @param {Object} command - Command object
 * @returns {boolean} True if it's a content command
 */
export const isContentCommand = (command) => {
  return Object.values(CONTENT_COMMANDS).includes(command.type);
};

