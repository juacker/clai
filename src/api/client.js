import axios from 'axios';

const NETDATA_CLOUD_BASE_URL = 'https://testing.netdata.cloud/api';

const client = axios.create({
  baseURL: NETDATA_CLOUD_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'netdata-clai',
  },
});

// Add response interceptor to handle authentication errors globally
client.interceptors.response.use(
  (response) => {
    // If the response is successful, just return it
    return response;
  },
  (error) => {
    // Check if the error is an authentication error (401 Unauthorized or 403 Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Clear the stored token
      localStorage.removeItem('netdata_token');
      // Redirect to login page
      window.location.href = '/login';
    }
    // Return the error to be handled by the calling code
    return Promise.reject(error);
  }
);

/**
 * Get user information from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @returns {Promise<Object>} User information
 * @throws {Error} If the request fails
 */
export const getUserInfo = async (token) => {
  try {
    const response = await client.get('/v2/accounts/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get user info: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get user info: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }
};

/**
 * Get spaces from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @returns {Promise<Object>} Spaces information
 * @throws {Error} If the request fails
 */
export const getSpaces = async (token) => {
  try {
    const response = await client.get('/v3/spaces', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get spaces: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get spaces: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get spaces: ${error.message}`);
    }
  }
};

/**
 * Get rooms from a specific space in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @returns {Promise<Object>} Rooms information
 * @throws {Error} If the request fails
 */
export const getRooms = async (token, spaceId) => {
  try {
    const response = await client.get(`/v2/spaces/${spaceId}/rooms`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      params: {
        show_all: true,
        default: false,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get rooms: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get rooms: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get rooms: ${error.message}`);
    }
  }
};

/**
 * Create a new conversation in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {Object} data - Conversation data (optional body for POST request)
 * @returns {Promise<Object>} Created conversation information
 * @throws {Error} If the request fails
 */
export const createConversation = async (token, spaceId, roomId, data = {}) => {
  try {
    const response = await client.post(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to create conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to create conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  }
};

/**
 * Get a specific conversation from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation information
 * @throws {Error} If the request fails
 */
export const getConversation = async (token, spaceId, roomId, conversationId) => {
  try {
    const response = await client.get(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }
};

/**
 * List all conversations from a specific room in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} List of conversations
 * @throws {Error} If the request fails
 */
export const listConversations = async (token, spaceId, roomId) => {
  try {
    const response = await client.get(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to list conversations: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to list conversations: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  }
};

/**
 * Delete a specific conversation from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {Error} If the request fails
 */
export const deleteConversation = async (token, spaceId, roomId, conversationId) => {
  try {
    const response = await client.delete(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to delete conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to delete conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }
};

/**
 * Create a chat completion in a conversation with SSE streaming support
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @param {string} message - The new user message in the conversation (mandatory)
 * @param {Function} onChunk - Callback function that receives each SSE chunk as it arrives
 * @param {string} [parentMessageId] - Optional parent message ID
 * @returns {Promise<void>} Resolves when the stream is complete
 * @throws {Error} If the request fails
 *
 * @example
 * await createChatCompletion(token, spaceId, roomId, convId, "Hello", (chunk) => {
 *   if (chunk.type === 'content_block_delta') {
 *     console.log(chunk.delta.text);
 *   }
 * });
 */
export const createChatCompletion = async (token, spaceId, roomId, conversationId, message, onChunk, parentMessageId) => {
  try {
    // Build request body, only include parent_message_id if provided
    const requestBody = {
      message,
      tools: [{ name: "blocks", version: 0 }]
    };
    if (parentMessageId) {
      requestBody.parent_message_id = parentMessageId;
    }

    const url = `${NETDATA_CLOUD_BASE_URL}/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}/completion`;

    // Use Fetch API for SSE streaming support
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'netdata-clai',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create chat completion: ${response.status} - ${errorText}`
      );
    }

    // Read the response as a stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
            onChunk(data);
          } catch (parseError) {
            console.error('Failed to parse SSE chunk:', parseError, line);
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        onChunk(data);
      } catch (parseError) {
        console.error('Failed to parse final SSE chunk:', parseError);
      }
    }
  } catch (error) {
    if (error.message.includes('Failed to create chat completion')) {
      throw error;
    } else {
      throw new Error(`Failed to create chat completion: ${error.message}`);
    }
  }
};

/**
 * Get data from Netdata Cloud with complex aggregation and filtering options
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {Object} params - Data query parameters
 * @param {Object} params.scope - Required scope definition
 * @param {string[]} params.scope.contexts - Array of context patterns
 * @param {string[]} params.scope.nodes - Array of node IDs
 * @param {string[]} [params.scope.instances] - Optional array of instance patterns
 * @param {string[]} [params.scope.dimensions] - Optional array of dimension names
 * @param {string[]} [params.scope.labels] - Optional array of label filters
 * @param {Object} params.window - Required time window
 * @param {number} params.window.after - Unix timestamp (seconds) for start time
 * @param {number} params.window.before - Unix timestamp (seconds) for end time
 * @param {number} [params.window.points] - Number of points to return
 * @param {number} [params.window.duration] - Duration in seconds
 * @param {number} [params.window.tier] - Data tier
 * @param {Object} [params.window.baseline] - Optional baseline window
 * @param {Object} params.aggregations - Aggregation configuration
 * @param {Object[]} params.aggregations.metrics - Array of metric aggregations
 * @param {string} params.aggregations.metrics[].aggregation - Aggregation function (sum, avg, min, max, etc.)
 * @param {string[]} [params.aggregations.metrics[].group_by] - Group by dimensions/nodes
 * @param {string[]} [params.aggregations.metrics[].group_by_label] - Group by label keys
 * @param {Object} params.aggregations.time - Time aggregation settings
 * @param {string} params.aggregations.time.time_group - Time grouping method
 * @param {number} params.aggregations.time.time_resampling - Resampling interval in seconds
 * @param {string} [params.aggregations.time.time_group_options] - Additional time group options
 * @param {Object} [params.selectors] - Optional data selectors (defaults to "*" for all)
 * @param {string[]} [params.selectors.contexts] - Context patterns to select
 * @param {string[]} [params.selectors.nodes] - Node IDs to select
 * @param {string[]} [params.selectors.instances] - Instance patterns to select
 * @param {string[]} [params.selectors.dimensions] - Dimension names to select
 * @param {string[]} [params.selectors.labels] - Label filters to select
 * @param {string[]} [params.selectors.alerts] - Alert filters to select
 * @param {string} [params.format] - Response format (default: "json2")
 * @param {string[]} [params.options] - Query options array
 * @param {number} [params.timeout] - Request timeout in milliseconds (default: 10000)
 * @returns {Promise<Object>} Data response
 * @throws {Error} If the request fails or required parameters are missing
 * 
 * @example
 * const data = await getData(token, spaceId, roomId, {
 *   scope: {
 *     contexts: ["system.cpu"],
 *     nodes: ["node1", "node2"]
 *   },
 *   window: {
 *     after: Math.floor(Date.now() / 1000) - 3600,
 *     before: Math.floor(Date.now() / 1000),
 *     points: 100
 *   },
 *   aggregations: {
 *     metrics: [
 *       { aggregation: "avg", group_by: ["dimension"] }
 *     ],
 *     time: {
 *       time_group: "average",
 *       time_resampling: 60
 *     }
 *   }
 * });
 */
export const getData = async (token, spaceId, roomId, params) => {
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

    // Build metrics array with proper structure
    const metrics = params.aggregations.metrics.map(metric => {
      const metricObj = {
        group_by: metric.group_by || [],
        group_by_label: metric.group_by_label || [],
        aggregation: metric.aggregation
      };
      return metricObj;
    });

    // Build selectors with defaults
    const selectors = {
      contexts: params.selectors?.contexts || ['*'],
      nodes: params.selectors?.nodes || ['*'],
      instances: params.selectors?.instances || ['*'],
      dimensions: params.selectors?.dimensions || ['*'],
      labels: params.selectors?.labels || ['*']
    };

    // Add alerts selector if provided
    if (params.selectors?.alerts) {
      selectors.alerts = params.selectors.alerts;
    }

    // Build scope object - only include dimensions, instances, labels if provided
    const scope = {
      contexts: params.scope.contexts,
      nodes: params.scope.nodes
    };

    if (params.scope.dimensions) {
      scope.dimensions = params.scope.dimensions;
    }
    if (params.scope.instances) {
      scope.instances = params.scope.instances;
    }
    if (params.scope.labels) {
      scope.labels = params.scope.labels;
    }

    // Build time aggregation
    const timeAggregation = {
      time_group: params.aggregations.time.time_group,
      time_resampling: params.aggregations.time.time_resampling
    };

    if (params.aggregations.time.time_group_options) {
      timeAggregation.time_group_options = params.aggregations.time.time_group_options;
    }

    // Build window object
    const window = {
      after: params.window.after,
      before: params.window.before
    };

    if (params.window.points !== undefined) {
      window.points = params.window.points;
    }
    if (params.window.duration !== undefined) {
      window.duration = params.window.duration;
    }
    if (params.window.tier !== undefined) {
      window.tier = params.window.tier;
    }
    if (params.window.baseline) {
      window.baseline = params.window.baseline;
    }

    // Build request body
    const requestBody = {
      format: params.format || 'json2',
      options: params.options || ['jsonwrap', 'nonzero', 'flip', 'ms', 'jw-anomaly-rates', 'minify'],
      scope,
      selectors,
      aggregations: {
        metrics,
        time: timeAggregation
      },
      window,
      timeout: params.timeout || 10000
    };

    const response = await client.post(
      `/v3/spaces/${spaceId}/rooms/${roomId}/data`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Failed to get data: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      throw new Error('Failed to get data: No response from server');
    } else {
      throw new Error(`Failed to get data: ${error.message}`);
    }
  }
};

export default client;

