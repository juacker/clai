/**
 * Agent Tool Bridge
 *
 * This module handles tool requests from Rust AI agents and routes them
 * to the appropriate frontend components. It listens for Tauri events
 * and sends results back to Rust.
 *
 * Architecture:
 *
 * ```
 * Rust (MCP Server)                    JS (React)
 *      |                                   |
 *      |  emit("agent:tool:request", {     |
 *      |    requestId, agentId,            |
 *      |    spaceId, roomId,               |
 *      |    tool, params                   |
 *      |------------------------------------>
 *      |                                   |  getOrCreateAgentTab()
 *      |  (async wait)                     |  execute tool
 *      |                                   |
 *      |  invoke("agent_tool_result", {    |
 *      |    requestId, success, result     |
 *      |<------------------------------------
 *      |                                   |
 * ```
 *
 * Tool Categories:
 * - dashboard.* - Chart management (addChart, removeChart, etc.)
 * - tabs.* - Tile layout management (splitTile, removeTile, etc.)
 */

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { emit as emitActivity } from './activityBus';

// Event name for tool requests (must match Rust EVENT_TOOL_REQUEST)
const EVENT_TOOL_REQUEST = 'agent:tool:request';
const EVENT_TOOL_STREAM = 'agent:tool:stream';

// Track registered tool handlers
const toolHandlers = new Map();

// Track agent tab mappings (agentId_scope -> { tabId, agentName, mcpServerIds })
const agentTabs = new Map();

// Track in-progress tab creations to prevent duplicates from rapid calls
const tabCreationLocks = new Map();

/**
 * Generate a unique key for an automation runtime instance.
 * @param {string} agentId - Agent type identifier
 * The extra scope fields are kept for runtime compatibility, but scheduled
 * automations now use empty values here.
 */
const getAgentKey = (agentId, spaceId, roomId) => {
  return `${agentId}_${spaceId}_${roomId}`;
};

/**
 * Register a tool handler
 *
 * Tool handlers are functions that execute tool operations and return results.
 * They receive the full request object and should return a result or throw an error.
 *
 * @param {string} toolName - Full tool name (e.g., "dashboard.addChart")
 * @param {Function} handler - Async function (request) => result
 *
 * @example
 * registerToolHandler('dashboard.addChart', async (request) => {
 *   const { params, agentId, spaceId, roomId } = request;
 *   // ... execute operation
 *   return { chartId: 'chart-001' };
 * });
 */
export const registerToolHandler = (toolName, handler) => {
  toolHandlers.set(toolName, handler);
};

/**
 * Unregister a tool handler
 * @param {string} toolName - Tool name to unregister
 */
export const unregisterToolHandler = (toolName) => {
  toolHandlers.delete(toolName);
};

/**
 * Get all registered tool names
 * @returns {string[]} Array of registered tool names
 */
export const getRegisteredTools = () => {
  return Array.from(toolHandlers.keys());
};

/**
 * Set the tab ID for an agent
 * Used for lazy tab creation - agents get a tab when they first need UI
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Optional scope identifier
 * @param {string} roomId - Optional scope identifier
 * @param {string} tabId - Tab ID to associate with this agent
 * @param {string} agentName - Human-readable agent name (for tab recreation)
 * @param {string[]} mcpServerIds - MCP servers available to this agent tab
 */
export const setAgentTab = (
  agentId,
  spaceId,
  roomId,
  tabId,
  agentName = null,
  mcpServerIds = null
) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  // Preserve existing agentName if not provided
  const existing = agentTabs.get(key);
  agentTabs.set(key, {
    tabId,
    agentName: agentName || existing?.agentName || agentId,
    mcpServerIds: mcpServerIds || existing?.mcpServerIds || [],
  });
};

/**
 * Get the tab info for an agent (if exists)
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @returns {{ tabId: string, agentName: string, mcpServerIds: string[] }|null} Tab info or null if not found
 */
export const getAgentTab = (agentId, spaceId, roomId) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  return agentTabs.get(key) || null;
};

/**
 * Clear the tab mapping for an agent
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 */
export const clearAgentTab = (agentId, spaceId, roomId) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  agentTabs.delete(key);
};

/**
 * Check if tab creation is in progress for an agent
 * Used to prevent duplicate tab creation from rapid tool calls
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @returns {string|null} The tabId being created, or null if no creation in progress
 */
export const getTabCreationLock = (agentId, spaceId, roomId) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  return tabCreationLocks.get(key) || null;
};

/**
 * Set a lock indicating tab creation is in progress
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @param {string} tabId - The tabId being created
 */
export const setTabCreationLock = (agentId, spaceId, roomId, tabId) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  tabCreationLocks.set(key, tabId);
};

/**
 * Clear the tab creation lock for an agent
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 */
export const clearTabCreationLock = (agentId, spaceId, roomId) => {
  const key = getAgentKey(agentId, spaceId, roomId);
  tabCreationLocks.delete(key);
};

/**
 * Get the tab ID for an agent (convenience function)
 *
 * @param {string} agentId - Agent type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @returns {string|null} Tab ID or null if not found
 */
export const getAgentTabId = (agentId, spaceId, roomId) => {
  const tabInfo = getAgentTab(agentId, spaceId, roomId);
  return tabInfo?.tabId || null;
};

/**
 * Send a tool response back to Rust
 *
 * @param {string} requestId - Request ID from the original request
 * @param {boolean} success - Whether the operation succeeded
 * @param {*} result - Result data (if success)
 * @param {string} error - Error message (if failure)
 */
const sendResponse = async (requestId, success, result = null, error = null) => {
  try {
    const response = {
      requestId,
      success,
      result: success ? result : null,
      error: success ? null : error,
    };

    await invoke('agent_tool_result', { response });
  } catch (err) {
    console.error('[AgentBridge] Failed to send response:', err);
  }
};

/**
 * Wait for a handler to be registered (with timeout)
 * This handles the race condition where Rust sends a request before React registers handlers
 *
 * @param {string} tool - Tool name to wait for
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @param {number} checkIntervalMs - How often to check for the handler
 * @returns {Promise<Function|null>} The handler or null if timeout
 */
const waitForHandler = (tool, maxWaitMs = 2000, checkIntervalMs = 50) => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      const handler = toolHandlers.get(tool);
      if (handler) {
        resolve(handler);
        return;
      }

      if (Date.now() - startTime >= maxWaitMs) {
        resolve(null); // Timeout
        return;
      }

      setTimeout(check, checkIntervalMs);
    };

    check();
  });
};

/**
 * Handle a tool request from Rust
 *
 * @param {Object} request - Tool request object
 * @param {string} request.requestId - Unique request ID
 * @param {string} request.agentId - Agent type identifier
 * @param {string} request.spaceId - Netdata space ID
 * @param {string} request.roomId - Netdata room ID
 * @param {string} [request.tabId] - Preferred tab ID for this tool execution
 * @param {string[]} [request.mcpServerIds] - MCP servers enabled for this execution context
 * @param {string} request.tool - Tool name (e.g., "dashboard.addChart")
 * @param {Object} request.params - Tool parameters
 */
const handleToolRequest = async (request) => {
  const { requestId, agentId, spaceId, roomId, tool, params } = request;

  console.log(`[AgentBridge] Tool request: ${tool}`, { agentId, spaceId, roomId, params });

  // Get the tab ID for this agent (may be null if agent.setup hasn't run yet)
  const tabId = getAgentTabId(agentId, spaceId, roomId);

  // Emit tool:start event to activity bus (for AgentChat UI)
  if (tabId) {
    emitActivity(tabId, {
      type: 'tool:start',
      id: requestId,
      tool,
      params,
      timestamp: Date.now(),
    });
  }

  try {
    // Find the handler for this tool
    let handler = toolHandlers.get(tool);

    // If handler not found, wait for it (handles race condition at startup)
    if (!handler) {
      console.log(`[AgentBridge] Handler not ready for ${tool}, waiting...`);
      handler = await waitForHandler(tool);
    }

    if (!handler) {
      throw new Error(`No handler registered for tool: ${tool} (timeout waiting for registration)`);
    }

    // Execute the handler (pass agentId as part of request for handlers)
    const result = await handler({ ...request, agentId });

    // Emit tool:complete event to activity bus
    if (tabId) {
      emitActivity(tabId, {
        type: 'tool:complete',
        id: requestId,
        tool,
        result,
        timestamp: Date.now(),
      });
    }

    // Send success response back to Rust
    await sendResponse(requestId, true, result);

    console.log(`[AgentBridge] Tool success: ${tool}`, result);
  } catch (err) {
    console.error(`[AgentBridge] Tool error: ${tool}`, err);

    // Emit tool:error event to activity bus
    if (tabId) {
      emitActivity(tabId, {
        type: 'tool:error',
        id: requestId,
        tool,
        error: err.message || 'Unknown error',
        timestamp: Date.now(),
      });
    }

    // Send error response back to Rust
    await sendResponse(requestId, false, null, err.message || 'Unknown error');
  }
};

// Event listener cleanup functions
let unlistenFn = null;
let unlistenStreamFn = null;

// Synchronous flag to prevent async race condition during initialization
let isInitializing = false;

// Stream event callback registry
let streamCallback = null;

/**
 * Set the callback for streaming events.
 *
 * The callback receives stream events from Rust when processing SSE.
 * This is typically set by AgentActivityContext to update streaming content.
 *
 * @param {function} callback - Function called with (tabId, toolCallId, eventType, payload)
 */
export const setStreamCallback = (callback) => {
  streamCallback = callback;
};

/**
 * Handle a streaming event from Rust.
 *
 * Routes the event to the appropriate tab via the stream callback.
 */
const handleStreamEvent = (event) => {
  const { toolCallId, agentId, spaceId, roomId, tool, eventType, payload } = event;

  // Look up tab ID from agent context
  const tabId = getAgentTabId(agentId, spaceId, roomId);
  if (!tabId) {
    console.warn('[AgentBridge] Stream event for unknown agent context:', { agentId, spaceId, roomId });
    return;
  }

  // Emit to activity bus (include spaceId/roomId for chart components)
  emitActivity(tabId, {
    type: 'tool:stream',
    id: toolCallId,
    tool,
    eventType,
    payload,
    spaceId,
    roomId,
    timestamp: Date.now(),
  });

  // Also call the stream callback if set
  if (streamCallback) {
    streamCallback(tabId, toolCallId, eventType, payload);
  }
};

/**
 * Initialize the agent bridge
 *
 * Starts listening for tool requests from Rust. Call this once when the
 * app initializes (e.g., in App.jsx or a top-level provider).
 *
 * @returns {Promise<void>}
 */
export const initAgentBridge = async () => {
  // Avoid double initialization (synchronous check to prevent race condition)
  if (unlistenFn || isInitializing) {
    console.warn('[AgentBridge] Already initialized or initializing');
    return;
  }

  // Set flag synchronously before any async operations
  isInitializing = true;

  try {
    // Listen for tool requests from Rust
    unlistenFn = await listen(EVENT_TOOL_REQUEST, (event) => {
      handleToolRequest(event.payload);
    });

    // Listen for stream events from Rust
    unlistenStreamFn = await listen(EVENT_TOOL_STREAM, (event) => {
      handleStreamEvent(event.payload);
    });

    console.log('[AgentBridge] Initialized, listening for tool requests and streams');
  } catch (err) {
    console.error('[AgentBridge] Failed to initialize:', err);
    isInitializing = false; // Reset on failure
  }
};

/**
 * Cleanup the agent bridge
 *
 * Stops listening for events. Call this when the app is unmounting.
 */
export const cleanupAgentBridge = () => {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }

  if (unlistenStreamFn) {
    unlistenStreamFn();
    unlistenStreamFn = null;
  }

  console.log('[AgentBridge] Cleaned up');

  // Reset initialization flag
  isInitializing = false;

  // Clear all state
  toolHandlers.clear();
  agentTabs.clear();
  tabCreationLocks.clear();
  streamCallback = null;
};

export default {
  initAgentBridge,
  cleanupAgentBridge,
  registerToolHandler,
  unregisterToolHandler,
  getRegisteredTools,
  setAgentTab,
  getAgentTab,
  getAgentTabId,
  clearAgentTab,
  setStreamCallback,
};
