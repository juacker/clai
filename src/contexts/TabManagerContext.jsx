/**
 * TabManagerContext for Netdata AI
 *
 * This context manages tabs and their tile layouts.
 * Each tab contains a tile layout (which can be split in Phase 3).
 * For Phase 1, each tab contains a single tile with one command.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useCommand } from './CommandContext';
import { useSharedSpaceRoomData } from './SharedSpaceRoomDataContext';
import { handleTabCommand } from '../utils/tabCommandHandler';

const TabManagerContext = createContext(null);

/**
 * Hook to use the TabManagerContext
 * @throws {Error} If used outside of TabManagerProvider
 */
export const useTabManager = () => {
  const context = useContext(TabManagerContext);
  if (!context) {
    throw new Error('useTabManager must be used within a TabManagerProvider');
  }
  return context;
};

/**
 * Generate a unique tab ID
 */
const generateTabId = () => `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generate a unique tile ID
 */
const generateTileId = () => `tile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Create a new tile structure
 * For Phase 1: Single leaf tile with a command
 */
const createTile = (commandId = null) => ({
  id: generateTileId(),
  type: 'leaf',
  commandId,
  // Phase 3 will add: direction, children, sizes for split tiles
});

/**
 * Extract the number from a tab title (e.g., "Tab 3" -> 3)
 * @param {string} title - Tab title
 * @returns {number|null} The extracted number or null if not found
 */
const extractTabNumber = (title) => {
  const match = title.match(/^Tab (\d+)$/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Find the next available tab number based on existing tabs
 * @param {Array} tabs - Array of existing tabs
 * @returns {number} The next available tab number
 */
const getNextTabNumber = (tabs) => {
  if (tabs.length === 0) return 1;

  // Extract all tab numbers from existing tabs
  const tabNumbers = tabs
    .map(tab => extractTabNumber(tab.title))
    .filter(num => num !== null);

  // If no numbered tabs exist, start with 1
  if (tabNumbers.length === 0) return 1;

  // Find the maximum number and add 1
  return Math.max(...tabNumbers) + 1;
};

/**
 * Create a new tab structure
 */
const createTab = (title = null, commandId = null, initialContext = null) => ({
  id: generateTabId(),
  title: title || `Tab ${Date.now()}`,
  createdAt: Date.now(),
  rootTile: createTile(commandId),
  // Tab-specific context
  context: initialContext || {
    spaceRoom: {
      selectedSpaceId: null,
      selectedRoomId: null,
    },
    customContext: {},
  },
});

/**
 * TabManagerProvider component
 * Provides tab management state and methods to the application
 */
export const TabManagerProvider = ({ children }) => {
  // All tabs
  const [tabs, setTabs] = useState([]);

  // Active tab ID
  const [activeTabId, setActiveTabId] = useState(null);

  // Active tile ID (within active tab)
  const [activeTileId, setActiveTileId] = useState(null);

  // Get current command from CommandContext
  const { currentCommand } = useCommand();

  // Get shared space/room data for default initialization
  const { spaces, getRoomsForSpace, loading: spacesLoading } = useSharedSpaceRoomData();

  // Track the last processed command ID to prevent re-processing on tab switches
  const lastProcessedCommandId = useRef(null);

  // Track if we've initialized default context
  const hasInitializedDefaults = useRef(false);

  /**
   * Load tabs from localStorage on mount
   * Includes migration for old tabs without context field
   */
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem('netdata_tabs');
      const savedActiveTabId = localStorage.getItem('netdata_active_tab_id');

      // Check for old global space/room selection from SpaceRoomContext
      const oldSelectedSpaceId = localStorage.getItem('netdata_selected_space');
      const oldSelectedRoomId = localStorage.getItem('netdata_selected_room');

      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migrate old tabs to new structure with context field
          const migratedTabs = parsed.map(tab => {
            // If tab doesn't have context field, add it with old global context
            if (!tab.context) {
              return {
                ...tab,
                context: {
                  spaceRoom: {
                    selectedSpaceId: oldSelectedSpaceId || null,
                    selectedRoomId: oldSelectedRoomId || null,
                  },
                  customContext: {},
                },
              };
            }
            // If tab has context but missing spaceRoom, add it with old global context
            if (!tab.context.spaceRoom) {
              return {
                ...tab,
                context: {
                  ...tab.context,
                  spaceRoom: {
                    selectedSpaceId: oldSelectedSpaceId || null,
                    selectedRoomId: oldSelectedRoomId || null,
                  },
                },
              };
            }
            // If tab has spaceRoom but no selection, use old global context
            if (!tab.context.spaceRoom.selectedSpaceId && oldSelectedSpaceId) {
              return {
                ...tab,
                context: {
                  ...tab.context,
                  spaceRoom: {
                    selectedSpaceId: oldSelectedSpaceId,
                    selectedRoomId: oldSelectedRoomId,
                  },
                },
              };
            }
            return tab;
          });

          setTabs(migratedTabs);
          setActiveTabId(savedActiveTabId || migratedTabs[0].id);

          // Set active tile to the root tile of active tab
          const activeTab = migratedTabs.find(t => t.id === (savedActiveTabId || migratedTabs[0].id));
          if (activeTab) {
            setActiveTileId(activeTab.rootTile.id);
          }
        }
      }
    } catch (err) {
      console.error('Error loading tabs from localStorage:', err);
      // If there's an error, clear localStorage and start fresh
      localStorage.removeItem('netdata_tabs');
      localStorage.removeItem('netdata_active_tab_id');
    }
  }, []);

  /**
   * Save tabs to localStorage whenever they change
   */
  useEffect(() => {
    try {
      if (tabs.length > 0) {
        localStorage.setItem('netdata_tabs', JSON.stringify(tabs));
        if (activeTabId) {
          localStorage.setItem('netdata_active_tab_id', activeTabId);
        }
      } else {
        localStorage.removeItem('netdata_tabs');
        localStorage.removeItem('netdata_active_tab_id');
      }
    } catch (err) {
      console.error('Error saving tabs to localStorage:', err);
    }
  }, [tabs, activeTabId]);

  /**
   * Initialize default space/room context for tabs without selection
   * Runs when spaces are loaded and tabs exist
   */
  useEffect(() => {
    // Skip if already initialized, no tabs, spaces not loaded, or still loading
    if (hasInitializedDefaults.current || tabs.length === 0 || !spaces || spaces.length === 0 || spacesLoading) {
      return;
    }

    // Check if any tab needs default context
    const needsDefaults = tabs.some(tab =>
      !tab.context?.spaceRoom?.selectedSpaceId || !tab.context?.spaceRoom?.selectedRoomId
    );

    if (!needsDefaults) {
      hasInitializedDefaults.current = true;
      return;
    }

    // Initialize defaults: first space + "All Nodes" room
    const initializeDefaults = async () => {
      try {
        const firstSpace = spaces[0];
        if (!firstSpace) return;

        // Fetch rooms for the first space
        const rooms = await getRoomsForSpace(firstSpace.id);
        if (!rooms || rooms.length === 0) return;

        // Find "All Nodes" room (case-insensitive)
        const allNodesRoom = rooms.find(room =>
          room.name?.toLowerCase() === 'all nodes'
        ) || rooms[0]; // Fallback to first room if "All Nodes" not found

        console.log('[TabManagerContext] Initializing default context:', {
          space: firstSpace.name,
          room: allNodesRoom.name,
        });

        // Update all tabs that don't have space/room selection
        setTabs(prev =>
          prev.map(tab => {
            if (!tab.context?.spaceRoom?.selectedSpaceId || !tab.context?.spaceRoom?.selectedRoomId) {
              return {
                ...tab,
                context: {
                  ...tab.context,
                  spaceRoom: {
                    selectedSpaceId: firstSpace.id,
                    selectedRoomId: allNodesRoom.id,
                  },
                },
              };
            }
            return tab;
          })
        );

        hasInitializedDefaults.current = true;
      } catch (error) {
        console.error('[TabManagerContext] Error initializing default context:', error);
      }
    };

    initializeDefaults();
  }, [tabs, spaces, spacesLoading, getRoomsForSpace]);

  /**
   * When a new command is executed, add it to the active tile
   * If no tabs exist, create the first tab automatically
   */
  useEffect(() => {
    // Only process if we have a command and it's different from the last one we processed
    if (currentCommand && currentCommand.id !== lastProcessedCommandId.current) {
      // Mark this command as processed
      lastProcessedCommandId.current = currentCommand.id;

      // If no tabs exist, create the first tab
      if (tabs.length === 0) {
        const newTab = createTab('Tab 1', currentCommand.id);
        setTabs([newTab]);
        setActiveTabId(newTab.id);
        setActiveTileId(newTab.rootTile.id);
        return; // Exit early, the tab is created with the command
      }

      // If tabs exist, add command to active tile
      if (activeTabId && activeTileId) {
        setTabs(prev =>
          prev.map(tab => {
            if (tab.id === activeTabId) {
              return {
                ...tab,
                rootTile: {
                  ...tab.rootTile,
                  commandId: currentCommand.id,
                },
              };
            }
            return tab;
          })
        );
      }
    }
  }, [currentCommand, tabs.length, activeTabId, activeTileId]);

  /**
   * Create a new tab
   * @param {string} title - Optional tab title
   * @param {string} commandId - Optional command ID to add to the tab
   * @returns {Object} The created tab
   */
  const createNewTab = useCallback((title = null, commandId = null) => {
    // Calculate next available tab number if no title provided
    const tabTitle = title || `Tab ${getNextTabNumber(tabs)}`;

    // Inherit context from the currently active tab
    let inheritedContext = null;
    if (activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab?.context) {
        // Deep clone the context to avoid reference issues
        inheritedContext = {
          spaceRoom: {
            selectedSpaceId: activeTab.context.spaceRoom?.selectedSpaceId || null,
            selectedRoomId: activeTab.context.spaceRoom?.selectedRoomId || null,
          },
          customContext: { ...activeTab.context.customContext },
        };
      }
    }

    const newTab = createTab(tabTitle, commandId, inheritedContext);

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActiveTileId(newTab.rootTile.id);

    return newTab;
  }, [tabs, activeTabId]);

  /**
   * Close a tab
   * @param {string} tabId - Tab ID to close
   */
  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== tabId);

      // If closing active tab, switch to another tab
      if (tabId === activeTabId) {
        if (filtered.length > 0) {
          const newActiveTab = filtered[filtered.length - 1];
          setActiveTabId(newActiveTab.id);
          setActiveTileId(newActiveTab.rootTile.id);
        } else {
          setActiveTabId(null);
          setActiveTileId(null);
        }
      }

      return filtered;
    });
  }, [activeTabId]);

  /**
   * Switch to a tab
   * @param {string} tabId - Tab ID to switch to
   */
  const switchToTab = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setActiveTileId(tab.rootTile.id);
    }
  }, [tabs]);

  /**
   * Switch to tab by index (1-based)
   * @param {number} index - Tab index (1-based)
   */
  const switchToTabByIndex = useCallback((index) => {
    if (index > 0 && index <= tabs.length) {
      const tab = tabs[index - 1];
      switchToTab(tab.id);
    }
  }, [tabs, switchToTab]);

  /**
   * Switch to next tab
   */
  const switchToNextTab = useCallback(() => {
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    switchToTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, switchToTab]);

  /**
   * Switch to previous tab
   */
  const switchToPrevTab = useCallback(() => {
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    switchToTab(tabs[prevIndex].id);
  }, [tabs, activeTabId, switchToTab]);

  /**
   * Rename a tab
   * @param {string} tabId - Tab ID to rename
   * @param {string} newTitle - New tab title
   */
  const renameTab = useCallback((tabId, newTitle) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId ? { ...tab, title: newTitle } : tab
      )
    );
  }, []);

  /**
   * Move/reorder a tab
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Destination index
   */
  const moveTab = useCallback((fromIndex, toIndex) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return newTabs;
    });
  }, []);

  /**
   * Add a command to the active tile
   * @param {Object} command - Command object from CommandContext
   */
  const addCommandToActiveTile = useCallback((command) => {
    if (!activeTabId || !activeTileId) return;

    setTabs(prev =>
      prev.map(tab => {
        if (tab.id === activeTabId) {
          return {
            ...tab,
            rootTile: {
              ...tab.rootTile,
              commandId: command.id,
            },
          };
        }
        return tab;
      })
    );
  }, [activeTabId, activeTileId]);

  /**
   * Get the active tab
   * @returns {Object|null} Active tab or null
   */
  const getActiveTab = useCallback(() => {
    return tabs.find(t => t.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  /**
   * Get a tab by ID
   * @param {string} tabId - Tab ID
   * @returns {Object|null} Tab or null
   */
  const getTab = useCallback((tabId) => {
    return tabs.find(t => t.id === tabId) || null;
  }, [tabs]);

  /**
   * Clear all tabs
   */
  const clearAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    setActiveTileId(null);
  }, []);

  /**
   * Update tab context
   * @param {string} tabId - Tab ID
   * @param {Object} context - Partial context update
   */
  const updateTabContext = useCallback((tabId, context) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.id === tabId
          ? {
            ...tab,
            context: {
              ...tab.context,
              ...context,
            },
          }
          : tab
      )
    );
  }, []);

  /**
   * Get tab context
   * @param {string} tabId - Tab ID
   * @returns {Object|null} Tab context or null
   */
  const getTabContext = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    return tab?.context || null;
  }, [tabs]);

  /**
   * Get active tab context
   * @returns {Object|null} Active tab context or null
   */
  const getActiveTabContext = useCallback(() => {
    if (!activeTabId) return null;
    return getTabContext(activeTabId);
  }, [activeTabId, getTabContext]);

  /**
   * Duplicate a tab
   * @param {string} tabId - Tab ID to duplicate
   * @returns {Object} The duplicated tab
   */
  const duplicateTab = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return null;

    const newTab = {
      ...tab,
      id: generateTabId(),
      title: `${tab.title} (Copy)`,
      createdAt: Date.now(),
      rootTile: {
        ...tab.rootTile,
        id: generateTileId(),
      },
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActiveTileId(newTab.rootTile.id);

    return newTab;
  }, [tabs]);

  /**
   * Handle tab layout commands from terminal
   * @param {Object} command - Parsed command object
   * @returns {Object} Result object with success status and message
   */
  const handleLayoutCommand = useCallback((command) => {
    const { type, args } = command;

    try {
      switch (type) {
        case 'tab': {
          // Delegate to handleTabCommand with tabManager context
          const tabManager = {
            tabs,
            activeTabId,
            createTab: createNewTab,
            closeTab,
            switchToTab,
            switchToTabByIndex,
            switchToNextTab,
            switchToPrevTab,
            renameTab,
            duplicateTab,
            resetTab: (tabId) => {
              // Placeholder for Phase 3
              return { success: true, message: 'Tab reset (Phase 3)' };
            },
          };
          return handleTabCommand(command, tabManager);
        }

        case 'reset-all': {
          // reset-all - Clear all tabs
          clearAllTabs();
          return {
            success: true,
            message: 'All tabs cleared'
          };
        }

        // Phase 3 commands (placeholders for now)
        case 'split-v':
        case 'split-h':
        case 'tile':
        case 'tile-close':
        case 'tile-resize':
          return {
            success: false,
            message: `Command '${type}' will be implemented in Phase 3 (Tiling)`
          };

        default:
          return {
            success: false,
            message: `Unknown layout command: ${type}`
          };
      }
    } catch (error) {
      console.error('Error handling layout command:', error);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }, [tabs, activeTabId, createNewTab, switchToTabByIndex, switchToNextTab, switchToPrevTab, closeTab, renameTab, duplicateTab, clearAllTabs]);

  const value = {
    // State
    tabs,
    activeTabId,
    activeTileId,

    // Tab Management
    createTab: createNewTab,
    closeTab,
    switchToTab,
    switchToTabByIndex,
    switchToNextTab,
    switchToPrevTab,
    renameTab,
    moveTab,
    duplicateTab,
    clearAllTabs,

    // Getters
    getActiveTab,
    getTab,

    // Context Management (NEW)
    updateTabContext,
    getTabContext,
    getActiveTabContext,

    // Command Integration
    addCommandToActiveTile,
    handleLayoutCommand,

    // Tile Management (Phase 3 will expand these)
    setActiveTile: setActiveTileId,
  };

  return (
    <TabManagerContext.Provider value={value}>
      {children}
    </TabManagerContext.Provider>
  );
};

export default TabManagerContext;

