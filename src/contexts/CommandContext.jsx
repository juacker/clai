/**
 * CommandContext for Netdata AI CLI
 *
 * This context manages command execution state for the CLI interface.
 * It handles command parsing, execution, history, and output management.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { parseCommand, validateCommand, isNavigationCommand } from '../utils/commandParser';
import { COMMAND_STATUS } from '../utils/commandTypes';

const CommandContext = createContext(null);

/**
 * Hook to use the CommandContext
 * @throws {Error} If used outside of CommandProvider
 */
export const useCommand = () => {
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
export const CommandProvider = ({ children }) => {
  // Current command being executed or displayed
  const [currentCommand, setCurrentCommand] = useState(null);

  // Command history (all executed commands)
  const [commandHistory, setCommandHistory] = useState([]);

  // Current command output/result
  const [commandOutput, setCommandOutput] = useState(null);

  // Loading state for async command execution
  const [isExecuting, setIsExecuting] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // Maximum history size (prevent memory issues)
  const MAX_HISTORY_SIZE = 100;

  /**
   * Load command history from localStorage on mount
   */
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('netdata_command_history');
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
        localStorage.setItem('netdata_command_history', JSON.stringify(historyToSave));
      }
    } catch (err) {
      console.error('Error saving command history:', err);
    }
  }, [commandHistory]);

  /**
   * Execute a command
   * Parses the command string, validates it, and sets it as current
   *
   * @param {string|Object} command - Command string or parsed command object
   * @returns {Object} Parsed command object
   */
  const executeCommand = useCallback((command) => {
    try {
      setError(null);
      setIsExecuting(true);

      // Parse command if it's a string
      const parsedCommand = typeof command === 'string'
        ? parseCommand(command)
        : command;

      // Validate command
      const validation = validateCommand(parsedCommand);
      if (!validation.valid) {
        const errorMessage = validation.errors.join(', ');
        setError(errorMessage);

        // Still add to history but mark as error
        const errorCommand = {
          ...parsedCommand,
          status: COMMAND_STATUS.ERROR,
          error: errorMessage
        };

        setCommandHistory(prev => [...prev, errorCommand]);
        setCurrentCommand(errorCommand);
        setIsExecuting(false);

        return errorCommand;
      }

      // Update command status to executing
      const executingCommand = {
        ...parsedCommand,
        status: COMMAND_STATUS.EXECUTING
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
      setError(err.message);
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
   *
   * @param {*} output - Command output data
   */
  const setOutput = useCallback((output) => {
    setCommandOutput(output);

    // Update current command status to success
    if (currentCommand) {
      const updatedCommand = {
        ...currentCommand,
        status: COMMAND_STATUS.SUCCESS,
        completedAt: Date.now()
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
   * Set error for the current command
   *
   * @param {string} errorMessage - Error message
   */
  const setCommandError = useCallback((errorMessage) => {
    setError(errorMessage);

    // Update current command status to error
    if (currentCommand) {
      const updatedCommand = {
        ...currentCommand,
        status: COMMAND_STATUS.ERROR,
        error: errorMessage,
        completedAt: Date.now()
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
   * Get command from history by index
   * Supports negative indices (e.g., -1 for last command)
   *
   * @param {number} index - History index
   * @returns {Object|null} Command object or null
   */
  const getHistoryCommand = useCallback((index) => {
    if (commandHistory.length === 0) return null;

    // Handle negative indices
    const actualIndex = index < 0
      ? commandHistory.length + index
      : index;

    if (actualIndex < 0 || actualIndex >= commandHistory.length) {
      return null;
    }

    return commandHistory[actualIndex];
  }, [commandHistory]);

  /**
   * Replay a command from history
   *
   * @param {number} index - History index
   * @returns {Object|null} Replayed command or null
   */
  const replayCommand = useCallback((index) => {
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
    localStorage.removeItem('netdata_command_history');
  }, []);

  /**
   * Get filtered history (e.g., only visualization commands)
   *
   * @param {Function} filterFn - Filter function
   * @returns {Array} Filtered command history
   */
  const getFilteredHistory = useCallback((filterFn) => {
    return commandHistory.filter(filterFn);
  }, [commandHistory]);

  /**
   * Get command history excluding navigation commands
   * (useful for showing only visualization commands)
   *
   * @returns {Array} Non-navigation commands
   */
  const getVisualizationHistory = useCallback(() => {
    return commandHistory.filter(cmd => !isNavigationCommand(cmd));
  }, [commandHistory]);

  /**
   * Cancel current command execution
   */
  const cancelCommand = useCallback(() => {
    if (currentCommand) {
      const cancelledCommand = {
        ...currentCommand,
        status: COMMAND_STATUS.CANCELLED,
        completedAt: Date.now()
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

  const value = {
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
    cancelCommand
  };

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  );
};

export default CommandContext;

