import axios from 'axios';

/**
 * Netdata Cloud API Client
 * Handles all communication with Netdata Cloud APIs
 */
export class NetdataAPI {
  /**
   * Create a new Netdata API client
   * @param {Object} config - Configuration object
   * @param {string} config.baseUrl - Base URL for Netdata Cloud (e.g., https://app.netdata.cloud)
   * @param {string} config.token - Authentication token (Bearer token)
   */
  constructor(config) {
    this.baseUrl = config.baseUrl || 'https://app.netdata.cloud';
    this.token = config.token;

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'netdata-clai',
      },
    });

    // Add request interceptor to inject token
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers['Authorization'] = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          // Authentication error - let the plugin handle it
          const authError = new Error('Authentication failed');
          authError.status = error.response.status;
          authError.isAuthError = true;
          return Promise.reject(authError);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Update the authentication token
   * @param {string} token - New authentication token
   */
  setToken(token) {
    this.token = token;
  }

  /**
   * Update the base URL
   * @param {string} baseUrl - New base URL
   */
  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl;
    this.client.defaults.baseURL = baseUrl;
  }

  // ============================================================================
  // USER & ACCOUNT APIs
  // ============================================================================

  /**
   * Get user information from Netdata Cloud
   * @returns {Promise<Object>} User information
   * @throws {Error} If the request fails
   */
  async getUserInfo() {
    try {
      const response = await this.client.get('/api/v2/accounts/me');
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get user info');
    }
  }

  // ============================================================================
  // SPACE & ROOM APIs
  // ============================================================================

  /**
   * Get spaces from Netdata Cloud
   * @returns {Promise<Object>} Spaces information
   * @throws {Error} If the request fails
   */
  async getSpaces() {
    try {
      const response = await this.client.get('/api/v3/spaces');
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get spaces');
    }
  }

  /**
   * Get rooms from a specific space in Netdata Cloud
   * @param {string} spaceId - Space ID
   * @returns {Promise<Object>} Rooms information
   * @throws {Error} If the request fails
   */
  async getRooms(spaceId) {
    try {
      const response = await this.client.get(`/api/v2/spaces/${spaceId}/rooms`, {
        params: {
          show_all: true,
          default: false,
        },
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get rooms');
    }
  }

  // ============================================================================
  // CONVERSATION APIs (Chat)
  // ============================================================================

  /**
   * Create a new conversation in Netdata Cloud
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @param {Object} data - Conversation data (optional body for POST request)
   * @returns {Promise<Object>} Created conversation information
   * @throws {Error} If the request fails
   */
  async createConversation(spaceId, roomId, data = {}) {
    try {
      const response = await this.client.post(
        `/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`,
        data
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to create conversation');
    }
  }

  /**
   * Get a specific conversation from Netdata Cloud
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Conversation information
   * @throws {Error} If the request fails
   */
  async getConversation(spaceId, roomId, conversationId) {
    try {
      const response = await this.client.get(
        `/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get conversation');
    }
  }

  /**
   * List all conversations from a specific room in Netdata Cloud
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @returns {Promise<Object>} List of conversations
   * @throws {Error} If the request fails
   */
  async listConversations(spaceId, roomId) {
    try {
      const response = await this.client.get(
        `/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to list conversations');
    }
  }

  /**
   * Delete a specific conversation from Netdata Cloud
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Deletion confirmation
   * @throws {Error} If the request fails
   */
  async deleteConversation(spaceId, roomId, conversationId) {
    try {
      const response = await this.client.delete(
        `/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to delete conversation');
    }
  }

  /**
   * Create a title for a conversation based on message content
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @param {string} conversationId - Conversation ID
   * @param {string} messageContent - The message content to generate a title from (required, must not be empty)
   * @returns {Promise<Object>} Object containing the generated title
   * @throws {Error} If the request fails
   *
   * @example
   * const result = await api.createConversationTitle(spaceId, roomId, convId, "What's the current CPU usage?");
   * console.log(result.title); // "CPU Usage Analysis"
   */
  async createConversationTitle(spaceId, roomId, conversationId, messageContent) {
    try {
      // Validate that messageContent is not empty
      if (!messageContent || messageContent.trim() === '') {
        throw new Error('message_content is required and must not be empty');
      }

      const response = await this.client.post(
        `/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}/title`,
        {
          message_content: messageContent,
        }
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to create conversation title');
    }
  }

  /**
   * Create a chat completion in a conversation with SSE streaming support
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
   * await api.createChatCompletion(spaceId, roomId, convId, "Hello", (chunk) => {
   *   if (chunk.type === 'content_block_delta') {
   *     console.log(chunk.delta.text);
   *   }
   * });
   */
  async createChatCompletion(spaceId, roomId, conversationId, message, onChunk, parentMessageId) {
    try {
      // Build request body, only include parent_message_id if provided
      const requestBody = {
        message,
        tools: [{ name: "blocks", version: 0 }]
      };
      if (parentMessageId) {
        requestBody.parent_message_id = parentMessageId;
      }

      const url = `${this.baseUrl}/api/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}/completion`;

      // Use Fetch API for SSE streaming support
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
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
  }

  // ============================================================================
  // DATA APIs
  // ============================================================================

  /**
   * Get data from Netdata Cloud with complex aggregation and filtering options
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
   * const data = await api.getData(spaceId, roomId, {
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
  async getData(spaceId, roomId, params) {
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

      const response = await this.client.post(
        `/api/v3/spaces/${spaceId}/rooms/${roomId}/data`,
        requestBody
      );

      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get data');
    }
  }

  /**
   * Get contexts from Netdata Cloud
   * @param {string} spaceId - Space ID
   * @param {string} roomId - Room ID
   * @param {Object} params - Contexts query parameters
   * @param {Object} [params.scope] - Optional scope definition
   * @param {string[]} [params.scope.contexts] - Optional array of context patterns
   * @param {string[]} [params.scope.nodes] - Optional array of node IDs
   * @param {Object} params.window - time window
   * @param {number} params.window.after - Unix timestamp (seconds) for start time
   * @param {number} params.window.before - Unix timestamp (seconds) for end time
   * @param {Object} [params.selectors] - Optional data selectors (defaults to "*" for all)
   * @param {string[]} [params.selectors.contexts] - Context patterns to select
   * @param {string[]} [params.selectors.nodes] - Node IDs to select
   * @returns {Promise<Object>} Data response
   * @throws {Error} If the request fails or required parameters are missing
   *
   * @example
   * const data = await api.getContexts(spaceId, roomId, {
   *   scope: {
   *     nodes: ["node1", "node2"]
   *   },
   *   window: {
   *     after: Math.floor(Date.now() / 1000) - 3600,
   *     before: Math.floor(Date.now() / 1000),
   *   }
   * });
   */
  async getContexts(spaceId, roomId, params) {
    try {
      // Build selectors with defaults
      const selectors = {
        contexts: params.selectors?.contexts || ['*'],
        nodes: params.selectors?.nodes || ['*'],
      };

      // Build scope object
      const scope = {
        contexts: params?.scope?.contexts || ['*'],
        nodes: params?.scope?.nodes || []
      };

      // Build window object
      const window = {
        after: params.window.after,
        before: params.window.before
      };

      // Build request body
      const requestBody = {
        format: params.format || 'json2',
        scope,
        selectors,
        window,
        timeout: params.timeout || 20000
      };

      const response = await this.client.post(
        `/api/v3/spaces/${spaceId}/rooms/${roomId}/contexts`,
        requestBody
      );

      return response.data;
    } catch (error) {
      throw this._handleError(error, 'Failed to get contexts');
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Handle API errors consistently
   * @private
   * @param {Error} error - The error object
   * @param {string} message - Custom error message
   * @returns {Error} Formatted error
   */
  _handleError(error, message) {
    if (error.response) {
      // Server responded with error status
      const errorMsg = error.response.data?.message || error.response.statusText;
      return new Error(`${message}: ${error.response.status} - ${errorMsg}`);
    } else if (error.request) {
      // Request was made but no response received
      return new Error(`${message}: No response from server`);
    } else {
      // Error setting up the request
      return new Error(`${message}: ${error.message}`);
    }
  }
}

export default NetdataAPI;

