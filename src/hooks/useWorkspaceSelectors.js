/**
 * Workspace Selector Hooks
 *
 * Efficient selectors for accessing workspace state.
 * Uses shallow comparison to prevent unnecessary re-renders.
 */

import { useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useWorkspaceStore } from '../stores/workspaceStore';

/**
 * Select a specific command's state. Only re-renders when THIS command's state changes.
 * @param {string} commandId
 * @returns {Object}
 */
export const useCommandState = (commandId) => {
  return useWorkspaceStore(
    useCallback((state) => state.commands[commandId]?.state ?? {}, [commandId]),
    shallow
  );
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
  return [state, updateState];
};

/**
 * Select command metadata (type, args, etc). Separate from state for granular subscriptions.
 * @param {string} commandId
 * @returns {Object|null}
 */
export const useCommandMeta = (commandId) => {
  return useWorkspaceStore(
    useCallback(
      (state) => {
        const cmd = state.commands[commandId];
        if (!cmd) return null;
        return { id: cmd.id, type: cmd.type, args: cmd.args, tileId: cmd.tileId };
      },
      [commandId]
    ),
    shallow
  );
};

/**
 * Get all commands for a tab.
 * @param {string} tabId
 * @returns {Object[]}
 */
export const useTabCommands = (tabId) => {
  return useWorkspaceStore(
    useCallback(
      (state) => Object.values(state.commands).filter((cmd) => cmd.tabId === tabId),
      [tabId]
    ),
    shallow
  );
};

/**
 * Select tab context (space/room, future: directories, mcpServers).
 * @param {string} tabId
 * @returns {Object|null}
 */
export const useTabContext = (tabId) => {
  return useWorkspaceStore(
    useCallback((state) => state.tabs[tabId]?.context ?? null, [tabId]),
    shallow
  );
};

/**
 * Select active tab.
 * @returns {Object|null}
 */
export const useActiveTab = () => {
  return useWorkspaceStore(
    (state) => (state.activeTabId ? state.tabs[state.activeTabId] : null),
    shallow
  );
};

/**
 * Select all tabs (for tab bar rendering).
 * @returns {Object}
 */
export const useTabs = () => {
  return useWorkspaceStore((state) => state.tabs, shallow);
};

/**
 * Get command by tile ID within a tab.
 * @param {string} tabId
 * @param {string} tileId
 * @returns {Object|null}
 */
export const useCommandByTile = (tabId, tileId) => {
  return useWorkspaceStore(
    useCallback(
      (state) => {
        const commands = Object.values(state.commands);
        return commands.find((cmd) => cmd.tabId === tabId && cmd.tileId === tileId) ?? null;
      },
      [tabId, tileId]
    ),
    shallow
  );
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
 * @returns {Object}
 */
export const useWorkspaceActions = () => {
  return useWorkspaceStore(
    (state) => ({
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
    }),
    shallow
  );
};
