/**
 * TabManagerContext for Netdata AI
 *
 * This context manages tabs and their tile layouts.
 * Each tab contains a tile layout (which can be split in Phase 3).
 * For Phase 1, each tab contains a single tile with one command.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useCommand } from './CommandContext';

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
const createTab = (title = null, commandId = null) => ({
  id: generateTabId(),
  title: title || `Tab ${Date.now()}`,
  createdAt: Date.now(),
  rootTile: createTile(commandId),
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

  // Track the last processed command ID to prevent re-processing on tab switches
  const lastProcessedCommandId = useRef(null);

  /**
   * Load tabs from localStorage on mount
   */
  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem('netdata_tabs');
      const savedActiveTabId = localStorage.getItem('netdata_active_tab_id');

      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTabs(parsed);
          setActiveTabId(savedActiveTabId || parsed[0].id);

          // Set active tile to the root tile of active tab
          const activeTab = parsed.find(t => t.id === (savedActiveTabId || parsed[0].id));
          if (activeTab) {
            setActiveTileId(activeTab.rootTile.id);
          }
        }
      }
    } catch (err) {
      console.error('Error loading tabs from localStorage:', err);
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
    const newTab = createTab(tabTitle, commandId);

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActiveTileId(newTab.rootTile.id);

    return newTab;
  }, [tabs]);

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

    // Command Integration
    addCommandToActiveTile,

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

