/**
 * Workspace Selector Hooks
 *
 * Efficient selectors for accessing workspace state.
 * Uses useShallow for proper snapshot caching (Zustand v5).
 */

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '../stores/workspaceStore';

// Stable empty object reference to avoid creating new objects
const EMPTY_STATE = {};

/**
 * Select a specific command's state. Only re-renders when THIS command's state changes.
 * @param {string} commandId
 * @returns {Object}
 */
export const useCommandState = (commandId) => {
  const state = useWorkspaceStore((s) => s.commands[commandId]?.state);
  // Return stable empty object if no state exists
  return state ?? EMPTY_STATE;
};

/**
 * Get the update function for a command's state. Returns stable reference.
 * @param {string} commandId
 * @returns {Function}
 */
export const useUpdateCommandState = (commandId) => {
  const updateCommandState = useWorkspaceStore((state) => state.updateCommandState);
  return useCallback(
    (partialState) => updateCommandState(commandId, partialState),
    [commandId, updateCommandState]
  );
};

/**
 * Combined hook for convenience.
 * @param {string} commandId
 * @returns {[Object, Function]}
 */
export const useCommandStateManager = (commandId) => {
  const state = useCommandState(commandId);
  const updateState = useUpdateCommandState(commandId);
  return useMemo(() => [state, updateState], [state, updateState]);
};

/**
 * Select command metadata (type, args, etc). Separate from state for granular subscriptions.
 * @param {string} commandId
 * @returns {Object|null}
 */
export const useCommandMeta = (commandId) => {
  // Select the command directly - the reference is stable if the command hasn't changed
  const command = useWorkspaceStore((state) => state.commands[commandId]);
  // Memoize the derived object
  return useMemo(() => {
    if (!command) return null;
    return { id: command.id, type: command.type, args: command.args, tileId: command.tileId };
  }, [command]);
};

/**
 * Get all commands for a tab.
 * @param {string} tabId
 * @returns {Object[]}
 */
export const useTabCommands = (tabId) => {
  const commands = useWorkspaceStore((state) => state.commands);
  // Memoize the filtered array
  return useMemo(
    () => Object.values(commands).filter((cmd) => cmd.tabId === tabId),
    [commands, tabId]
  );
};

/**
 * Select tab context (MCP servers, custom context, future: directories).
 * @param {string} tabId
 * @returns {Object|null}
 */
export const useTabContext = (tabId) => {
  return useWorkspaceStore((state) => state.tabs[tabId]?.context ?? null);
};

/**
 * Select active tab.
 * @returns {Object|null}
 */
export const useActiveTab = () => {
  return useWorkspaceStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] : null
  );
};

/**
 * Select all tabs (for tab bar rendering).
 * @returns {Object}
 */
export const useTabs = () => {
  return useWorkspaceStore((state) => state.tabs);
};

/**
 * Get command by tile ID within a tab.
 * @param {string} tabId
 * @param {string} tileId
 * @returns {Object|null}
 */
export const useCommandByTile = (tabId, tileId) => {
  const commands = useWorkspaceStore((state) => state.commands);
  // Memoize the find operation
  return useMemo(() => {
    const commandList = Object.values(commands);
    return commandList.find((cmd) => cmd.tabId === tabId && cmd.tileId === tileId) ?? null;
  }, [commands, tabId, tileId]);
};

/**
 * Select active tab ID.
 * @returns {string|null}
 */
export const useActiveTabId = () => {
  return useWorkspaceStore((state) => state.activeTabId);
};

/**
 * Get workspace store actions (for components that need to dispatch actions directly)
 * Actions are stable references in Zustand, so we use useShallow for the object.
 * @returns {Object}
 */
export const useWorkspaceActions = () => {
  return useWorkspaceStore(
    useShallow((state) => ({
      createTab: state.createTab,
      closeTab: state.closeTab,
      setActiveTab: state.setActiveTab,
      updateTabRootTile: state.updateTabRootTile,
      updateTabContext: state.updateTabContext,
      renameTab: state.renameTab,
      createCommand: state.createCommand,
      removeCommand: state.removeCommand,
      updateCommandState: state.updateCommandState,
      updateCommandArgs: state.updateCommandArgs,
      moveCommand: state.moveCommand,
      initialize: state.initialize,
    }))
  );
};
