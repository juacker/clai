/**
 * CommandContext for the CLAI command interface.
 *
 * This context manages command execution state, history, and output.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { parseCommand } from '../utils/commandParser';
import type { ParsedCommand } from '../utils/commandParser';
import { COMMAND_STATUS } from '../utils/commandTypes';

// A parsed command plus the execution-lifecycle fields this context layers on.
export interface CommandRecord extends ParsedCommand {
  completedAt?: number;
}

export interface CommandContextValue {
  currentCommand: CommandRecord | null;
  commandHistory: CommandRecord[];
  commandOutput: unknown;
  isExecuting: boolean;
  error: string | null;
  executeCommand: (command: string | CommandRecord) => CommandRecord | null;
  clearCommand: () => void;
  setOutput: (output: unknown) => void;
  setCommandError: (errorMessage: string) => void;
  getHistoryCommand: (index: number) => CommandRecord | null;
  replayCommand: (index: number) => CommandRecord | null;
  clearHistory: () => void;
  getFilteredHistory: (filterFn: (cmd: CommandRecord) => boolean) => CommandRecord[];
  getVisualizationHistory: () => CommandRecord[];
  cancelCommand: () => void;
  getCommand: (commandId: string | null | undefined) => CommandRecord | null;
}

const CommandContext = createContext<CommandContextValue | null>(null);
const COMMAND_HISTORY_KEY = 'clai_command_history';
const LEGACY_COMMAND_HISTORY_KEY = 'netdata_command_history';

/**
 * Hook to use the CommandContext
 * @throws If used outside of CommandProvider
 */
export const useCommand = (): CommandContextValue => {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error('useCommand must be used within a CommandProvider');
  }
  return context;
};

/**
 * CommandProvider component
 * Provides command execution state and methods to the application
 */
export const CommandProvider = ({ children }: { children: React.ReactNode }) => {
  // Current command being executed or displayed
  const [currentCommand, setCurrentCommand] = useState<CommandRecord | null>(null);

  // Command history (all executed commands)
  const [commandHistory, setCommandHistory] = useState<CommandRecord[]>([]);

  // Current command output/result
  const [commandOutput, setCommandOutput] = useState<unknown>(null);

  // Loading state for async command execution
  const [isExecuting, setIsExecuting] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Maximum history size (prevent memory issues)
  const MAX_HISTORY_SIZE = 100;

  /**
   * Load command history from localStorage on mount
   */
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(COMMAND_HISTORY_KEY)
        || localStorage.getItem(LEGACY_COMMAND_HISTORY_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setCommandHistory(Array.isArray(parsed) ? parsed : []);
      }
    } catch (err) {
      console.error('Error loading command history:', err);
    }
  }, []);

  /**
   * Save command history to localStorage
   */
  useEffect(() => {
    try {
      if (commandHistory.length > 0) {
        // Only save last MAX_HISTORY_SIZE commands
        const historyToSave = commandHistory.slice(-MAX_HISTORY_SIZE);
        localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(historyToSave));
      }
    } catch (err) {
      console.error('Error saving command history:', err);
    }
  }, [commandHistory]);

  /**
   * Execute a command. Parses the command string and sets it as current.
   */
  const executeCommand = useCallback((command: string | CommandRecord): CommandRecord | null => {
    try {
      setError(null);
      setIsExecuting(true);

      // Parse command if it's a string
      const parsedCommand: CommandRecord = typeof command === 'string'
        ? parseCommand(command)
        : command;

      // Check for empty command
      if (!parsedCommand.name) {
        const errorMessage = 'Empty command';
        setError(errorMessage);

        const errorCommand: CommandRecord = {
          ...parsedCommand,
          status: COMMAND_STATUS.ERROR,
          error: errorMessage,
        };

        setCommandHistory(prev => [...prev, errorCommand]);
        setCurrentCommand(errorCommand);
        setIsExecuting(false);

        return errorCommand;
      }

      // Update command status to executing
      const executingCommand: CommandRecord = {
        ...parsedCommand,
        status: COMMAND_STATUS.EXECUTING,
      };

      // Set as current command
      setCurrentCommand(executingCommand);

      // Add to history
      setCommandHistory(prev => {
        const newHistory = [...prev, executingCommand];
        // Keep only last MAX_HISTORY_SIZE commands
        return newHistory.slice(-MAX_HISTORY_SIZE);
      });

      setIsExecuting(false);

      return executingCommand;
    } catch (err) {
      console.error('Error executing command:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsExecuting(false);
      return null;
    }
  }, []);

  /**
   * Clear the current command and output
   */
  const clearCommand = useCallback(() => {
    setCurrentCommand(null);
    setCommandOutput(null);
    setError(null);
  }, []);

  /**
   * Set output for the current command
   */
  const setOutput = useCallback((output: unknown) => {
    setCommandOutput(output);

    // Update current command status to success using functional updates
    setCurrentCommand(prev => {
      if (!prev) return prev;

      const updatedCommand: CommandRecord = {
        ...prev,
        status: COMMAND_STATUS.SUCCESS,
        completedAt: Date.now(),
      };

      // Update in history
      setCommandHistory(history =>
        history.map(cmd =>
          cmd.id === updatedCommand.id ? updatedCommand : cmd
        )
      );

      return updatedCommand;
    });
  }, []);

  /**
   * Set error for the current command
   */
  const setCommandError = useCallback((errorMessage: string) => {
    setError(errorMessage);

    // Update current command status to error
    if (currentCommand) {
      const updatedCommand: CommandRecord = {
        ...currentCommand,
        status: COMMAND_STATUS.ERROR,
        error: errorMessage,
        completedAt: Date.now(),
      };
      setCurrentCommand(updatedCommand);

      // Update in history
      setCommandHistory(prev =>
        prev.map(cmd =>
          cmd.id === updatedCommand.id ? updatedCommand : cmd
        )
      );
    }
  }, [currentCommand]);

  /**
   * Get command from history by index.
   * Supports negative indices (e.g., -1 for last command).
   */
  const getHistoryCommand = useCallback((index: number): CommandRecord | null => {
    if (commandHistory.length === 0) return null;

    // Handle negative indices
    const actualIndex = index < 0
      ? commandHistory.length + index
      : index;

    if (actualIndex < 0 || actualIndex >= commandHistory.length) {
      return null;
    }

    return commandHistory[actualIndex] ?? null;
  }, [commandHistory]);

  /**
   * Replay a command from history
   */
  const replayCommand = useCallback((index: number): CommandRecord | null => {
    const command = getHistoryCommand(index);
    if (command) {
      return executeCommand(command);
    }
    return null;
  }, [getHistoryCommand, executeCommand]);

  /**
   * Clear command history
   */
  const clearHistory = useCallback(() => {
    setCommandHistory([]);
    localStorage.removeItem(COMMAND_HISTORY_KEY);
    localStorage.removeItem(LEGACY_COMMAND_HISTORY_KEY);
  }, []);

  /**
   * Get filtered history (e.g., only visualization commands)
   */
  const getFilteredHistory = useCallback((filterFn: (cmd: CommandRecord) => boolean): CommandRecord[] => {
    return commandHistory.filter(filterFn);
  }, [commandHistory]);

  /**
   * Get command history excluding navigation commands
   * (useful for showing only visualization commands)
   */
  const isNavigationCommand = (cmd: CommandRecord | undefined): boolean => {
    const navigationTypes = ['navigate', 'open', 'switch', 'back', 'forward'];
    return navigationTypes.includes(cmd?.type ?? '') || (cmd?.type?.endsWith('_navigation') ?? false);
  };

  const getVisualizationHistory = useCallback((): CommandRecord[] => {
    return commandHistory.filter(cmd => !isNavigationCommand(cmd));
  }, [commandHistory]);

  /**
   * Cancel current command execution
   */
  const cancelCommand = useCallback(() => {
    if (currentCommand) {
      const cancelledCommand: CommandRecord = {
        ...currentCommand,
        status: COMMAND_STATUS.CANCELLED,
        completedAt: Date.now(),
      };
      setCurrentCommand(cancelledCommand);

      // Update in history
      setCommandHistory(prev =>
        prev.map(cmd =>
          cmd.id === cancelledCommand.id ? cancelledCommand : cmd
        )
      );
    }

    setIsExecuting(false);
    setError(null);
  }, [currentCommand]);

  /**
   * Get a command by ID from history
   */
  const getCommand = useCallback((commandId: string | null | undefined): CommandRecord | null => {
    if (!commandId) return null;
    return commandHistory.find(cmd => cmd.id === commandId) || null;
  }, [commandHistory]);

  const value = useMemo<CommandContextValue>(() => ({
    // State
    currentCommand,
    commandHistory,
    commandOutput,
    isExecuting,
    error,

    // Methods
    executeCommand,
    clearCommand,
    setOutput,
    setCommandError,
    getHistoryCommand,
    replayCommand,
    clearHistory,
    getFilteredHistory,
    getVisualizationHistory,
    cancelCommand,
    getCommand,
  }), [
    currentCommand,
    commandHistory,
    commandOutput,
    isExecuting,
    error,
    executeCommand,
    clearCommand,
    setOutput,
    setCommandError,
    getHistoryCommand,
    replayCommand,
    clearHistory,
    getFilteredHistory,
    getVisualizationHistory,
    cancelCommand,
    getCommand,
  ]);

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  );
};

export default CommandContext;
