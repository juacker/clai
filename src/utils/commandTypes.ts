/**
 * Command Types for CLAI terminal commands
 *
 * Simplified command type definitions.
 * Only includes commands that are actually used in the system.
 *
 * Philosophy: Lightweight & Minimalistic
 * - No over-engineering for future features
 * - Only define what exists and is used
 * - Command components are registered in commandRegistry.ts
 */

// Command Status
export const COMMAND_STATUS = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled',
} as const;

export type CommandStatus = (typeof COMMAND_STATUS)[keyof typeof COMMAND_STATUS];

// System Commands (handled by Terminal)
export const SYSTEM_COMMANDS = {
  CLEAR: 'clear',
  HELP: 'help',
  CTX: 'ctx',
} as const;

// Layout Commands (handled by TabManagerContext)
export const LAYOUT_COMMANDS = {
  TAB: 'tab',
  TILE: 'tile',
  RESET_ALL: 'reset-all',
} as const;

// Content Commands (create entry in CommandRegistry, display in tiles)
export const CONTENT_COMMANDS = {
  ANOMALIES: 'anomalies',
  CANVAS: 'canvas',
  DASHBOARD: 'dashboard',
  HELP: 'help',
  ECHO: 'echo',
  CHAT: 'chat',
} as const;

/** Minimal shape the command predicates need. */
export interface CommandLike {
  type: string;
}

/**
 * Check if a command is a layout command
 */
export const isLayoutCommand = (command: CommandLike): boolean => {
  return (Object.values(LAYOUT_COMMANDS) as string[]).includes(command.type);
};

/**
 * Check if a command is a system command
 */
export const isSystemCommand = (command: CommandLike): boolean => {
  return (Object.values(SYSTEM_COMMANDS) as string[]).includes(command.type);
};

/**
 * Check if a command is a content command
 * Content commands create entries in CommandRegistry and render in tiles
 */
export const isContentCommand = (command: CommandLike): boolean => {
  return (Object.values(CONTENT_COMMANDS) as string[]).includes(command.type);
};
