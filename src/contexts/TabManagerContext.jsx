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
import { handleTileCommand } from '../utils/tileCommandHandler';

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
 * Create a new leaf tile (contains a command)
 * @param {string|null} commandId - Command ID to display in this tile
 * @returns {Object} Leaf tile structure
 */
const createLeafTile = (commandId = null) => ({
  id: generateTileId(),
  type: 'leaf',
  commandId,
});

/**
 * Create a new split tile (contains child tiles)
 * @param {string} direction - 'horizontal' or 'vertical'
 * @param {Array} children - Array of child tiles
 * @param {Array} sizes - Array of percentage sizes for children (e.g., [50, 50])
 * @returns {Object} Split tile structure
 */
const createSplitTile = (direction, children, sizes = null) => {
  // Auto-calculate equal sizes if not provided
  const tileCount = children.length;
  const defaultSizes = Array(tileCount).fill(100 / tileCount);

  return {
    id: generateTileId(),
    type: 'split',
    direction, // 'horizontal' | 'vertical'
    children,
    sizes: sizes || defaultSizes,
  };
};

/**
 * Create a new tile structure (defaults to leaf)
 * For backward compatibility
 */
const createTile = (commandId = null) => createLeafTile(commandId);

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
 * Recursively find a tile by ID in a tile tree
 * @param {Object} tile - Root tile to search from
 * @param {string} tileId - Tile ID to find
 * @returns {Object|null} Found tile or null
 */
const findTileById = (tile, tileId) => {
  if (tile.id === tileId) {
    return tile;
  }

  if (tile.type === 'split' && tile.children) {
    for (const child of tile.children) {
      const found = findTileById(child, tileId);
      if (found) return found;
    }
  }

  return null;
};

/**
 * Recursively find the parent of a tile in a tile tree
 * @param {Object} tile - Root tile to search from
 * @param {string} tileId - Tile ID to find parent of
 * @returns {Object|null} Parent tile or null
 */
const findParentTile = (tile, tileId) => {
  if (tile.type === 'split' && tile.children) {
    // Check if any child matches the target ID
    if (tile.children.some(child => child.id === tileId)) {
      return tile;
    }

    // Recursively search in children
    for (const child of tile.children) {
      const found = findParentTile(child, tileId);
      if (found) return found;
    }
  }

  return null;
};

/**
 * Split a tile into two tiles
 * @param {Object} tile - Tile to split
 * @param {string} direction - 'horizontal' or 'vertical'
 * @param {string|null} newCommandId - Command ID for the new tile
 * @returns {Object} New split tile
 */
const splitTileInternal = (tile, direction, newCommandId = null) => {
  // Create a new tile for the existing content
  const existingTile = { ...tile };

  // Create a new empty tile
  const newTile = createLeafTile(newCommandId);

  // Return a split tile containing both
  return createSplitTile(direction, [existingTile, newTile], [50, 50]);
};

/**
 * Remove a tile from a split tile's children
 * @param {Object} splitTile - Parent split tile
 * @param {string} tileIdToRemove - ID of tile to remove
 * @returns {Object|null} Updated split tile or the remaining child if only one left
 */
const removeTileFromSplit = (splitTile, tileIdToRemove) => {
  if (splitTile.type !== 'split') {
    return splitTile;
  }

  // Filter out the tile to remove
  const remainingChildren = splitTile.children.filter(
    child => child.id !== tileIdToRemove
  );

  // If only one child remains, return it directly (collapse the split)
  if (remainingChildren.length === 1) {
    return remainingChildren[0];
  }

  // If multiple children remain, update the split tile
  if (remainingChildren.length > 1) {
    // Recalculate sizes to distribute evenly
    const newSizes = remainingChildren.map(() => 100 / remainingChildren.length);
    return {
      ...splitTile,
      children: remainingChildren,
      sizes: newSizes,
    };
  }

  // If no children remain (shouldn't happen), return null
  return null;
};

/**
 * Update a tile's size in a split tile
 * @param {Object} splitTile - Parent split tile
 * @param {string} tileId - ID of tile to resize
 * @param {number} newSize - New size percentage (0-100)
 * @returns {Object} Updated split tile
 */
const updateTileSize = (splitTile, tileId, newSize) => {
  if (splitTile.type !== 'split') {
    return splitTile;
  }

  const tileIndex = splitTile.children.findIndex(child => child.id === tileId);
  if (tileIndex === -1) {
    return splitTile;
  }

  // Calculate new sizes
  const newSizes = [...splitTile.sizes];
  const oldSize = newSizes[tileIndex];
  const sizeDiff = newSize - oldSize;

  // Adjust the target tile size
  newSizes[tileIndex] = newSize;

  // Distribute the difference among other tiles proportionally
  const otherIndices = newSizes
    .map((_, idx) => idx)
    .filter(idx => idx !== tileIndex);

  if (otherIndices.length > 0) {
    const totalOtherSize = otherIndices.reduce((sum, idx) => sum + newSizes[idx], 0);

    otherIndices.forEach(idx => {
      const proportion = newSizes[idx] / totalOtherSize;
      newSizes[idx] = newSizes[idx] - (sizeDiff * proportion);
    });
  }

  return {
    ...splitTile,
    sizes: newSizes,
  };
};

/**
 * Recursively clone a tile tree with new IDs
 * @param {Object} tile - Tile to clone
 * @returns {Object} Cloned tile with new IDs
 */
const cloneTileTree = (tile) => {
  if (tile.type === 'leaf') {
    return {
      ...tile,
      id: generateTileId(),
    };
  }

  if (tile.type === 'split') {
    return {
      ...tile,
      id: generateTileId(),
      children: tile.children.map(cloneTileTree),
    };
  }

  return tile;
};

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

  // Cache for default space/room to use when creating new tabs
  const defaultSpaceRoom = useRef(null);

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
   * Initialize and cache default space/room when spaces are loaded
   * This cache is used when creating new tabs without explicit context
   */
  useEffect(() => {
    // Skip if already initialized, spaces not loaded, or still loading
    if (defaultSpaceRoom.current || !spaces || spaces.length === 0 || spacesLoading) {
      return;
    }

    // Initialize defaults: first space + "All Nodes" room
    const initializeDefaultCache = async () => {
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

        // Cache the default space/room
        defaultSpaceRoom.current = {
          selectedSpaceId: firstSpace.id,
          selectedRoomId: allNodesRoom.id,
        };

        console.log('[TabManagerContext] Cached default space/room:', {
          space: firstSpace.name,
          room: allNodesRoom.name,
        });
      } catch (error) {
        console.error('[TabManagerContext] Error caching default space/room:', error);
      }
    };

    initializeDefaultCache();
  }, [spaces, spacesLoading, getRoomsForSpace]);

  /**
   * Initialize default space/room context for existing tabs without selection
   * Runs once when default cache is populated and tabs exist
   */
  useEffect(() => {
    // Skip if already initialized, no default cache, or no tabs
    if (hasInitializedDefaults.current || !defaultSpaceRoom.current || tabs.length === 0) {
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

    console.log('[TabManagerContext] Initializing existing tabs with default context');

    // Update all tabs that don't have space/room selection
    setTabs(prev =>
      prev.map(tab => {
        if (!tab.context?.spaceRoom?.selectedSpaceId || !tab.context?.spaceRoom?.selectedRoomId) {
          return {
            ...tab,
            context: {
              ...tab.context,
              spaceRoom: {
                selectedSpaceId: defaultSpaceRoom.current.selectedSpaceId,
                selectedRoomId: defaultSpaceRoom.current.selectedRoomId,
              },
            },
          };
        }
        return tab;
      })
    );

    hasInitializedDefaults.current = true;
  }, [tabs, defaultSpaceRoom.current]);

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
              // Recursively update the active tile in the tree
              const updateTileTree = (tile) => {
                if (tile.id === activeTileId) {
                  // Found the active tile, update its commandId
                  return {
                    ...tile,
                    commandId: currentCommand.id,
                  };
                }
                if (tile.type === 'split' && tile.children) {
                  // Recursively search children
                  return {
                    ...tile,
                    children: tile.children.map(updateTileTree),
                  };
                }
                return tile;
              };

              return {
                ...tab,
                rootTile: updateTileTree(tab.rootTile),
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

    // Determine context for the new tab
    let tabContext = null;

    // Priority 1: Inherit context from the currently active tab
    if (activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab?.context?.spaceRoom?.selectedSpaceId && activeTab?.context?.spaceRoom?.selectedRoomId) {
        // Deep clone the context to avoid reference issues
        tabContext = {
          spaceRoom: {
            selectedSpaceId: activeTab.context.spaceRoom.selectedSpaceId,
            selectedRoomId: activeTab.context.spaceRoom.selectedRoomId,
          },
          customContext: { ...activeTab.context.customContext },
        };
      }
    }

    // Priority 2: Use cached default space/room if available and no context inherited
    if (!tabContext && defaultSpaceRoom.current) {
      tabContext = {
        spaceRoom: {
          selectedSpaceId: defaultSpaceRoom.current.selectedSpaceId,
          selectedRoomId: defaultSpaceRoom.current.selectedRoomId,
        },
        customContext: {},
      };
    }

    const newTab = createTab(tabTitle, commandId, tabContext);

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
   * @returns {string|null} The ID of the tab switched to, or null if no tabs
   */
  const switchToNextTab = useCallback(() => {
    if (tabs.length === 0) return null;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;

    const nextTabId = tabs[nextIndex].id;
    switchToTab(nextTabId);
    return nextTabId;
  }, [tabs, activeTabId, switchToTab]);

  /**
   * Switch to previous tab
   * @returns {string|null} The ID of the tab switched to, or null if no tabs
   */
  const switchToPrevTab = useCallback(() => {
    if (tabs.length === 0) return null;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;

    const prevTabId = tabs[prevIndex].id;
    switchToTab(prevTabId);
    return prevTabId;
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
   * Split a tile in the active tab
   * @param {string} tileId - Tile ID to split
   * @param {string} direction - 'horizontal' or 'vertical'
   * @param {string} newCommandId - Optional command ID for the new tile
   * @returns {Object|null} Result with success status and new tile ID
   */
  const splitTile = useCallback((tileId, direction, newCommandId = null) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) {
      return { success: false, message: 'Active tab not found' };
    }

    // Find the tile to split
    const tileToSplit = findTileById(activeTab.rootTile, tileId);
    if (!tileToSplit) {
      return { success: false, message: 'Tile not found' };
    }

    // Create the split tile
    const splitTileResult = splitTileInternal(tileToSplit, direction, newCommandId);

    // Update the tile tree
    const updateTileTree = (tile) => {
      if (tile.id === tileId) {
        return splitTileResult;
      }
      if (tile.type === 'split' && tile.children) {
        return {
          ...tile,
          children: tile.children.map(updateTileTree),
        };
      }
      return tile;
    };

    const updatedRootTile = updateTileTree(activeTab.rootTile);

    // Update the tab
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, rootTile: updatedRootTile }
          : tab
      )
    );

    // Set the new tile as active (second child of the split)
    const newTileId = splitTileResult.children[1].id;
    setActiveTileId(newTileId);

    return {
      success: true,
      message: `Tile split ${direction}`,
      newTileId,
    };
  }, [activeTabId, tabs]);

  /**
   * Close a tile in the active tab
   * @param {string} tileId - Tile ID to close
   * @returns {Object} Result with success status
   */
  const closeTile = useCallback((tileId) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) {
      return { success: false, message: 'Active tab not found' };
    }

    // Can't close the root tile if it's the only one
    if (activeTab.rootTile.id === tileId && activeTab.rootTile.type === 'leaf') {
      return { success: false, message: 'Cannot close the only tile in a tab' };
    }

    // Find the parent of the tile to close
    const parent = findParentTile(activeTab.rootTile, tileId);

    if (!parent) {
      // If no parent, this is the root tile
      return { success: false, message: 'Cannot close root tile' };
    }

    // Remove the tile from its parent
    const updatedParent = removeTileFromSplit(parent, tileId);

    // Update the tile tree
    const updateTileTree = (tile) => {
      if (tile.id === parent.id) {
        return updatedParent;
      }
      if (tile.type === 'split' && tile.children) {
        return {
          ...tile,
          children: tile.children.map(updateTileTree),
        };
      }
      return tile;
    };

    let updatedRootTile = updateTileTree(activeTab.rootTile);

    // If the root was updated and it's now a leaf (collapsed), use it directly
    if (updatedRootTile.id === parent.id && updatedParent.type === 'leaf') {
      updatedRootTile = updatedParent;
    }

    // Update the tab
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, rootTile: updatedRootTile }
          : tab
      )
    );

    // If the closed tile was active, set a new active tile
    if (tileId === activeTileId) {
      // Find the first leaf tile in the updated tree
      const findFirstLeaf = (tile) => {
        if (tile.type === 'leaf') return tile.id;
        if (tile.type === 'split' && tile.children.length > 0) {
          return findFirstLeaf(tile.children[0]);
        }
        return null;
      };

      const newActiveTileId = findFirstLeaf(updatedRootTile);
      if (newActiveTileId) {
        setActiveTileId(newActiveTileId);
      }
    }

    return { success: true, message: 'Tile closed' };
  }, [activeTabId, activeTileId, tabs]);

  /**
   * Resize a tile in the active tab
   * @param {string} tileId - Tile ID to resize
   * @param {number} newSize - New size percentage (0-100)
   * @returns {Object} Result with success status
   */
  const resizeTile = useCallback((tileId, newSize) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) {
      return { success: false, message: 'Active tab not found' };
    }

    // Find the parent of the tile to resize
    const parent = findParentTile(activeTab.rootTile, tileId);

    if (!parent || parent.type !== 'split') {
      return { success: false, message: 'Tile cannot be resized (no parent split)' };
    }

    // Update the tile sizes
    const updatedParent = updateTileSize(parent, tileId, newSize);

    // Update the tile tree
    const updateTileTree = (tile) => {
      if (tile.id === parent.id) {
        return updatedParent;
      }
      if (tile.type === 'split' && tile.children) {
        return {
          ...tile,
          children: tile.children.map(updateTileTree),
        };
      }
      return tile;
    };

    const updatedRootTile = updateTileTree(activeTab.rootTile);

    // Update the tab
    setTabs(prev =>
      prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, rootTile: updatedRootTile }
          : tab
      )
    );

    return { success: true, message: 'Tile resized' };
  }, [activeTabId, tabs]);

  /**
   * Get a tile by ID in the active tab
   * @param {string} tileId - Tile ID
   * @returns {Object|null} Tile or null
   */
  const getTile = useCallback((tileId) => {
    if (!activeTabId) return null;

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;

    return findTileById(activeTab.rootTile, tileId);
  }, [activeTabId, tabs]);

  /**
   * Get all leaf tiles in the active tab
   * @returns {Array} Array of leaf tiles
   */
  const getLeafTiles = useCallback(() => {
    if (!activeTabId) return [];

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return [];

    const leafTiles = [];
    const collectLeafTiles = (tile) => {
      if (tile.type === 'leaf') {
        leafTiles.push(tile);
      } else if (tile.type === 'split' && tile.children) {
        tile.children.forEach(collectLeafTiles);
      }
    };

    collectLeafTiles(activeTab.rootTile);
    return leafTiles;
  }, [activeTabId, tabs]);

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
      // Deep clone context to prevent reference sharing
      context: {
        spaceRoom: {
          selectedSpaceId: tab.context?.spaceRoom?.selectedSpaceId || null,
          selectedRoomId: tab.context?.spaceRoom?.selectedRoomId || null,
        },
        customContext: { ...tab.context?.customContext || {} },
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

        case 'tile': {
          // Delegate to handleTileCommand with tileManager context
          const tileManager = {
            tabs,
            activeTabId,
            activeTileId,
            splitTile,
            closeTile,
            resizeTile,
            focusTile: setActiveTileId,
            focusNextTile: () => {
              const leafTiles = getLeafTiles();
              if (leafTiles.length === 0) return false;
              const currentIndex = leafTiles.findIndex(t => t.id === activeTileId);
              const nextIndex = (currentIndex + 1) % leafTiles.length;
              setActiveTileId(leafTiles[nextIndex].id);
              return true;
            },
            focusPrevTile: () => {
              const leafTiles = getLeafTiles();
              if (leafTiles.length === 0) return false;
              const currentIndex = leafTiles.findIndex(t => t.id === activeTileId);
              const prevIndex = currentIndex === 0 ? leafTiles.length - 1 : currentIndex - 1;
              setActiveTileId(leafTiles[prevIndex].id);
              return true;
            },
          };
          return handleTileCommand(command, tileManager);
        }

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
  }, [tabs, activeTabId, activeTileId, createNewTab, switchToTab, switchToTabByIndex, switchToNextTab, switchToPrevTab, closeTab, renameTab, duplicateTab, clearAllTabs, splitTile, closeTile, resizeTile, getLeafTiles]);

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

    // Tile Management (Phase 3)
    setActiveTile: setActiveTileId,
    splitTile,
    closeTile,
    resizeTile,
    getTile,
    getLeafTiles,

    // Tile Navigation
    focusNextTile: () => {
      const leafTiles = getLeafTiles();
      if (leafTiles.length === 0) return false;
      const currentIndex = leafTiles.findIndex(t => t.id === activeTileId);
      const nextIndex = (currentIndex + 1) % leafTiles.length;
      setActiveTileId(leafTiles[nextIndex].id);
      return true;
    },
    focusPrevTile: () => {
      const leafTiles = getLeafTiles();
      if (leafTiles.length === 0) return false;
      const currentIndex = leafTiles.findIndex(t => t.id === activeTileId);
      const prevIndex = currentIndex === 0 ? leafTiles.length - 1 : currentIndex - 1;
      setActiveTileId(leafTiles[prevIndex].id);
      return true;
    },
  };

  return (
    <TabManagerContext.Provider value={value}>
      {children}
    </TabManagerContext.Provider>
  );
};

export default TabManagerContext;

