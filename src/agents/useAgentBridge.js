/**
 * useAgentBridge Hook
 *
 * This hook initializes the agent bridge and registers tool handlers
 * that interact with the TabManager, Dashboard, and Canvas.
 *
 * Tool Categories:
 * - agent.* - Agent lifecycle (setup)
 * - dashboard.* - Chart management (addChart, removeChart, etc.)
 * - tabs.* - Tile layout management (splitTile, removeTile, etc.)
 * - canvas.* - Node-based canvas (addChart, addStatusBadge, addText, addEdge, etc.)
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
 * Generate a unique node ID
 */
const generateNodeId = (prefix = 'node') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generate a unique edge ID
 */
const generateEdgeId = (sourceId, targetId) => `edge_${sourceId}_${targetId}_${Date.now()}`;

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
    addDashboardElement,
    removeDashboardElement,
    clearDashboardMetrics,
    getDashboardState,
    getCanvasState,
    setCanvasState,
  } = tabManager;

  // Store tabManager ref for handlers (avoids stale closure issues)
  const tabManagerRef = useRef(tabManager);
  tabManagerRef.current = tabManager;

  // Store executeCommand ref for handlers
  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  /**
   * Setup an agent's tab with dashboard command.
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

    // Execute canvas command - agents communicate visually through canvas
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

    // Register dashboard tool handlers
    registerToolHandler('dashboard.addChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const chartId = generateChartId();
      const spaceRoomKey = `${spaceId}_${roomId}`;

      // Add chart to dashboard (type: 'context-chart' matches Dashboard component expectation)
      tabManagerRef.current.addDashboardElement(tabId, {
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

    registerToolHandler('dashboard.removeChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.removeDashboardElement(tabId, params.chartId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('dashboard.getCharts', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return { charts: [] };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const dashboardState = tabManagerRef.current.getDashboardState(tabId, spaceRoomKey);
      const elements = dashboardState.elements || [];

      // Map elements to chart info
      const charts = elements
        .filter(el => el.type === 'context-chart')
        .map(el => ({
          chartId: el.id,
          context: el.config?.context,
        }));

      return { charts };
    });

    registerToolHandler('dashboard.clearCharts', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return { success: true };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      tabManagerRef.current.clearDashboardMetrics(tabId, spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('dashboard.setTimeRange', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      // Update tab context with time range
      // The dashboard component will read this from context
      tabManagerRef.current.updateTabContext(tabId, {
        dashboard: {
          ...tabManagerRef.current.getTabContext(tabId)?.dashboard,
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

    // =========================================================================
    // Canvas Tool Handlers
    // =========================================================================

    registerToolHandler('canvas.addChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      console.log('[Agent Canvas] addChart called:', { agentId, params });
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const nodeId = generateNodeId('chart');

      // Get current canvas state
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      // Create the chart node
      const newNode = {
        id: nodeId,
        type: 'chart',
        position: { x: params.x, y: params.y },
        data: {
          context: params.context,
          title: params.title || null,
          groupBy: params.groupBy || [],
          filterBy: params.filterBy || {},
          timeRange: params.timeRange || '15m',
          width: params.width || 400,
          height: params.height || 300,
        },
      };

      // Update canvas state
      tabManagerRef.current.setCanvasState(
        tabId,
        [...currentNodes, newNode],
        currentEdges,
        spaceRoomKey
      );

      console.log('[Agent Canvas] addChart success:', { nodeId, totalNodes: currentNodes.length + 1 });
      return { nodeId };
    });

    registerToolHandler('canvas.addStatusBadge', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      console.log('[Agent Canvas] addStatusBadge called:', { agentId, params });
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const nodeId = generateNodeId('badge');

      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      const newNode = {
        id: nodeId,
        type: 'statusBadge',
        position: { x: params.x, y: params.y },
        data: {
          status: params.status,
          message: params.message,
          title: params.title || null,
          showTimestamp: false,
          timestamp: new Date().toISOString(),
        },
      };

      tabManagerRef.current.setCanvasState(
        tabId,
        [...currentNodes, newNode],
        currentEdges,
        spaceRoomKey
      );

      console.log('[Agent Canvas] addStatusBadge success:', { nodeId, status: params.status, totalNodes: currentNodes.length + 1 });
      return { nodeId };
    });

    registerToolHandler('canvas.addText', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      console.log('[Agent Canvas] addText called:', { agentId, text: params.text?.substring(0, 50), size: params.size });
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const nodeId = generateNodeId('text');

      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      const newNode = {
        id: nodeId,
        type: 'text',
        position: { x: params.x, y: params.y },
        data: {
          text: params.text,
          size: params.size || 'medium',
          color: params.color || null,
          backgroundColor: params.backgroundColor || null,
          align: 'left',
          showHandles: true,
        },
      };

      tabManagerRef.current.setCanvasState(
        tabId,
        [...currentNodes, newNode],
        currentEdges,
        spaceRoomKey
      );

      console.log('[Agent Canvas] addText success:', { nodeId, totalNodes: currentNodes.length + 1 });
      return { nodeId };
    });

    registerToolHandler('canvas.addEdge', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      console.log('[Agent Canvas] addEdge called:', { agentId, sourceId: params.sourceId, targetId: params.targetId });
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const edgeId = generateEdgeId(params.sourceId, params.targetId);

      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      const newEdge = {
        id: edgeId,
        source: params.sourceId,
        target: params.targetId,
        type: 'smoothstep',
        animated: params.animated !== false,
        label: params.label || undefined,
      };

      tabManagerRef.current.setCanvasState(
        tabId,
        currentNodes,
        [...currentEdges, newEdge],
        spaceRoomKey
      );

      console.log('[Agent Canvas] addEdge success:', { edgeId, totalEdges: currentEdges.length + 1 });
      return { edgeId };
    });

    registerToolHandler('canvas.removeNode', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      // Remove node and any connected edges
      const filteredNodes = currentNodes.filter(n => n.id !== params.nodeId);
      const filteredEdges = currentEdges.filter(
        e => e.source !== params.nodeId && e.target !== params.nodeId
      );

      tabManagerRef.current.setCanvasState(
        tabId,
        filteredNodes,
        filteredEdges,
        spaceRoomKey
      );

      return { success: true };
    });

    registerToolHandler('canvas.removeEdge', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const currentNodes = canvasState.nodes || [];
      const currentEdges = canvasState.edges || [];

      const filteredEdges = currentEdges.filter(e => e.id !== params.edgeId);

      tabManagerRef.current.setCanvasState(
        tabId,
        currentNodes,
        filteredEdges,
        spaceRoomKey
      );

      return { success: true };
    });

    registerToolHandler('canvas.getNodes', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return [];
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const nodes = canvasState.nodes || [];

      // Return simplified node info
      return nodes.map(n => ({
        nodeId: n.id,
        nodeType: n.type,
        x: n.position?.x || 0,
        y: n.position?.y || 0,
      }));
    });

    registerToolHandler('canvas.clearCanvas', async (request) => {
      const { agentId, spaceId, roomId } = request;
      console.log('[Agent Canvas] clearCanvas called:', { agentId });
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        console.log('[Agent Canvas] clearCanvas: No tab found, returning success');
        return { success: true };
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const prevState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      console.log('[Agent Canvas] clearCanvas: Clearing', { prevNodes: prevState.nodes?.length || 0, prevEdges: prevState.edges?.length || 0 });
      tabManagerRef.current.setCanvasState(tabId, [], [], spaceRoomKey);

      return { success: true };
    });

    registerToolHandler('canvas.getNodeDetails', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const nodes = canvasState.nodes || [];

      const node = nodes.find(n => n.id === params.nodeId);
      if (!node) {
        throw new Error(`Node not found: ${params.nodeId}`);
      }

      return {
        nodeId: node.id,
        nodeType: node.type,
        x: node.position?.x || 0,
        y: node.position?.y || 0,
        data: node.data || {},
      };
    });

    registerToolHandler('canvas.getNodesDetailed', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return [];
      }

      const spaceRoomKey = `${spaceId}_${roomId}`;
      const canvasState = tabManagerRef.current.getCanvasState(tabId, spaceRoomKey);
      const nodes = canvasState.nodes || [];

      // Return full node info including data
      return nodes.map(n => ({
        nodeId: n.id,
        nodeType: n.type,
        x: n.position?.x || 0,
        y: n.position?.y || 0,
        data: n.data || {},
      }));
    });

    registerToolHandler('tabs.getTileContent', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        throw new Error('No tab found for this agent');
      }

      const tab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Find the tile by ID
      const findTile = (tile, targetId) => {
        if (tile.id === targetId) return tile;
        if (tile.children) {
          for (const child of tile.children) {
            const found = findTile(child, targetId);
            if (found) return found;
          }
        }
        return null;
      };

      const tile = findTile(tab.rootTile, params.tileId);
      if (!tile) {
        throw new Error(`Tile not found: ${params.tileId}`);
      }

      return {
        tileId: tile.id,
        command: tile.type === 'leaf' ? (tile.command || null) : null,
        isLeaf: tile.type === 'leaf',
      };
    });

    registerToolHandler('dashboard.getChartsDetailed', async (request) => {
      const { agentId, spaceId, roomId } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return [];
      }

      const dashboard = tabManagerRef.current.getTabContext(tabId)?.dashboard;
      const elements = dashboard?.elements || [];

      // Return full chart info including groupBy and filterBy
      return elements.map(el => ({
        chartId: el.id,
        context: el.context,
        groupBy: el.groupBy || null,
        filterBy: el.filterBy || null,
      }));
    });

    // Cleanup on unmount
    return () => {
      // Reset the ref so handlers can be re-registered on next mount
      // (important for React StrictMode which mounts/unmounts/remounts)
      initializedRef.current = false;

      // Unregister all handlers
      unregisterToolHandler('agent.setup');
      unregisterToolHandler('dashboard.addChart');
      unregisterToolHandler('dashboard.removeChart');
      unregisterToolHandler('dashboard.getCharts');
      unregisterToolHandler('dashboard.clearCharts');
      unregisterToolHandler('dashboard.setTimeRange');
      unregisterToolHandler('tabs.splitTile');
      unregisterToolHandler('tabs.removeTile');
      unregisterToolHandler('tabs.getTileLayout');
      // Canvas handlers
      unregisterToolHandler('canvas.addChart');
      unregisterToolHandler('canvas.addStatusBadge');
      unregisterToolHandler('canvas.addText');
      unregisterToolHandler('canvas.addEdge');
      unregisterToolHandler('canvas.removeNode');
      unregisterToolHandler('canvas.removeEdge');
      unregisterToolHandler('canvas.getNodeDetails');
      unregisterToolHandler('canvas.getNodesDetailed');
      // Visibility handlers
      unregisterToolHandler('tabs.getTileContent');
      unregisterToolHandler('dashboard.getChartsDetailed');
      unregisterToolHandler('canvas.getNodes');
      unregisterToolHandler('canvas.clearCanvas');

      // Note: We don't call cleanupAgentBridge here because
      // other components might still be using it. It should be
      // cleaned up at app shutdown.
    };
  }, []); // Empty deps - only run once

  // Return nothing - this hook is for side effects only
};

export default useAgentBridge;
