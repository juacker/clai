/**
 * Activity Bus - Simple pub/sub for tool activity notifications.
 *
 * This module provides a lightweight event bus for notifying UI components
 * about agent tool activity. It's used by the hybrid architecture where:
 * - Direct API calls handle tool execution (Canvas, Dashboard)
 * - Event bus handles notifications (AgentChat observes)
 *
 * Events are scoped by tabId, so each tab only receives events for its own
 * agent activity.
 *
 * @example
 * // Subscribe to events for a tab
 * const unsubscribe = subscribe(tabId, (event) => {
 *   if (event.type === 'tool:start') {
 *     console.log('Tool started:', event.tool);
 *   }
 * });
 *
 * // Emit an event
 * emit(tabId, { type: 'tool:start', id: '123', tool: 'canvas.addChart', params: {} });
 *
 * // Cleanup
 * unsubscribe();
 */

// Map of tabId -> Set of callback functions
const subscribers = new Map();

/**
 * Subscribe to activity events for a specific tab.
 *
 * @param {string} tabId - The tab ID to subscribe to
 * @param {function} callback - Function called with each event
 * @returns {function} Unsubscribe function
 */
export const subscribe = (tabId, callback) => {
  if (!subscribers.has(tabId)) {
    subscribers.set(tabId, new Set());
  }
  subscribers.get(tabId).add(callback);

  // Return unsubscribe function
  return () => {
    const tabSubscribers = subscribers.get(tabId);
    if (tabSubscribers) {
      tabSubscribers.delete(callback);
      // Clean up empty sets
      if (tabSubscribers.size === 0) {
        subscribers.delete(tabId);
      }
    }
  };
};

/**
 * Emit an event to all subscribers for a specific tab.
 *
 * @param {string} tabId - The tab ID to emit to
 * @param {object} event - The event object
 * @param {string} event.type - Event type: 'tool:start' | 'tool:complete' | 'tool:error' | 'tool:stream'
 * @param {string} event.id - Request/tool call ID
 * @param {string} event.tool - Tool name (e.g., 'workspace.createCanvas', 'canvas.addChart')
 * @param {object} [event.params] - Tool parameters (for 'tool:start')
 * @param {object} [event.result] - Tool result (for 'tool:complete')
 * @param {string} [event.error] - Error message (for 'tool:error')
 * @param {string} [event.chunk] - Streaming chunk (for 'tool:stream')
 * @param {number} event.timestamp - Event timestamp
 */
export const emit = (tabId, event) => {
  const tabSubscribers = subscribers.get(tabId);
  if (tabSubscribers) {
    tabSubscribers.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[activityBus] Error in subscriber callback:', err);
      }
    });
  }
};

/**
 * Get the number of subscribers for a tab (useful for debugging).
 *
 * @param {string} tabId - The tab ID
 * @returns {number} Number of subscribers
 */
export const getSubscriberCount = (tabId) => {
  return subscribers.get(tabId)?.size ?? 0;
};

/**
 * Clear all subscribers for a tab (useful for cleanup).
 *
 * @param {string} tabId - The tab ID
 */
export const clearSubscribers = (tabId) => {
  subscribers.delete(tabId);
};

/**
 * Clear all subscribers (useful for testing).
 */
export const clearAllSubscribers = () => {
  subscribers.clear();
};
