/**
 * useAgentBridge Hook
 *
 * This hook initializes the agent bridge and registers tool handlers
 * that interact with the TabManager, Dashboard, Canvas, and Chat.
 *
 * Tool Categories:
 * - agent.* - Agent lifecycle (setup)
 * - dashboard.* - Chart management (addChart, removeChart, etc.)
 * - tabs.* - Tile layout management (splitTile, removeTile, etc.)
 * - canvas.* - Node-based canvas (addChart, addStatusBadge, addText, addEdge, etc.)
 * - chat.* - Agent text communication (message)
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
  getTabCreationLock,
  setTabCreationLock,
  clearTabCreationLock,
  getAgentTabId,
} from './bridge';
import { emit as emitActivity } from './activityBus';

/**
 * Generate a unique chart ID
 */
const generateChartId = () => `chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
    getCommandFromTab,
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
    const tabInfo = getAgentTab(agentId, spaceId, roomId);

    if (tabInfo?.tabId) {
      // Verify the tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabInfo.tabId);
      if (existingTab) {
        // Tab already exists, no need to create
        return { tabId: tabInfo.tabId };
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
      // Found existing tab, restore the mapping (with agent name)
      setAgentTab(agentId, spaceId, roomId, existingAgentTab.id, agentName);
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

    // Store the mapping (with agent name for future recreation)
    setAgentTab(agentId, spaceId, roomId, newTab.id, agentName);

    return { tabId: newTab.id, rootTileId: newTab.rootTile?.id || null };
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
    const tabInfo = getAgentTab(agentId, spaceId, roomId);
    if (tabInfo?.tabId) {
      // Verify tab still exists
      const existingTab = tabManagerRef.current.tabs.find(t => t.id === tabInfo.tabId);
      if (existingTab) {
        return tabInfo.tabId;
      }
      // Tab was removed but we still have the mapping - don't clear it yet
      // (ensureAgentTab will recreate the tab using the stored agentName)
    }
    return null;
  };

  /**
   * Ensure an agent has a tab, recreating it if the user closed it.
   * This allows agents to continue working even if their tab was closed.
   * Uses a lock to prevent duplicate tab creation from rapid tool calls.
   *
   * @param {string} agentId - Agent identifier
   * @param {string} spaceId - Netdata space ID
   * @param {string} roomId - Netdata room ID
   * @returns {string} Tab ID (existing or newly created)
   */
  const ensureAgentTab = (agentId, spaceId, roomId) => {
    // First check if tab exists (fast path)
    const existingTabId = getAgentTabId(agentId, spaceId, roomId);
    if (existingTabId) {
      return existingTabId;
    }

    // Check if another call is already creating this tab
    // Since setupAgentTab is synchronous, if we see a lock, creation is done
    // and we should re-check the mapping
    if (getTabCreationLock(agentId, spaceId, roomId)) {
      // Creation was in progress - by now it should be done (sync code)
      // Re-check the mapping
      const tabIdAfterLock = getAgentTabId(agentId, spaceId, roomId);
      if (tabIdAfterLock) {
        return tabIdAfterLock;
      }
      // Still no tab? Fall through to create (lock holder may have failed)
    }

    // Tab doesn't exist - recreate it
    const tabInfo = getAgentTab(agentId, spaceId, roomId);
    const agentName = tabInfo?.agentName || agentId;

    console.log(`[AgentBridge] Recreating closed tab for agent: ${agentId}`);

    // Set lock before creating (value doesn't matter, just presence)
    setTabCreationLock(agentId, spaceId, roomId, true);

    try {
      // Use setupAgentTab to create a new tab (synchronous)
      const result = setupAgentTab(agentId, agentName, spaceId, roomId);
      return result.tabId;
    } finally {
      // Clear lock - mapping is already updated by setupAgentTab
      clearTabCreationLock(agentId, spaceId, roomId);
    }
  };

  /**
   * Helper to get a command from a request.
   * Handles tab lookup, command lookup, and validation.
   * Automatically recreates the tab if it was closed by the user.
   *
   * @param {string} commandType - Expected command type (canvas, dashboard, etc.)
   * @param {Object} request - Tool request object
   * @param {Object} options - Options
   * @param {boolean} options.required - If true, throws on failure. If false, returns null.
   * @returns {Object|null} Command entry with api, or null/throws
   */
  const getCommandByType = (commandType, request, { required = true } = {}) => {
    const { agentId, spaceId, roomId, params } = request;
    const { commandId } = params;

    // Use ensureAgentTab to recreate tab if user closed it
    const tabId = ensureAgentTab(agentId, spaceId, roomId);
    if (!tabId) {
      if (required) {
        throw new Error('No tab found for this agent. Call agent.setup first.');
      }
      return null;
    }

    const command = tabManagerRef.current.getCommandFromTab(tabId, commandId);
    if (!command) {
      if (required) {
        throw new Error(`${commandType} not found: ${commandId}`);
      }
      return null;
    }
    if (command.type !== commandType) {
      if (required) {
        throw new Error(`Command is not a ${commandType}: ${commandId} (type: ${command.type})`);
      }
      return null;
    }

    if (!command.api) {
      if (required) {
        throw new Error(`${commandType} not ready: ${commandId}`);
      }
      return null;
    }

    return command;
  };

  // Convenience wrapper for canvas commands
  const getCanvasCommand = (request, options) => getCommandByType('canvas', request, options);

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Initialize the bridge
    initAgentBridge();

    // Register agent setup handler (called BEFORE CLI starts)
    // For scheduled agents: creates a new tab
    // For on-demand agents: uses an existing tabId if it has valid tile structure
    registerToolHandler('agent.setup', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const { agentName, tabId: existingTabId } = params;

      // If tabId is provided (on-demand agent), check if it has a valid tile structure
      if (existingTabId) {
        const existingTab = tabManagerRef.current.tabs.find(t => t.id === existingTabId);

        // Validate the tile structure is complete:
        // - rootTile exists
        // - rootTile has an id
        // - rootTile has a valid type ('leaf' or 'split')
        const hasValidTileStructure = existingTab?.rootTile?.id &&
          (existingTab.rootTile.type === 'leaf' || existingTab.rootTile.type === 'split');

        if (hasValidTileStructure) {
          setAgentTab(agentId, spaceId, roomId, existingTabId, agentName || 'Clai');
          console.log(`[AgentBridge] Agent tab set for on-demand: ${existingTabId}, rootTile: ${existingTab.rootTile.id}`);
          return { tabId: existingTabId, rootTileId: existingTab.rootTile.id };
        }

        // Tab doesn't have valid tile structure - log details for debugging
        console.warn(`[AgentBridge] Tab ${existingTabId} has invalid tile structure:`, {
          hasTab: !!existingTab,
          hasRootTile: !!existingTab?.rootTile,
          rootTileId: existingTab?.rootTile?.id,
          rootTileType: existingTab?.rootTile?.type,
        });
      }

      // Create a new tab for the agent (scheduled agents or tabs without valid tiles)
      const result = setupAgentTab(agentId, agentName || 'Clai', spaceId, roomId);

      console.log(`[AgentBridge] Agent tab setup complete: ${result.tabId}`);
      return result;
    });

    // Helper to get dashboard command from agent's tab
    const getDashboardFromTab = (tabId, commandId = null) => {
      if (commandId) {
        // Get specific dashboard by commandId
        const command = tabManagerRef.current.getCommandFromTab(tabId, commandId);
        if (!command || command.type !== 'dashboard') {
          return null;
        }
        return command;
      }
      // Get first dashboard in tab
      const dashboards = tabManagerRef.current.getCommandsByTypeFromTab(tabId, 'dashboard');
      return dashboards.length > 0 ? dashboards[0] : null;
    };

    // Register dashboard tool handlers
    registerToolHandler('dashboard.addChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      const dashboard = getDashboardFromTab(tabId, params.commandId);
      if (!dashboard) {
        throw new Error('No dashboard found. Create one with tabs.splitTile({ commandType: "dashboard" })');
      }
      if (!dashboard.api) {
        throw new Error('Dashboard not ready yet');
      }

      const chartId = dashboard.api.addChart({
        context: params.context,
        groupBy: params.groupBy || null,
        filterBy: params.filterBy || null,
      });

      return { chartId };
    });

    registerToolHandler('dashboard.removeChart', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      const dashboard = getDashboardFromTab(tabId, params.commandId);
      if (!dashboard?.api) {
        throw new Error('Dashboard not found or not ready');
      }

      dashboard.api.removeChart(params.chartId);
      return { success: true };
    });

    registerToolHandler('dashboard.clearCharts', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const tabId = getAgentTabId(agentId, spaceId, roomId);

      if (!tabId) {
        return { success: true };
      }

      const dashboard = getDashboardFromTab(tabId, params?.commandId);
      if (!dashboard?.api) {
        return { success: true };
      }

      dashboard.api.clearCharts();
      return { success: true };
    });

    registerToolHandler('dashboard.setTimeRange', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      const dashboard = getDashboardFromTab(tabId, params?.commandId);
      if (!dashboard?.api) {
        throw new Error('Dashboard not found or not ready');
      }

      const success = dashboard.api.setTimeRange(params.range);
      if (!success) {
        throw new Error(`Invalid time range: ${params.range}`);
      }

      // Update tab context with time range (for backwards compatibility)
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
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      // Get the parent tile ID - use the root tile if not specified or if "root" is passed
      let parentTileId = params.parentTileId;
      const tab = tabManagerRef.current.tabs.find(t => t.id === tabId);

      if (!tab) {
        throw new Error(`Tab not found: ${tabId}`);
      }

      // Handle special cases: no parentTileId, or "root" as a keyword
      if (!parentTileId || parentTileId === 'root') {
        // Get the root tile of the tab - validate it exists and has a valid structure
        if (!tab.rootTile?.id) {
          throw new Error(`Tab ${tabId} has no valid rootTile. Structure: ${JSON.stringify({
            hasRootTile: !!tab.rootTile,
            rootTileId: tab.rootTile?.id,
            rootTileType: tab.rootTile?.type,
          })}`);
        }
        parentTileId = tab.rootTile.id;
        console.log(`[AgentBridge] Using rootTile as parent: ${parentTileId}`);
      }

      // Split the tile in the agent's tab
      // 'vertical' = side by side, 'horizontal' = stacked
      console.log(`[AgentBridge] Splitting tile: tabId=${tabId}, parentTileId=${parentTileId}, splitType=${params.splitType}`);
      const result = tabManagerRef.current.splitTileInTab(
        tabId,
        parentTileId,
        params.splitType
      );

      if (!result.success) {
        // Add more context to the error for debugging
        console.error(`[AgentBridge] splitTile failed:`, {
          tabId,
          parentTileId,
          splitType: params.splitType,
          rootTileId: tab.rootTile?.id,
          rootTileType: tab.rootTile?.type,
          errorMessage: result.message,
        });
        throw new Error(`${result.message}. Tab: ${tabId}, Tile: ${parentTileId}`);
      }

      const response = { tileId: result.newTileId };

      // If commandType is provided, create a command in the new tile
      if (params.commandType) {
        const command = tabManagerRef.current.createCommandInTab(
          tabId,
          params.commandType,
          {}
        );

        if (command) {
          // Assign the command to the new tile
          tabManagerRef.current.assignCommandToTileInTab(tabId, command.id, result.newTileId);
          response.commandId = command.id;
        }
      }

      return response;
    });

    registerToolHandler('tabs.removeTile', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      const result = tabManagerRef.current.closeTile(params.tileId);

      if (!result.success) {
        throw new Error(result.message);
      }

      return { success: true };
    });

    registerToolHandler('tabs.getTileLayout', async (request) => {
      const { agentId, spaceId, roomId } = request;
      // Use ensureAgentTab to recreate tab if user closed it
      const tabId = ensureAgentTab(agentId, spaceId, roomId);

      const tab = tabManagerRef.current.tabs.find(t => t.id === tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Helper to get content details based on command type
      // Returns enough info for agent to decide if content can be reused
      const getContentDetails = (command) => {
        if (!command?.api) return null;

        if (command.type === 'canvas') {
          // Get all canvas nodes with their data
          const nodes = command.api.getNodes() || [];
          return {
            nodeCount: nodes.length,
            nodes: nodes.map(n => {
              const summary = { nodeId: n.id, nodeType: n.type };

              // Include type-specific info so agent can evaluate content
              if (n.type === 'chart') {
                summary.context = n.data?.context || null; // e.g., "system.cpu"
                summary.title = n.data?.title || null;
              } else if (n.type === 'statusBadge') {
                summary.status = n.data?.status || null; // e.g., "healthy"
                summary.title = n.data?.title || null;
                summary.message = n.data?.message?.substring(0, 100) || null;
              } else if (n.type === 'markdown') {
                // First 150 chars of content to understand what it's about
                summary.contentPreview = n.data?.content?.substring(0, 150) || null;
              } else {
                summary.title = n.data?.title || null;
              }

              return summary;
            }),
          };
        }

        if (command.type === 'dashboard') {
          // Get all dashboard charts
          const charts = command.api.getChartsDetailed?.() || command.api.getCharts?.() || [];
          return {
            chartCount: charts.length,
            charts: charts.map(c => ({
              chartId: c.id,
              context: c.config?.context,
            })),
          };
        }

        return null;
      };

      // Convert tile tree to layout format (includes commandId AND content for discovery)
      const convertTile = (tile) => {
        if (tile.type === 'leaf') {
          // Look up the command to get its type and content
          const command = tile.commandId
            ? tabManagerRef.current.getCommandFromTab(tabId, tile.commandId)
            : null;

          const content = command ? getContentDetails(command) : null;

          return {
            tileId: tile.id,
            commandId: tile.commandId || null,
            command: command?.type || null,
            content, // Include actual content details!
            splitType: null,
            children: [],
          };
        }

        return {
          tileId: tile.id,
          commandId: null,
          command: null,
          content: null,
          splitType: tile.direction,
          children: tile.children.map(convertTile),
        };
      };

      // Build the tree
      const root = convertTile(tab.rootTile);

      // Collect all canvases and dashboards for easy access
      const collectCommands = (tile, result = { canvases: [], dashboards: [] }) => {
        if (tile.command === 'canvas' && tile.commandId) {
          result.canvases.push({
            commandId: tile.commandId,
            nodeCount: tile.content?.nodeCount || 0,
            nodes: tile.content?.nodes || [],
          });
        } else if (tile.command === 'dashboard' && tile.commandId) {
          result.dashboards.push({
            commandId: tile.commandId,
            chartCount: tile.content?.chartCount || 0,
            charts: tile.content?.charts || [],
          });
        }
        if (tile.children) {
          tile.children.forEach(child => collectCommands(child, result));
        }
        return result;
      };

      const available = collectCommands(root);

      // Return flat lists with rootTileId for splitting
      // The agent needs rootTileId to call tabs.splitTile
      return {
        rootTileId: tab.rootTile?.id || null,
        canvasCount: available.canvases.length,
        canvases: available.canvases,
        dashboardCount: available.dashboards.length,
        dashboards: available.dashboards,
      };
    });

    // Get full content details for any command by ID
    registerToolHandler('tabs.getCommandContent', async (request) => {
      const { agentId, spaceId, roomId, params } = request;
      const { commandId } = params;

      if (!commandId) {
        throw new Error('commandId is required');
      }

      const tabId = ensureAgentTab(agentId, spaceId, roomId);
      const command = tabManagerRef.current.getCommandFromTab(tabId, commandId);

      if (!command) {
        throw new Error(`Command not found: ${commandId}`);
      }

      const result = {
        commandId,
        commandType: command.type,
        content: null,
      };

      if (command.type === 'canvas' && command.api) {
        const nodes = command.api.getNodes() || [];
        result.content = {
          nodeCount: nodes.length,
          nodes: nodes.map(n => ({
            nodeId: n.id,
            nodeType: n.type,
            x: n.position?.x || 0,
            y: n.position?.y || 0,
            data: n.data || {},
          })),
        };
      } else if (command.type === 'dashboard' && command.api) {
        const charts = command.api.getChartsDetailed?.() || command.api.getCharts?.() || [];
        result.content = {
          chartCount: charts.length,
          charts: charts.map(c => ({
            chartId: c.id,
            context: c.config?.context,
            groupBy: c.config?.groupBy || null,
            filterBy: c.config?.filterBy || null,
          })),
        };
      }

      return result;
    });

    // =========================================================================
    // Canvas Tool Handlers
    // =========================================================================

    registerToolHandler('canvas.addChart', async (request) => {
      const { params } = request;
      const { x, y, context, title, groupBy, filterBy, timeRange, width, height } = params;

      const command = getCanvasCommand(request);
      const nodeId = command.api.addNode('chart', { x, y }, {
        context,
        title: title || null,
        groupBy: groupBy || [],
        filterBy: filterBy || {},
        timeRange: timeRange || '15m',
        width: width || 400,
        height: height || 300,
      });

      return { nodeId };
    });

    registerToolHandler('canvas.addStatusBadge', async (request) => {
      const { params } = request;
      const { x, y, status, message, title } = params;

      const command = getCanvasCommand(request);
      const nodeId = command.api.addNode('statusBadge', { x, y }, {
        status,
        message,
        title: title || null,
        showTimestamp: false,
        timestamp: new Date().toISOString(),
      });

      return { nodeId };
    });

    registerToolHandler('canvas.addMarkdown', async (request) => {
      const { params } = request;
      const { x, y, content, width, maxHeight } = params;

      const command = getCanvasCommand(request);
      const nodeId = command.api.addNode('markdown', { x, y }, {
        content,
        width: width || 400,
        maxHeight: maxHeight || null,
        showHandles: true,
      });

      return { nodeId };
    });

    registerToolHandler('canvas.addEdge', async (request) => {
      const { params } = request;
      const { sourceId, targetId, label, animated } = params;

      const command = getCanvasCommand(request);
      const edgeId = command.api.addEdge(sourceId, targetId, { label, animated });

      return { edgeId };
    });

    registerToolHandler('canvas.removeNode', async (request) => {
      const { params } = request;
      const { nodeId } = params;

      const command = getCanvasCommand(request);
      command.api.removeNode(nodeId);

      return { success: true };
    });

    registerToolHandler('canvas.removeEdge', async (request) => {
      const { params } = request;
      const { edgeId } = params;

      const command = getCanvasCommand(request);
      command.api.removeEdge(edgeId);

      return { success: true };
    });

    registerToolHandler('canvas.clearCanvas', async (request) => {
      const command = getCanvasCommand(request, { required: false });
      if (!command) {
        return { success: true };
      }

      command.api.clear();
      return { success: true };
    });

    registerToolHandler('canvas.updateNode', async (request) => {
      const { params } = request;
      const { nodeId, x, y, data } = params;

      const command = getCanvasCommand(request);

      // Build the updates object
      const updates = {};
      if (x !== undefined || y !== undefined) {
        updates.position = { x, y };
      }
      if (data) {
        updates.data = data;
      }

      command.api.updateNode(nodeId, updates);

      // Get the updated node to return
      const nodes = command.api.getNodes();
      const updatedNode = nodes.find(n => n.id === nodeId);

      return {
        nodeId: updatedNode?.id || nodeId,
        nodeType: updatedNode?.type,
        x: updatedNode?.position?.x || 0,
        y: updatedNode?.position?.y || 0,
        data: updatedNode?.data || {},
      };
    });

    // ==========================================================================
    // Chat Tools - Agent text communication
    // ==========================================================================

    /**
     * chat.message - Send a text message to the user
     *
     * This tool allows agents to communicate text directly to the user.
     * Messages appear in the AgentChat UI as a distinct "agent message" block.
     *
     * @param {string} message - Message content (supports markdown)
     * @param {string} [messageType] - Type: info, question, result, error
     * @returns {{ success: boolean }} Result
     */
    registerToolHandler('chat.message', async (request) => {
      const { params, agentId, spaceId, roomId } = request;
      const { message, messageType = 'info' } = params;

      if (!message) {
        throw new Error('Message content is required');
      }

      // Get the tab ID for this agent
      const tabId = getAgentTabId(agentId, spaceId, roomId);
      if (!tabId) {
        console.warn('[chat.message] No tab found for agent:', { agentId, spaceId, roomId });
        return { success: true, message, messageType };
      }

      // Generate unique IDs for this message
      const messageId = `chat_msg_${Date.now()}`;
      const toolCallId = `chat_${Date.now()}`;

      // Emit tool:stream events to display the message in AgentChat
      // These events simulate an SSE stream response with a text content block

      // 1. Start the message
      emitActivity(tabId, {
        type: 'tool:stream',
        id: toolCallId,
        tool: 'chat.message',
        eventType: 'message_start',
        payload: {
          message: {
            id: messageId,
            role: 'assistant',
          },
        },
        timestamp: Date.now(),
      });

      // 2. Start the text content block
      emitActivity(tabId, {
        type: 'tool:stream',
        id: toolCallId,
        tool: 'chat.message',
        eventType: 'content_block_start',
        payload: {
          index: 0,
          content_block: {
            type: 'text',
            text: message,
          },
        },
        timestamp: Date.now(),
      });

      // 3. Stop the content block
      emitActivity(tabId, {
        type: 'tool:stream',
        id: toolCallId,
        tool: 'chat.message',
        eventType: 'content_block_stop',
        payload: { index: 0 },
        timestamp: Date.now(),
      });

      // 4. Stop the message
      emitActivity(tabId, {
        type: 'tool:stream',
        id: toolCallId,
        tool: 'chat.message',
        eventType: 'message_stop',
        payload: {},
        timestamp: Date.now(),
      });

      return {
        success: true,
        message,
        messageType,
      };
    });

    // Cleanup on unmount
    return () => {
      // Reset the ref so handlers can be re-registered on next mount
      initializedRef.current = false;

      // Unregister all handlers
      unregisterToolHandler('agent.setup');
      unregisterToolHandler('dashboard.addChart');
      unregisterToolHandler('dashboard.removeChart');
      unregisterToolHandler('dashboard.clearCharts');
      unregisterToolHandler('dashboard.setTimeRange');
      unregisterToolHandler('tabs.splitTile');
      unregisterToolHandler('tabs.removeTile');
      unregisterToolHandler('tabs.getTileLayout');
      unregisterToolHandler('tabs.getCommandContent');
      // Canvas handlers
      unregisterToolHandler('canvas.addChart');
      unregisterToolHandler('canvas.addStatusBadge');
      unregisterToolHandler('canvas.addMarkdown');
      unregisterToolHandler('canvas.addEdge');
      unregisterToolHandler('canvas.removeNode');
      unregisterToolHandler('canvas.removeEdge');
      unregisterToolHandler('canvas.updateNode');
      unregisterToolHandler('canvas.clearCanvas');
      // Chat handlers
      unregisterToolHandler('chat.message');

      // Note: We don't call cleanupAgentBridge here because
      // other components might still be using it. It should be
      // cleaned up at app shutdown.
    };
  }, []); // Empty deps - only run once

  // Return nothing - this hook is for side effects only
};

export default useAgentBridge;
