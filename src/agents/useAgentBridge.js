/**
 * useAgentBridge Hook
 *
 * This hook initializes the agent bridge and registers tool handlers
 * that interact with the TabManager and Canvas.
 *
 * Usage:
 * ```jsx
 * // In App.jsx or a top-level component
 * function App() {
 *   useAgentBridge();
 *   return <...>;
 * }
 * ```
 */

import { useEffect, useRef } from 'react';
import { useTabManager } from '../contexts/TabManagerContext';
import { useCommand } from '../contexts/CommandContext';
import {
  initAgentBridge,
  cleanupAgentBridge,
  registerToolHandler,
  unregisterToolHandler,
  setAgentTab,
  getAgentTab,
  clearAgentTab,
} from './bridge';

/**
 * Generate a unique chart ID
 */
const generateChartId = () => `chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generate a unique tile ID
 */
const generateTileId = () => `tile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Hook to initialize and connect the agent bridge to TabManager
 */
export const useAgentBridge = () => {
  const tabManager = useTabManager();
  const { executeCommand } = useCommand();
  const initializedRef = useRef(false);

  // Get TabManager functions we need
  const {
    tabs,
    createTab,
    splitTile,
    closeTile,
    getTile,
    getActiveTab,
    addCanvasElement,
    removeCanvasElement,
    clearCanvasMetrics,
    getCanvasState,
  } = tabManager;

  // Store tabManager ref for handlers (avoids stale closure issues)
  const tabManagerRef = useRef(tabManager);
  tabManagerRef.current = tabManager;

  // Store executeCommand ref for handlers
  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  /**
   * Setup an agent's tab with canvas command.
   * Called BEFORE CLI starts to avoid race conditions.
   * Does NOT switch to the new tab - avoids interrupting user activity.
   *
   * @param {string} agentId - Agent identifier
   * @param {string} agentName - Human-readable agent name
   * @param {string} spaceId - Netdata space ID
   * @param {string} roomId - Netdata room ID
   * @returns {{ tabId: string }} The created/existing tab ID
   */
  const setupAgentTab = (agentId, agentName, spaceId, roomId) => {
    // Check if we already have a tab for this agent in the Map
    let tabId = getAgentTab(agentId, spaceId, roomId);

    if (tabId) {
      // Verify the tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (existingTab) {
        // Tab already exists, no need to create
        return { tabId };
      }
      // Tab was removed, clear the mapping
      clearAgentTab(agentId, spaceId, roomId);
    }

    // Also check for existing agent tab by context (handles app reload where Map is lost)
    const existingAgentTab = tabManagerRef.current.tabs.find(
      t => t.context?.agent?.agentId === agentId &&
           t.context?.spaceRoom?.selectedSpaceId === spaceId &&
           t.context?.spaceRoom?.selectedRoomId === roomId
    );

    if (existingAgentTab) {
      // Found existing tab, restore the mapping
      setAgentTab(agentId, spaceId, roomId, existingAgentTab.id);
      return { tabId: existingAgentTab.id };
    }

    // Create a new tab for this agent with bot icon
    // TODO: Redesign to avoid switching to the new tab (don't interrupt user)
    // Current limitation: createTab always switches, and executeCommand assigns
    // to the active tab. Need TabManagerContext changes to support creating
    // a tab with a command without switching.
    const title = `🤖 ${agentName}`;
    const newTab = tabManagerRef.current.createTab(title);

    // Update the tab's context with the agent's space/room
    tabManagerRef.current.updateTabContext(newTab.id, {
      spaceRoom: {
        selectedSpaceId: spaceId,
        selectedRoomId: roomId,
      },
      agent: {
        agentId,
        agentName,
      },
    });

    // Execute canvas command - assigned to the new tab's root tile
    executeCommandRef.current('canvas');

    // Store the mapping
    setAgentTab(agentId, spaceId, roomId, newTab.id);

    return { tabId: newTab.id };
  };

  /**
   * Get an agent's tab (if exists).
   * Used by tool handlers after setup.
   *
   * @param {string} agentId - Agent identifier
   * @param {string} spaceId - Netdata space ID
   * @param {string} roomId - Netdata room ID
   * @returns {string|null} Tab ID or null
   */
  const getAgentTabId = (agentId, spaceId, roomId) => {
    const tabId = getAgentTab(agentId, spaceId, roomId);
    if (tabId) {
      // Verify tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (existingTab) {
        return tabId;
      }
      // Tab was removed, clear stale mapping
      clearAgentTab(agentId, spaceId, roomId);
    }
    return null;
  };

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Initialize the bridge
    initAgentBridge();

    // Register agent setup handler (called BEFORE CLI starts)
    registerToolHandler('agent.setup', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const { agentName } = params;

      // Setup the agent's tab
      const result = setupAgentTab(agentId, agentName, spaceId, roomId);

      console.log(`[AgentBridge] Agent tab setup complete: ${result.tabId}`);
      return result;
    });

    // Register canvas tool handlers
    registerToolHandler('canvas.addChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const chartId = generateChartId();
      const spaceRoomKey = `${spaceId}_${roomId}`;

      // Add chart to canvas (type: 'context-chart' matches Canvas component expectation)
      tabManagerRef.current.addCanvasElement(tabId, {
        id: chartId,
        type: 'context-chart',
        config: {
          context: params.context,
          groupBy: params.groupBy || null,
          filterBy: params.filterBy || null,
        },
      }, spaceRoomKey);

      return { chartId };
    });

    registerToolHandler('canvas.removeChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.removeCanvasElement(tabId, params.chartId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.getCharts', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return { charts: [] };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const elements = canvasState.elements || [];

      // Map elements to chart info
      const charts = elements
        .filter(el => el.type === 'context-chart')
        .map(el => ({
          chartId: el.id,
          context: el.config?.context,
        }));

      return { charts };
    });

    registerToolHandler('canvas.clearCharts', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return { success: true };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.clearCanvasMetrics(tabId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.setTimeRange', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      // Update tab context with time range
      // The canvas component will read this from context
      tabManagerRef.current.updateTabContext(tabId, {
        canvas: {
          ...tabManagerRef.current.getTabContext(tabId)?.canvas,
          timeRange: params.range,
        },
      });

      return { success: true, range: params.range };
    });

    // Register tabs tool handlers
    registerToolHandler('tabs.splitTile', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      // Get the parent tile ID - use the root tile if not specified
      let parentTileId = params.parentTileId;

      if (!parentTileId) {
        // Get the root tile of the tab
        const tab = tabManagerRef.current.tabs.find(t => t.id === tabId);
        if (tab) {
          parentTileId = tab.rootTile.id;
        }
      }

      // Split the tile
      const result = tabManagerRef.current.splitTile(
        parentTileId,
        params.splitType
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      return { tileId: result.newTileId };
    });

    registerToolHandler('tabs.removeTile', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const result = tabManagerRef.current.closeTile(params.tileId);

      if (!result.success) {
        throw new Error(result.message);
      }

      return { success: true };
    });

    registerToolHandler('tabs.getTileLayout', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        // Return a simple layout if no tab exists
        return {
          root: {
            tileId: 'none',
            splitType: null,
            children: [],
          },
        };
      }

      const tab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Convert tile tree to layout format
      const convertTile = (tile) => {
        if (tile.type === 'leaf') {
          return {
            tileId: tile.id,
            splitType: null,
            children: [],
          };
        }

        return {
          tileId: tile.id,
          splitType: tile.direction,
          children: tile.children.map(convertTile),
        };
      };

      return {
        root: convertTile(tab.rootTile),
      };
    });

    // Cleanup on unmount
    return () => {
      // Reset the ref so handlers can be re-registered on next mount
      // (important for React StrictMode which mounts/unmounts/remounts)
      initializedRef.current = false;

      // Unregister all handlers
      unregisterToolHandler('agent.setup');
      unregisterToolHandler('canvas.addChart');
      unregisterToolHandler('canvas.removeChart');
      unregisterToolHandler('canvas.getCharts');
      unregisterToolHandler('canvas.clearCharts');
      unregisterToolHandler('canvas.setTimeRange');
      unregisterToolHandler('tabs.splitTile');
      unregisterToolHandler('tabs.removeTile');
      unregisterToolHandler('tabs.getTileLayout');

      // Note: We don't call cleanupAgentBridge here because
      // other components might still be using it. It should be
      // cleaned up at app shutdown.
    };
  }, []); // Empty deps - only run once

  // Return nothing - this hook is for side effects only
};

export default useAgentBridge;
