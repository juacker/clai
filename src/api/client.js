import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Netdata Cloud API Client
 *
 * This module provides a JavaScript interface to the Netdata Cloud API.
 * All API calls are routed through the Rust backend via Tauri invoke.
 *
 * Key differences from the previous axios-based implementation:
 * - Token is stored securely in the OS keychain (managed by Rust)
 * - Token is never exposed to JavaScript
 * - All HTTP calls go through Rust for security
 * - SSE streaming uses Tauri events instead of fetch
 */

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Store the API token securely in the OS keychain
 * @param {string} token - The bearer token to store
 * @returns {Promise<void>}
 * @throws {Error} If token storage fails
 */
export const setToken = async (token) => {
  try {
    await invoke('set_token', { token });
  } catch (error) {
    throw new Error(`Failed to store token: ${error}`);
  }
};

/**
 * Check if a token is stored (user is authenticated)
 * @returns {Promise<boolean>} True if token exists
 */
export const hasToken = async () => {
  try {
    return await invoke('has_token');
  } catch (error) {
    console.error('Failed to check token:', error);
    return false;
  }
};

/**
 * Clear the stored token (logout)
 * @returns {Promise<void>}
 */
export const clearToken = async () => {
  try {
    await invoke('clear_token');
  } catch (error) {
    console.error('Failed to clear token:', error);
  }
};

/**
 * Set the API base URL
 * @param {string} url - The base URL (e.g., "https://app.netdata.cloud")
 * @returns {Promise<void>}
 */
export const setBaseUrl = async (url) => {
  try {
    await invoke('set_base_url', { url });
  } catch (error) {
    throw new Error(`Failed to set base URL: ${error}`);
  }
};

/**
 * Get the current API base URL
 * @returns {Promise<string>} The base URL
 */
export const getBaseUrl = async () => {
  try {
    return await invoke('get_base_url');
  } catch (error) {
    return 'https://app.netdata.cloud';
  }
};

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle API errors and redirect to login on 401
 * @param {Error} error - The error from invoke
 * @param {string} operation - Description of the operation that failed
 * @throws {Error} Re-throws the error after handling
 */
const handleApiError = (error, operation) => {
  const errorMessage = error.toString();

  // Check for authentication errors (401 Unauthorized)
  // The Rust backend returns errors like "ErrUnauthorized" or "401"
  if (errorMessage.includes('ErrUnauthorized') ||
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized')) {
    // Clear any cached state and redirect to login
    window.location.href = '/login';
  }

  throw new Error(`${operation}: ${errorMessage}`);
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get user information from Netdata Cloud
 * @returns {Promise<Object>} User information
 * @throws {Error} If the request fails
 */
export const getUserInfo = async () => {
  try {
    return await invoke('api_get_user_info');
  } catch (error) {
    handleApiError(error, 'Failed to get user info');
  }
};

/**
 * Get spaces from Netdata Cloud
 * @returns {Promise<Array>} Array of spaces
 * @throws {Error} If the request fails
 */
export const getSpaces = async () => {
  try {
    return await invoke('api_get_spaces');
  } catch (error) {
    handleApiError(error, 'Failed to get spaces');
  }
};

/**
 * Get rooms from a specific space in Netdata Cloud
 * @param {string} spaceId - Space ID
 * @returns {Promise<Array>} Array of rooms
 * @throws {Error} If the request fails
 */
export const getRooms = async (spaceId) => {
  try {
    return await invoke('api_get_rooms', { spaceId });
  } catch (error) {
    handleApiError(error, 'Failed to get rooms');
  }
};

/**
 * Get billing plan information for a specific space
 * @param {string} spaceId - Space ID
 * @returns {Promise<Object>} Billing plan information
 * @throws {Error} If the request fails
 */
export const getSpaceBillingPlan = async (spaceId) => {
  try {
    return await invoke('api_get_billing_plan', { spaceId });
  } catch (error) {
    handleApiError(error, 'Failed to get billing plan');
  }
};

/**
 * Create a chat completion in a conversation with SSE streaming support
 *
 * This function uses Tauri events for streaming. The Rust backend emits
 * 'chat-completion-chunk' events for each SSE chunk received.
 *
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @param {string} message - The user message
 * @param {Function} onChunk - Callback function that receives each SSE chunk
 * @param {string} [parentMessageId] - Optional parent message ID
 * @returns {Promise<void>} Resolves when the stream is complete
 * @throws {Error} If the request fails
 *
 * @example
 * await createChatCompletion(spaceId, roomId, convId, "Hello", (chunk) => {
 *   if (chunk.type === 'content_block_delta') {
 *     console.log(chunk.delta.text);
 *   }
 * });
 */
export const createChatCompletion = async (spaceId, roomId, conversationId, message, onChunk, parentMessageId) => {
  // Set up listener for streaming chunks before starting the request
  const unlisten = await listen('chat-completion-chunk', (event) => {
    onChunk(event.payload);
  });

  try {
    await invoke('api_chat_completion', {
      spaceId,
      roomId,
      conversationId,
      message,
      parentMessageId: parentMessageId || null
    });
  } catch (error) {
    handleApiError(error, 'Failed to create chat completion');
  } finally {
    // Always clean up the listener
    unlisten();
  }
};

/**
 * Get data from Netdata Cloud with complex aggregation and filtering options
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {Object} params - Data query parameters (see Rust DataQuery struct)
 * @returns {Promise<Object>} Data response
 * @throws {Error} If the request fails
 */
export const getData = async (spaceId, roomId, params) => {
  try {
    // Validate required parameters
    if (!params.scope || !params.scope.contexts || !params.scope.nodes) {
      throw new Error('scope.contexts and scope.nodes are required');
    }
    if (!params.window || params.window.after === undefined || params.window.before === undefined) {
      throw new Error('window.after and window.before are required');
    }
    if (!params.aggregations || !params.aggregations.metrics || !params.aggregations.time) {
      throw new Error('aggregations.metrics and aggregations.time are required');
    }

    // Build the query object to match Rust's DataQuery struct
    const query = {
      format: params.format || 'json2',
      options: params.options || ['jsonwrap', 'nonzero', 'flip', 'ms', 'jw-anomaly-rates', 'minify'],
      scope: {
        contexts: params.scope.contexts,
        nodes: params.scope.nodes,
        instances: params.scope.instances,
        dimensions: params.scope.dimensions,
        labels: params.scope.labels
      },
      selectors: {
        contexts: params.selectors?.contexts || ['*'],
        nodes: params.selectors?.nodes || ['*'],
        instances: params.selectors?.instances || ['*'],
        dimensions: params.selectors?.dimensions || ['*'],
        labels: params.selectors?.labels || ['*'],
        alerts: params.selectors?.alerts
      },
      aggregations: {
        metrics: params.aggregations.metrics.map(metric => ({
          aggregation: metric.aggregation,
          group_by: metric.group_by || [],
          group_by_label: metric.group_by_label || []
        })),
        time: {
          time_group: params.aggregations.time.time_group,
          time_resampling: params.aggregations.time.time_resampling,
          time_group_options: params.aggregations.time.time_group_options
        }
      },
      window: {
        after: params.window.after,
        before: params.window.before,
        points: params.window.points,
        duration: params.window.duration,
        tier: params.window.tier,
        baseline: params.window.baseline
      },
      timeout: params.timeout || 10000
    };

    return await invoke('api_get_data', { spaceId, roomId, query });
  } catch (error) {
    handleApiError(error, 'Failed to get data');
  }
};

/**
 * Get contexts from Netdata Cloud
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {Object} params - Contexts query parameters
 * @returns {Promise<Object>} Contexts response
 * @throws {Error} If the request fails
 */
export const getContexts = async (spaceId, roomId, params) => {
  try {
    // Build the query object to match Rust's ContextsQuery struct
    const query = {
      format: params.format || 'json2',
      scope: {
        contexts: params.scope?.contexts || ['*'],
        nodes: params.scope?.nodes || []
      },
      selectors: {
        contexts: params.selectors?.contexts || ['*'],
        nodes: params.selectors?.nodes || ['*']
      },
      window: {
        after: params.window.after,
        before: params.window.before
      },
      timeout: params.timeout || 20000
    };

    return await invoke('api_get_contexts', { spaceId, roomId, query });
  } catch (error) {
    handleApiError(error, 'Failed to get contexts');
  }
};

// ============================================================================
// Auto-pilot Functions
// ============================================================================

/**
 * Get auto-pilot status for a space/room
 * @param {string} spaceId - Space ID (UUID)
 * @param {string} roomId - Room ID (UUID)
 * @returns {Promise<Object>} Auto-pilot status
 * @property {boolean} enabled - Is auto-pilot active for this room?
 * @property {boolean} can_toggle - Can user change the toggle?
 * @property {boolean} via_all_nodes - Is it enabled via All Nodes?
 * @property {boolean} has_credits - Does space have AI credits?
 * @property {string|null} message - Explanation if can't toggle
 * @throws {Error} If the request fails
 */
export const getAutopilotStatus = async (spaceId, roomId) => {
  try {
    return await invoke('get_autopilot_status', { spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to get auto-pilot status');
  }
};

/**
 * Enable or disable auto-pilot for a room
 * @param {string} spaceId - Space ID (UUID)
 * @param {string} roomId - Room ID (UUID)
 * @param {boolean} enabled - Whether to enable or disable
 * @returns {Promise<void>}
 * @throws {Error} If the request fails (e.g., All Nodes is enabled, no credits)
 */
export const setAutopilotEnabled = async (spaceId, roomId, enabled) => {
  try {
    await invoke('set_autopilot_enabled', { spaceId, roomId, enabled });
  } catch (error) {
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} auto-pilot: ${error}`);
  }
};

/**
 * Get all rooms with auto-pilot enabled (for debugging/status display)
 * @returns {Promise<Object>} Map of space_id -> array of enabled room_ids
 * @throws {Error} If the request fails
 */
export const getAllAutopilotEnabled = async () => {
  try {
    return await invoke('get_all_autopilot_enabled');
  } catch (error) {
    handleApiError(error, 'Failed to get all auto-pilot settings');
  }
};

// ============================================================================
// AI Provider Functions
// ============================================================================

/**
 * Get the currently configured AI provider
 * @returns {Promise<Object>} Provider info
 * @property {Object|null} provider - The configured provider
 * @property {string|null} name - Human-readable provider name
 * @property {boolean} is_configured - Whether a provider is set
 * @throws {Error} If the request fails
 */
export const getAiProvider = async () => {
  try {
    return await invoke('get_ai_provider');
  } catch (error) {
    handleApiError(error, 'Failed to get AI provider');
  }
};

/**
 * Set the AI provider
 * @param {Object} provider - The provider config (e.g., { type: 'claude' })
 * @returns {Promise<Object>} Validated provider info
 * @throws {Error} If the provider is not available
 */
export const setAiProvider = async (provider) => {
  try {
    return await invoke('set_ai_provider', { provider });
  } catch (error) {
    throw new Error(`Failed to set AI provider: ${error}`);
  }
};

/**
 * Clear the AI provider configuration
 * @returns {Promise<void>}
 * @throws {Error} If the request fails
 */
export const clearAiProvider = async () => {
  try {
    await invoke('clear_ai_provider');
  } catch (error) {
    throw new Error(`Failed to clear AI provider: ${error}`);
  }
};

/**
 * Get all available AI providers on the system
 * @returns {Promise<Array>} Array of provider info objects
 * @property {Object} provider - The provider type
 * @property {string} name - Human-readable name
 * @property {string} command - CLI command
 * @property {string|null} version - Version string if detected
 * @property {boolean} available - Whether provider is working
 * @property {string|null} error - Error message if not available
 */
export const getAvailableAiProviders = async () => {
  try {
    return await invoke('get_available_ai_providers');
  } catch (error) {
    handleApiError(error, 'Failed to get available AI providers');
  }
};

/**
 * Validate a specific AI provider
 * @param {Object} provider - The provider config to validate
 * @returns {Promise<Object>} Validated provider info
 * @throws {Error} If the provider is not available
 */
export const validateAiProvider = async (provider) => {
  try {
    return await invoke('validate_ai_provider', { provider });
  } catch (error) {
    throw new Error(`Provider not available: ${error}`);
  }
};

// ============================================================================
// Agent Management
// ============================================================================

/**
 * Get all agents
 * @returns {Promise<Array>} List of agents
 */
export const getAgents = async () => {
  try {
    return await invoke('get_agents');
  } catch (error) {
    handleApiError(error, 'Failed to get agents');
  }
};

/**
 * Get a single agent by ID
 * @param {string} id - Agent ID
 * @returns {Promise<Object|null>} Agent or null if not found
 */
export const getAgent = async (id) => {
  try {
    return await invoke('get_agent', { id });
  } catch (error) {
    handleApiError(error, 'Failed to get agent');
  }
};

/**
 * Create a new agent
 * @param {Object} request - Agent creation request
 * @param {string} request.name - Agent name
 * @param {string} request.description - Agent description (supports markdown)
 * @param {number} request.intervalMinutes - Check interval in minutes
 * @returns {Promise<Object>} Created agent
 */
export const createAgent = async (request) => {
  try {
    return await invoke('create_agent', { request });
  } catch (error) {
    handleApiError(error, 'Failed to create agent');
  }
};

/**
 * Update an existing agent
 * @param {Object} request - Agent update request
 * @param {string} request.id - Agent ID
 * @param {string} request.name - Agent name
 * @param {string} request.description - Agent description
 * @param {number} request.intervalMinutes - Check interval in minutes
 * @returns {Promise<Object>} Updated agent
 */
export const updateAgent = async (request) => {
  try {
    return await invoke('update_agent', { request });
  } catch (error) {
    handleApiError(error, 'Failed to update agent');
  }
};

/**
 * Delete an agent
 * @param {string} id - Agent ID
 * @returns {Promise<void>}
 */
export const deleteAgent = async (id) => {
  try {
    return await invoke('delete_agent', { id });
  } catch (error) {
    handleApiError(error, 'Failed to delete agent');
  }
};

/**
 * Enable an agent for a specific space/room
 * @param {string} agentId - Agent ID
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Updated agent
 */
export const enableAgentForRoom = async (agentId, spaceId, roomId) => {
  try {
    return await invoke('enable_agent_for_room', { agentId, spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to enable agent');
  }
};

/**
 * Disable an agent for a specific space/room
 * @param {string} agentId - Agent ID
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Updated agent
 */
export const disableAgentForRoom = async (agentId, spaceId, roomId) => {
  try {
    return await invoke('disable_agent_for_room', { agentId, spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to disable agent');
  }
};

/**
 * Get all agents enabled for a specific space/room
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Array>} List of enabled agents
 */
export const getAgentsForRoom = async (spaceId, roomId) => {
  try {
    return await invoke('get_agents_for_room', { spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to get agents for room');
  }
};

/**
 * Toggle all agents on/off for a space/room
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {boolean} enabled - Whether to enable or disable
 * @returns {Promise<Object>} Toggle result with affected count
 */
export const toggleAgentsForRoom = async (spaceId, roomId, enabled) => {
  try {
    return await invoke('toggle_agents_for_room', { spaceId, roomId, enabled });
  } catch (error) {
    handleApiError(error, 'Failed to toggle agents');
  }
};

// ============================================================================
// Legacy Compatibility
// ============================================================================

// Note: The following functions previously accepted a 'token' parameter.
// They now ignore the token parameter for backward compatibility during migration.
// The token is handled internally by the Rust backend.

// Wrapper functions that accept but ignore the token parameter
// These will be removed after all consumers are updated

export const getUserInfoCompat = async (token) => getUserInfo();
export const getSpacesCompat = async (token) => getSpaces();
export const getRoomsCompat = async (token, spaceId) => getRooms(spaceId);
export const getSpaceBillingPlanCompat = async (token, spaceId) => getSpaceBillingPlan(spaceId);
export const createChatCompletionCompat = async (token, spaceId, roomId, conversationId, message, onChunk, parentMessageId) => createChatCompletion(spaceId, roomId, conversationId, message, onChunk, parentMessageId);
export const getDataCompat = async (token, spaceId, roomId, params) => getData(spaceId, roomId, params);
export const getContextsCompat = async (token, spaceId, roomId, params) => getContexts(spaceId, roomId, params);
