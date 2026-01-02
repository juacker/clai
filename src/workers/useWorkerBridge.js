/**
 * useWorkerBridge Hook
 *
 * This hook initializes the worker bridge and registers tool handlers
 * that interact with the TabManager and Canvas.
 *
 * Usage:
 * ```jsx
 * // In App.jsx or a top-level component
 * function App() {
 *   useWorkerBridge();
 *   return <...>;
 * }
 * ```
 */

import { useEffect, useRef } from 'react';
import { useTabManager } from '../contexts/TabManagerContext';
import { useCommand } from '../contexts/CommandContext';
import {
  initWorkerBridge,
  cleanupWorkerBridge,
  registerToolHandler,
  unregisterToolHandler,
  setWorkerTab,
  getWorkerTab,
  clearWorkerTab,
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
 * Hook to initialize and connect the worker bridge to TabManager
 */
export const useWorkerBridge = () => {
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
   * Setup a worker's tab with canvas command.
   * Called BEFORE CLI starts to avoid race conditions.
   * Does NOT switch to the new tab - avoids interrupting user activity.
   *
   * @param {string} workerId - Worker identifier
   * @param {string} workerName - Human-readable worker name
   * @param {string} spaceId - Netdata space ID
   * @param {string} roomId - Netdata room ID
   * @returns {{ tabId: string }} The created/existing tab ID
   */
  const setupWorkerTab = (workerId, workerName, spaceId, roomId) => {
    // Check if we already have a tab for this worker in the Map
    let tabId = getWorkerTab(workerId, spaceId, roomId);

    if (tabId) {
      // Verify the tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (existingTab) {
        // Tab already exists, no need to create
        return { tabId };
      }
      // Tab was removed, clear the mapping
      clearWorkerTab(workerId, spaceId, roomId);
    }

    // Also check for existing worker tab by context (handles app reload where Map is lost)
    const existingWorkerTab = tabManagerRef.current.tabs.find(
      t => t.context?.worker?.workerId === workerId &&
           t.context?.spaceRoom?.selectedSpaceId === spaceId &&
           t.context?.spaceRoom?.selectedRoomId === roomId
    );

    if (existingWorkerTab) {
      // Found existing tab, restore the mapping
      setWorkerTab(workerId, spaceId, roomId, existingWorkerTab.id);
      return { tabId: existingWorkerTab.id };
    }

    // Create a new tab for this worker with bot icon 🤖
    // TODO: Redesign to avoid switching to the new tab (don't interrupt user)
    // Current limitation: createTab always switches, and executeCommand assigns
    // to the active tab. Need TabManagerContext changes to support creating
    // a tab with a command without switching.
    const title = `🤖 ${workerName}`;
    const newTab = tabManagerRef.current.createTab(title);

    // Update the tab's context with the worker's space/room
    tabManagerRef.current.updateTabContext(newTab.id, {
      spaceRoom: {
        selectedSpaceId: spaceId,
        selectedRoomId: roomId,
      },
      worker: {
        workerId,
        workerName,
      },
    });

    // Execute canvas command - assigned to the new tab's root tile
    executeCommandRef.current('canvas');

    // Store the mapping
    setWorkerTab(workerId, spaceId, roomId, newTab.id);

    return { tabId: newTab.id };
  };

  /**
   * Get a worker's tab (if exists).
   * Used by tool handlers after setup.
   *
   * @param {string} workerId - Worker identifier
   * @param {string} spaceId - Netdata space ID
   * @param {string} roomId - Netdata room ID
   * @returns {string|null} Tab ID or null
   */
  const getWorkerTabId = (workerId, spaceId, roomId) => {
    const tabId = getWorkerTab(workerId, spaceId, roomId);
    if (tabId) {
      // Verify tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (existingTab) {
        return tabId;
      }
      // Tab was removed, clear stale mapping
      clearWorkerTab(workerId, spaceId, roomId);
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
    initWorkerBridge();

    // Register worker setup handler (called BEFORE CLI starts)
    registerToolHandler('worker.setup', async (request) => {
      const { workerId, spaceId, roomId, params } = request;
      const { workerName } = params;

      // Setup the worker's tab
      const result = setupWorkerTab(workerId, workerName, spaceId, roomId);

      console.log(`[WorkerBridge] Worker tab setup complete: ${result.tabId}`);
      return result;
    });

    // Register canvas tool handlers
    registerToolHandler('canvas.addChart', async (request) => {
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker. Call worker.setup first.');
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
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.removeCanvasElement(tabId, params.chartId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.getCharts', async (request) => {
      const { workerId, spaceId, roomId } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

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
      const { workerId, spaceId, roomId } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        return { success: true };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.clearCanvasMetrics(tabId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.setTimeRange', async (request) => {
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker');
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
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker. Call worker.setup first.');
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
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker');
      }

      const result = tabManagerRef.current.closeTile(params.tileId);

      if (!result.success) {
        throw new Error(result.message);
      }

      return { success: true };
    });

    registerToolHandler('tabs.getTileLayout', async (request) => {
      const { workerId, spaceId, roomId } = request;
      const tabId = getWorkerTabId(workerId, spaceId, roomId);

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
      unregisterToolHandler('worker.setup');
      unregisterToolHandler('canvas.addChart');
      unregisterToolHandler('canvas.removeChart');
      unregisterToolHandler('canvas.getCharts');
      unregisterToolHandler('canvas.clearCharts');
      unregisterToolHandler('canvas.setTimeRange');
      unregisterToolHandler('tabs.splitTile');
      unregisterToolHandler('tabs.removeTile');
      unregisterToolHandler('tabs.getTileLayout');

      // Note: We don't call cleanupWorkerBridge here because
      // other components might still be using it. It should be
      // cleaned up at app shutdown.
    };
  }, []); // Empty deps - only run once

  // Return nothing - this hook is for side effects only
};

export default useWorkerBridge;
