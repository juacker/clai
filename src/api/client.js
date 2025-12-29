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
 * Create a new conversation in Netdata Cloud
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} Created conversation information
 * @throws {Error} If the request fails
 */
export const createConversation = async (spaceId, roomId) => {
  try {
    return await invoke('api_create_conversation', { spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to create conversation');
  }
};

/**
 * Get a specific conversation from Netdata Cloud
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation information
 * @throws {Error} If the request fails
 */
export const getConversation = async (spaceId, roomId, conversationId) => {
  try {
    return await invoke('api_get_conversation', { spaceId, roomId, conversationId });
  } catch (error) {
    handleApiError(error, 'Failed to get conversation');
  }
};

/**
 * List all conversations from a specific room in Netdata Cloud
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Array>} List of conversations
 * @throws {Error} If the request fails
 */
export const listConversations = async (spaceId, roomId) => {
  try {
    return await invoke('api_list_conversations', { spaceId, roomId });
  } catch (error) {
    handleApiError(error, 'Failed to list conversations');
  }
};

/**
 * Delete a specific conversation from Netdata Cloud
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {Error} If the request fails
 */
export const deleteConversation = async (spaceId, roomId, conversationId) => {
  try {
    return await invoke('api_delete_conversation', { spaceId, roomId, conversationId });
  } catch (error) {
    handleApiError(error, 'Failed to delete conversation');
  }
};

/**
 * Create a title for a conversation based on message content
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @param {string} messageContent - The message content to generate a title from
 * @returns {Promise<Object>} Object containing the generated title
 * @throws {Error} If the request fails
 */
export const createConversationTitle = async (spaceId, roomId, conversationId, messageContent) => {
  try {
    if (!messageContent || messageContent.trim() === '') {
      throw new Error('message_content is required and must not be empty');
    }
    return await invoke('api_create_conversation_title', {
      spaceId,
      roomId,
      conversationId,
      messageContent
    });
  } catch (error) {
    handleApiError(error, 'Failed to create conversation title');
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
export const createConversationCompat = async (token, spaceId, roomId) => createConversation(spaceId, roomId);
export const getConversationCompat = async (token, spaceId, roomId, conversationId) => getConversation(spaceId, roomId, conversationId);
export const listConversationsCompat = async (token, spaceId, roomId) => listConversations(spaceId, roomId);
export const deleteConversationCompat = async (token, spaceId, roomId, conversationId) => deleteConversation(spaceId, roomId, conversationId);
export const createConversationTitleCompat = async (token, spaceId, roomId, conversationId, messageContent) => createConversationTitle(spaceId, roomId, conversationId, messageContent);
export const createChatCompletionCompat = async (token, spaceId, roomId, conversationId, message, onChunk, parentMessageId) => createChatCompletion(spaceId, roomId, conversationId, message, onChunk, parentMessageId);
export const getDataCompat = async (token, spaceId, roomId, params) => getData(spaceId, roomId, params);
export const getContextsCompat = async (token, spaceId, roomId, params) => getContexts(spaceId, roomId, params);
