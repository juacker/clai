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
import {
  initWorkerBridge,
  cleanupWorkerBridge,
  registerToolHandler,
  unregisterToolHandler,
  setWorkerTab,
  getWorkerTab,
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

  /**
   * Get or create a tab for a worker
   *
   * Workers are identified by (workerId, spaceId, roomId).
   * Each worker gets at most one tab.
   */
  const getOrCreateWorkerTab = (workerId, spaceId, roomId) => {
    // Check if we already have a tab for this worker
    let tabId = getWorkerTab(workerId, spaceId, roomId);

    if (tabId) {
      // Verify the tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (existingTab) {
        return { tabId, isNew: false };
      }
      // Tab was removed, clear the mapping
      tabId = null;
    }

    // Create a new tab for this worker
    const title = `${workerId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    const newTab = tabManagerRef.current.createTab(title);

    // Update the tab's context with the worker's space/room
    tabManagerRef.current.updateTabContext(newTab.id, {
      spaceRoom: {
        selectedSpaceId: spaceId,
        selectedRoomId: roomId,
      },
      worker: {
        workerId,
      },
    });

    // Store the mapping
    setWorkerTab(workerId, spaceId, roomId, newTab.id);

    return { tabId: newTab.id, isNew: true };
  };

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Initialize the bridge
    initWorkerBridge();

    // Register canvas tool handlers
    registerToolHandler('canvas.addChart', async (request) => {
      const { workerId, spaceId, roomId, params } = request;
      const { tabId } = getOrCreateWorkerTab(workerId, spaceId, roomId);

      const chartId = generateChartId();
      const spaceRoomKey = `${spaceId}_${roomId}`;

      // Add chart to canvas
      tabManagerRef.current.addCanvasElement(tabId, {
        id: chartId,
        type: 'chart',
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
      const tabId = getWorkerTab(workerId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this worker');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.removeCanvasElement(tabId, params.chartId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.getCharts', async (request) => {
      const { workerId, spaceId, roomId } = request;
      const tabId = getWorkerTab(workerId, spaceId, roomId);

      if (!tabId) {
        return { charts: [] };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const elements = canvasState.elements || [];

      // Map elements to chart info
      const charts = elements
        .filter(el => el.type === 'chart')
        .map(el => ({
          chartId: el.id,
          context: el.config?.context,
        }));

      return { charts };
    });

    registerToolHandler('canvas.clearCharts', async (request) => {
      const { workerId, spaceId, roomId } = request;
      const tabId = getWorkerTab(workerId, spaceId, roomId);

      if (!tabId) {
        return { success: true };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.clearCanvasMetrics(tabId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.setTimeRange', async (request) => {
      const { workerId, spaceId, roomId, params } = request;
      const tabId = getWorkerTab(workerId, spaceId, roomId);

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
      const { tabId, isNew } = getOrCreateWorkerTab(workerId, spaceId, roomId);

      // Get the parent tile ID - if it's a new tab, use the root tile
      let parentTileId = params.parentTileId;

      if (isNew || !parentTileId) {
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
      const tabId = getWorkerTab(workerId, spaceId, roomId);

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
      const tabId = getWorkerTab(workerId, spaceId, roomId);

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
