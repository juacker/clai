/**
 * Workspace State Store
 *
 * Centralized state management for tabs, commands, and layout using Zustand.
 * Persists state to SQLite via Tauri commands.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

/**
 * @typedef {Object} WorkspaceState
 * @property {string|null} activeTabId
 * @property {Object.<string, Tab>} tabs - Tabs keyed by ID
 * @property {Object.<string, Command>} commands - Commands keyed by ID
 */

/**
 * @typedef {Object} Tab
 * @property {string} id
 * @property {string} title
 * @property {number} createdAt
 * @property {TileNode} rootTile
 * @property {TabContext} context
 */

/**
 * @typedef {Object} TabContext
 * @property {Object} spaceRoom
 * @property {string|null} spaceRoom.selectedSpaceId
 * @property {string|null} spaceRoom.selectedRoomId
 */

/**
 * @typedef {Object} Command
 * @property {string} id
 * @property {string} type - 'dashboard' | 'canvas' | 'anomalies' | 'help' | 'echo'
 * @property {Object} args - Command arguments
 * @property {string} tabId
 * @property {string} tileId
 * @property {number} createdAt
 * @property {Object} state - Component-specific persistent state
 */

/**
 * @typedef {Object} TileNode
 * @property {string} id
 * @property {'leaf'|'split'} type
 * @property {string} [commandId] - Only for leaf nodes
 * @property {'horizontal'|'vertical'} [direction] - Only for split nodes
 * @property {number[]} [sizes] - Only for split nodes
 * @property {TileNode[]} [children] - Only for split nodes
 */

const DEFAULT_CONTEXT = {
  spaceRoom: {
    selectedSpaceId: null,
    selectedRoomId: null,
  },
};

/**
 * Simple debounce function for async operations
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Generate unique ID (matches existing pattern in TabManagerContext)
 * @param {string} prefix
 * @returns {string}
 */
const generateId = (prefix) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// Flag to track if database is ready
let dbReady = false;

// Debounced save to backend (300ms matches existing Dashboard/Canvas pattern)
const debouncedSave = debounce(async (state) => {
  if (!dbReady) {
    console.debug('Database not ready, skipping save');
    return;
  }

  try {
    await invoke('save_workspace_state', {
      workspaceState: {
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        commands: state.commands,
      },
    });
    console.debug('Workspace state saved');
  } catch (error) {
    console.error('Failed to save workspace state:', error);
  }
}, 300);

/**
 * Save workspace state immediately (for app close)
 * @param {Object} state - Current workspace state
 */
export const saveWorkspaceStateNow = async (state) => {
  if (!dbReady) {
    console.debug('Database not ready, skipping immediate save');
    return;
  }

  try {
    await invoke('save_workspace_state', {
      workspaceState: {
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        commands: state.commands,
      },
    });
    console.debug('Workspace state saved immediately');
  } catch (error) {
    console.error('Failed to save workspace state immediately:', error);
  }
};

export const useWorkspaceStore = create(
  devtools(
    immer((set, get) => ({
      // Initial state
      activeTabId: null,
      tabs: {},
      commands: {},
      initialized: false, // Track whether store has loaded from SQLite

      // Initialize from SQLite
      initialize: async () => {
        try {
          const state = await invoke('load_workspace_state');
          if (state && Object.keys(state.tabs).length > 0) {
            set({
              activeTabId: state.activeTabId,
              tabs: state.tabs,
              commands: state.commands,
              initialized: true,
            });
            console.debug('Workspace state loaded:', Object.keys(state.tabs).length, 'tabs');
          } else {
            set({ initialized: true });
            console.debug('Workspace state initialized (no saved tabs)');
          }
          dbReady = true;
        } catch (error) {
          console.error('Failed to load workspace state:', error);
          // Database might not be initialized yet, mark as ready anyway
          // so future saves work once DB is available
          set({ initialized: true });
          dbReady = true;
        }
      },

      // ============ Tab Actions ============

      createTab: (title = 'New Tab') => {
        const id = generateId('tab');
        const rootTileId = generateId('tile');

        set((state) => {
          state.tabs[id] = {
            id,
            title,
            createdAt: Date.now(),
            rootTile: {
              id: rootTileId,
              type: 'leaf',
              commandId: undefined,
            },
            context: { ...DEFAULT_CONTEXT },
          };
          state.activeTabId = id;
        });

        debouncedSave(get());
        return id;
      },

      closeTab: (tabId) => {
        set((state) => {
          // Remove all commands associated with this tab
          Object.keys(state.commands).forEach((cmdId) => {
            if (state.commands[cmdId].tabId === tabId) {
              delete state.commands[cmdId];
            }
          });

          // Remove tab
          delete state.tabs[tabId];

          // Update active tab if needed
          if (state.activeTabId === tabId) {
            const remainingIds = Object.keys(state.tabs);
            state.activeTabId = remainingIds.length > 0 ? remainingIds[0] : null;
          }
        });

        debouncedSave(get());
      },

      setActiveTab: (tabId) => {
        set((state) => {
          if (state.tabs[tabId]) {
            state.activeTabId = tabId;
          }
        });
        debouncedSave(get());
      },

      updateTabRootTile: (tabId, rootTile) => {
        set((state) => {
          if (state.tabs[tabId]) {
            state.tabs[tabId].rootTile = rootTile;
          }
        });
        debouncedSave(get());
      },

      updateTabContext: (tabId, contextUpdate) => {
        set((state) => {
          const tab = state.tabs[tabId];
          if (tab) {
            tab.context = { ...tab.context, ...contextUpdate };
          }
        });
        debouncedSave(get());
      },

      renameTab: (tabId, title) => {
        set((state) => {
          if (state.tabs[tabId]) {
            state.tabs[tabId].title = title;
          }
        });
        debouncedSave(get());
      },

      // ============ Command Actions ============

      createCommand: (tabId, tileId, type, args = {}, initialState = {}) => {
        const id = generateId('cmd');

        set((state) => {
          state.commands[id] = {
            id,
            type,
            args,
            tabId,
            tileId,
            createdAt: Date.now(),
            state: initialState,
          };
        });

        debouncedSave(get());
        return id;
      },

      removeCommand: (commandId) => {
        set((state) => {
          delete state.commands[commandId];
        });
        debouncedSave(get());
      },

      updateCommandState: (commandId, partialState) => {
        set((state) => {
          if (state.commands[commandId]) {
            Object.assign(state.commands[commandId].state, partialState);
          }
        });
        debouncedSave(get());
      },

      updateCommandArgs: (commandId, args) => {
        set((state) => {
          if (state.commands[commandId]) {
            state.commands[commandId].args = { ...state.commands[commandId].args, ...args };
          }
        });
        debouncedSave(get());
      },

      moveCommand: (commandId, newTileId) => {
        set((state) => {
          if (state.commands[commandId]) {
            state.commands[commandId].tileId = newTileId;
          }
        });
        debouncedSave(get());
      },

      // ============ Helper Methods ============

      /**
       * Get command by tile ID within a tab
       * @param {string} tabId
       * @param {string} tileId
       * @returns {Object|null}
       */
      getCommandByTile: (tabId, tileId) => {
        const commands = get().commands;
        return Object.values(commands).find(
          (cmd) => cmd.tabId === tabId && cmd.tileId === tileId
        ) || null;
      },
    })),
    { name: 'WorkspaceStore' }
  )
);
