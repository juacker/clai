/**
 * Worker Tool Bridge
 *
 * This module handles tool requests from Rust AI workers and routes them
 * to the appropriate frontend components. It listens for Tauri events
 * and sends results back to Rust.
 *
 * Architecture:
 *
 * ```
 * Rust (MCP Server)                    JS (React)
 *      |                                   |
 *      |  emit("worker:tool:request", {    |
 *      |    requestId, workerId,           |
 *      |    spaceId, roomId,               |
 *      |    tool, params                   |
 *      |------------------------------------>
 *      |                                   |  getOrCreateWorkerTab()
 *      |  (async wait)                     |  execute tool
 *      |                                   |
 *      |  invoke("worker_tool_result", {   |
 *      |    requestId, success, result     |
 *      |<------------------------------------
 *      |                                   |
 * ```
 *
 * Tool Categories:
 * - canvas.* - Chart management (addChart, removeChart, etc.)
 * - tabs.* - Tile layout management (splitTile, removeTile, etc.)
 */

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Event name for tool requests (must match Rust EVENT_TOOL_REQUEST)
const EVENT_TOOL_REQUEST = 'worker:tool:request';

// Track registered tool handlers
const toolHandlers = new Map();

// Track worker tab mappings (workerId_spaceId_roomId -> tabId)
const workerTabs = new Map();

/**
 * Generate a unique ID for a worker in a specific space/room
 * @param {string} workerId - Worker type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @returns {string} Unique key for this worker instance
 */
const getWorkerKey = (workerId, spaceId, roomId) => {
  return `${workerId}_${spaceId}_${roomId}`;
};

/**
 * Register a tool handler
 *
 * Tool handlers are functions that execute tool operations and return results.
 * They receive the full request object and should return a result or throw an error.
 *
 * @param {string} toolName - Full tool name (e.g., "canvas.addChart")
 * @param {Function} handler - Async function (request) => result
 *
 * @example
 * registerToolHandler('canvas.addChart', async (request) => {
 *   const { params, workerId, spaceId, roomId } = request;
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
 * Set the tab ID for a worker
 * Used for lazy tab creation - workers get a tab when they first need UI
 *
 * @param {string} workerId - Worker type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @param {string} tabId - Tab ID to associate with this worker
 */
export const setWorkerTab = (workerId, spaceId, roomId, tabId) => {
  const key = getWorkerKey(workerId, spaceId, roomId);
  workerTabs.set(key, tabId);
};

/**
 * Get the tab ID for a worker (if exists)
 *
 * @param {string} workerId - Worker type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 * @returns {string|null} Tab ID or null if not found
 */
export const getWorkerTab = (workerId, spaceId, roomId) => {
  const key = getWorkerKey(workerId, spaceId, roomId);
  return workerTabs.get(key) || null;
};

/**
 * Clear the tab mapping for a worker
 *
 * @param {string} workerId - Worker type identifier
 * @param {string} spaceId - Netdata space ID
 * @param {string} roomId - Netdata room ID
 */
export const clearWorkerTab = (workerId, spaceId, roomId) => {
  const key = getWorkerKey(workerId, spaceId, roomId);
  workerTabs.delete(key);
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

    await invoke('worker_tool_result', { response });
  } catch (err) {
    console.error('[WorkerBridge] Failed to send response:', err);
  }
};

/**
 * Handle a tool request from Rust
 *
 * @param {Object} request - Tool request object
 * @param {string} request.requestId - Unique request ID
 * @param {string} request.workerId - Worker type identifier
 * @param {string} request.spaceId - Netdata space ID
 * @param {string} request.roomId - Netdata room ID
 * @param {string} request.tool - Tool name (e.g., "canvas.addChart")
 * @param {Object} request.params - Tool parameters
 */
const handleToolRequest = async (request) => {
  const { requestId, workerId, spaceId, roomId, tool, params } = request;

  console.log(`[WorkerBridge] Tool request: ${tool}`, { workerId, spaceId, roomId, params });

  try {
    // Find the handler for this tool
    const handler = toolHandlers.get(tool);

    if (!handler) {
      throw new Error(`No handler registered for tool: ${tool}`);
    }

    // Execute the handler
    const result = await handler(request);

    // Send success response
    await sendResponse(requestId, true, result);

    console.log(`[WorkerBridge] Tool success: ${tool}`, result);
  } catch (err) {
    console.error(`[WorkerBridge] Tool error: ${tool}`, err);

    // Send error response
    await sendResponse(requestId, false, null, err.message || 'Unknown error');
  }
};

// Event listener cleanup function
let unlistenFn = null;

/**
 * Initialize the worker bridge
 *
 * Starts listening for tool requests from Rust. Call this once when the
 * app initializes (e.g., in App.jsx or a top-level provider).
 *
 * @returns {Promise<void>}
 */
export const initWorkerBridge = async () => {
  // Avoid double initialization
  if (unlistenFn) {
    console.warn('[WorkerBridge] Already initialized');
    return;
  }

  try {
    // Listen for tool requests from Rust
    unlistenFn = await listen(EVENT_TOOL_REQUEST, (event) => {
      handleToolRequest(event.payload);
    });

    console.log('[WorkerBridge] Initialized, listening for tool requests');
  } catch (err) {
    console.error('[WorkerBridge] Failed to initialize:', err);
  }
};

/**
 * Cleanup the worker bridge
 *
 * Stops listening for events. Call this when the app is unmounting.
 */
export const cleanupWorkerBridge = () => {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
    console.log('[WorkerBridge] Cleaned up');
  }

  // Clear all state
  toolHandlers.clear();
  workerTabs.clear();
};

export default {
  initWorkerBridge,
  cleanupWorkerBridge,
  registerToolHandler,
  unregisterToolHandler,
  getRegisteredTools,
  setWorkerTab,
  getWorkerTab,
  clearWorkerTab,
};
