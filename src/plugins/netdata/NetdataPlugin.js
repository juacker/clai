import { PluginInterface, PLUGIN_CAPABILITIES } from '../PluginInterface';
import { NetdataAPI } from './NetdataAPI';

/**
 * Netdata Plugin
 * Provides integration with Netdata Cloud for monitoring data and AI chat
 */
export class NetdataPlugin extends PluginInterface {
  // Plugin metadata
  static id = 'netdata';
  static name = 'Netdata';
  static version = '1.0.0';
  static description = 'Netdata Cloud monitoring and observability platform';

  // Plugin capabilities
  static capabilities = [
    PLUGIN_CAPABILITIES.DATA,
    PLUGIN_CAPABILITIES.CHAT,
    PLUGIN_CAPABILITIES.CONTEXT,
    PLUGIN_CAPABILITIES.AUTH,
    PLUGIN_CAPABILITIES.STREAMING
  ];

  /**
   * Get configuration schema (Single-Level: Credentials + Scope)
   * This is what users enter in the settings page to fully configure Netdata
   * Combines credentials AND scope selection in one step
   * @returns {Object} JSON Schema for complete configuration
   */
  static getConfigurationSchema() {
    return {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          title: 'Authentication Token',
          description: 'Netdata Cloud Bearer token',
          minLength: 1
        },
        baseUrl: {
          type: 'string',
          title: 'Base URL',
          description: 'Netdata Cloud base URL',
          default: 'https://app.netdata.cloud',
          pattern: '^https?://.+'
        },
        spaceId: {
          type: 'string',
          title: 'Space',
          description: 'Select the Netdata Cloud space',
          // Will be populated dynamically after credentials are entered
          dynamicEnum: true
        },
        roomId: {
          type: 'string',
          title: 'Room',
          description: 'Select the room within the space',
          dependsOn: 'spaceId', // This field depends on spaceId selection
          // Will be populated dynamically based on selected space
          dynamicEnum: true
        }
      },
      required: ['token', 'baseUrl', 'spaceId', 'roomId'],
      // UI metadata: Define configuration flow
      ui: {
        steps: [
          {
            id: 'credentials',
            title: 'Configure Credentials',
            description: 'Enter your Netdata Cloud credentials',
            fields: ['token', 'baseUrl'],
            helpText: '💡 After entering credentials, we\'ll fetch available spaces and rooms for you to select.',
            onComplete: 'fetchContexts' // Fetch contexts after this step
          },
          {
            id: 'scope',
            title: 'Select Scope',
            description: 'Choose the space and room to monitor',
            fields: ['spaceId', 'roomId'],
            helpText: '💡 Select the space and room you want to monitor. You can create multiple configurations for different spaces/rooms.'
          }
        ]
      }
    };
  }

  /**
   * Fetch available contexts (spaces and rooms) based on credentials
   * Used to populate space/room pickers during configuration
   * @param {Object} credentials - Partial config with credentials
   * @param {string} credentials.token - Authentication token
   * @param {string} credentials.baseUrl - Netdata Cloud base URL
   * @returns {Promise<Object>} Available spaces and rooms
   */
  static async fetchAvailableContexts(credentials) {
    try {
      const api = new NetdataAPI({
        baseUrl: credentials.baseUrl,
        token: credentials.token
      });

      // Fetch spaces
      const spacesResponse = await api.getSpaces();
      // The API returns an array directly, not wrapped in {spaces: [...]}
      const spaces = Array.isArray(spacesResponse) ? spacesResponse : (spacesResponse.spaces || []);

      // Fetch rooms for each space
      const spacesWithRooms = await Promise.all(
        spaces.map(async (space) => {
          try {
            const roomsResponse = await api.getRooms(space.id);
            // The API returns an array directly, not wrapped in {rooms: [...]}
            const rooms = Array.isArray(roomsResponse) ? roomsResponse : (roomsResponse.rooms || []);
            return {
              id: space.id,
              name: space.name,
              rooms: rooms.map(room => ({
                id: room.id,
                name: room.name
              }))
            };
          } catch (error) {
            console.error(`[NetdataPlugin] Failed to fetch rooms for space ${space.id}:`, error);
            return {
              id: space.id,
              name: space.name,
              rooms: []
            };
          }
        })
      );

      return {
        spaces: spacesWithRooms
      };
    } catch (error) {
      console.error('[NetdataPlugin] Failed to fetch available contexts:', error);
      throw new Error(`Failed to fetch Netdata contexts: ${error.message}`);
    }
  }

  /**
   * Validate complete configuration with detailed error messages
   * @param {Object} config - Full configuration including credentials and scope
   * @param {Object} availableContexts - Available contexts for validation (optional)
   * @returns {Object} Validation result: { valid: boolean, error?: string }
   */
  static validateConfiguration(config, availableContexts = null) {
    // Validate credentials
    if (!config.token) {
      return { valid: false, error: 'Authentication token is required' };
    }

    if (!config.baseUrl) {
      return { valid: false, error: 'Base URL is required' };
    }

    // Validate scope
    if (!config.spaceId) {
      return { valid: false, error: 'Please select a space' };
    }

    if (!config.roomId) {
      return { valid: false, error: 'Please select a room' };
    }

    // Optional: Validate that space/room exist in availableContexts
    if (availableContexts?.spaces) {
      const space = availableContexts.spaces.find(s => s.id === config.spaceId);
      if (!space) {
        return { valid: false, error: 'Selected space not found' };
      }

      const room = space.rooms?.find(r => r.id === config.roomId);
      if (!room) {
        return { valid: false, error: 'Selected room not found' };
      }
    }

    return { valid: true };
  }

  // ============================================================================
  // DEPRECATED METHODS (for backward compatibility)
  // ============================================================================

  /**
   * @deprecated Use getConfigurationSchema() instead
   * Get registration schema (Level 1: Credentials)
   */
  static getRegistrationSchema() {
    return {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          title: 'Authentication Token',
          description: 'Netdata Cloud Bearer token',
          minLength: 1
        },
        baseUrl: {
          type: 'string',
          title: 'Base URL',
          description: 'Netdata Cloud base URL',
          default: 'https://app.netdata.cloud',
          pattern: '^https?://.+'
        }
      },
      required: ['token', 'baseUrl']
    };
  }

  /**
   * @deprecated Use getConfigurationSchema() instead
   * Get instance configuration schema for UI rendering
   */
  static getInstanceConfigSchema(availableContexts) {
    const spaces = availableContexts?.spaces || [];

    return {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          title: 'Space',
          description: 'Select the Netdata Cloud space',
          enum: spaces.map(s => s.id),
          enumNames: spaces.map(s => s.name)
        },
        roomId: {
          type: 'string',
          title: 'Room',
          description: 'Select the room within the space',
          dependsOn: 'spaceId'
        }
      },
      required: ['spaceId', 'roomId']
    };
  }

  /**
   * @deprecated Use validateConfiguration() instead
   * Validate instance configuration with detailed error messages
   */
  static validateInstanceConfig(config, availableContexts) {
    return this.validateConfiguration(config, availableContexts);
  }

  /**
   * Constructor
   * @param {Object} config - Complete plugin configuration (credentials + scope)
   * @param {string} instanceId - Unique instance identifier
   * @param {string} instanceName - User-friendly instance name
   */
  constructor(config, instanceId, instanceName) {
    super(config, instanceId, instanceName);

    // Validate required config
    if (!config.token || !config.baseUrl || !config.spaceId || !config.roomId) {
      throw new Error('Netdata plugin requires token, baseUrl, spaceId, and roomId');
    }

    // Create API client
    this.api = new NetdataAPI({
      baseUrl: config.baseUrl,
      token: config.token
    });

    // Cache for spaces/rooms data
    this._spacesCache = null;
    this._roomsCache = {};
    this._userInfoCache = null;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initialize the plugin
   * Validates credentials and fetches initial data
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Validate credentials by fetching user info
      await this.getUserInfo();

      // Fetch and cache spaces/rooms
      await this.getAvailableContexts();

      this.status = 'active';
      this.clearError();
    } catch (error) {
      this.setError(error);
      throw error;
    }
  }

  /**
   * Activate the plugin
   * @returns {Promise<void>}
   */
  async activate() {
    await super.activate();
    // Could refresh cached data here if needed
  }

  /**
   * Deactivate the plugin
   * @returns {Promise<void>}
   */
  async deactivate() {
    await super.deactivate();
  }

  /**
   * Destroy the plugin
   * Clean up resources
   * @returns {Promise<void>}
   */
  async destroy() {
    this._spacesCache = null;
    this._roomsCache = {};
    this._userInfoCache = null;
    await super.destroy();
  }

  // ============================================================================
  // AUTHENTICATION CAPABILITY
  // ============================================================================

  /**
   * Authenticate with Netdata Cloud
   * @param {Object} credentials - Authentication credentials
   * @param {string} credentials.token - Bearer token
   * @returns {Promise<Object>} Authentication result
   */
  async authenticate(credentials) {
    try {
      this.api.setToken(credentials.token);
      const userInfo = await this.api.getUserInfo();
      this._userInfoCache = userInfo;
      return {
        success: true,
        user: userInfo
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Check if the plugin is currently authenticated
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    try {
      await this.api.getUserInfo();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cached or fetch user info
   * @returns {Promise<Object>} User information
   */
  async getUserInfo() {
    if (!this._userInfoCache) {
      this._userInfoCache = await this.api.getUserInfo();
    }
    return this._userInfoCache;
  }

  // ============================================================================
  // DATA CAPABILITY
  // ============================================================================

  /**
   * Query data from Netdata
   * @param {Object} params - Query parameters (Netdata-specific format)
   * @returns {Promise<Object>} Query results
   */
  async queryData(params) {
    try {
      return await this.api.getData(
        this.config.spaceId,
        this.config.roomId,
        params
      );
    } catch (error) {
      throw new Error(`Failed to query data: ${error.message}`);
    }
  }

  /**
   * Get metadata about available metrics, contexts, etc.
   * @param {Object} params - Metadata query parameters
   * @returns {Promise<Object>} Metadata results
   */
  async getMetadata(params) {
    try {
      return await this.api.getContexts(
        this.config.spaceId,
        this.config.roomId,
        params
      );
    } catch (error) {
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  /**
   * Get available contexts (spaces and rooms)
   * @returns {Promise<Object>} Available contexts
   */
  async getAvailableContexts() {
    try {
      // Fetch spaces if not cached
      if (!this._spacesCache) {
        const spacesResponse = await this.api.getSpaces();
        // The API returns an array directly, not wrapped in {spaces: [...]}
        this._spacesCache = Array.isArray(spacesResponse) ? spacesResponse : (spacesResponse.spaces || []);
      }

      // Fetch rooms for current space if not cached
      if (!this._roomsCache[this.config.spaceId]) {
        const roomsResponse = await this.api.getRooms(this.config.spaceId);
        // The API returns an array directly, not wrapped in {rooms: [...]}
        this._roomsCache[this.config.spaceId] = Array.isArray(roomsResponse) ? roomsResponse : (roomsResponse.rooms || []);
      }

      return {
        spaces: this._spacesCache,
        rooms: this._roomsCache[this.config.spaceId] || []
      };
    } catch (error) {
      throw new Error(`Failed to get available contexts: ${error.message}`);
    }
  }

  // ============================================================================
  // CHAT CAPABILITY
  // ============================================================================

  /**
   * Create a new chat conversation
   * @param {Object} params - Chat creation parameters
   * @returns {Promise<Object>} Created chat object with id
   */
  async createChat(params = {}) {
    try {
      return await this.api.createConversation(
        this.config.spaceId,
        this.config.roomId,
        params
      );
    } catch (error) {
      throw new Error(`Failed to create chat: ${error.message}`);
    }
  }

  /**
   * Send a message to a chat
   * @param {string} chatId - Chat conversation ID
   * @param {string} message - Message content
   * @param {Object} options - Additional options
   * @param {Function} options.onChunk - Callback for streaming chunks
   * @param {string} options.parentMessageId - Parent message ID
   * @returns {Promise<Object>} Response object
   */
  async sendMessage(chatId, message, options = {}) {
    try {
      if (options.onChunk) {
        // Streaming mode
        await this.api.createChatCompletion(
          this.config.spaceId,
          this.config.roomId,
          chatId,
          message,
          options.onChunk,
          options.parentMessageId
        );
        return { success: true, streaming: true };
      } else {
        // Non-streaming mode (not typically used with Netdata)
        throw new Error('Non-streaming chat not supported by Netdata');
      }
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * List all chat conversations
   * @returns {Promise<Array>} Array of chat objects
   */
  async listChats() {
    try {
      const response = await this.api.listConversations(
        this.config.spaceId,
        this.config.roomId
      );
      return response.conversations || [];
    } catch (error) {
      throw new Error(`Failed to list chats: ${error.message}`);
    }
  }

  /**
   * Get a specific chat conversation
   * @param {string} chatId - Chat conversation ID
   * @returns {Promise<Object>} Chat object
   */
  async getChat(chatId) {
    try {
      return await this.api.getConversation(
        this.config.spaceId,
        this.config.roomId,
        chatId
      );
    } catch (error) {
      throw new Error(`Failed to get chat: ${error.message}`);
    }
  }

  /**
   * Delete a chat conversation
   * @param {string} chatId - Chat conversation ID
   * @returns {Promise<void>}
   */
  async deleteChat(chatId) {
    try {
      await this.api.deleteConversation(
        this.config.spaceId,
        this.config.roomId,
        chatId
      );
    } catch (error) {
      throw new Error(`Failed to delete chat: ${error.message}`);
    }
  }

  /**
   * Update chat title
   * @param {string} chatId - Chat conversation ID
   * @param {string} messageContent - Message content to generate title from
   * @returns {Promise<Object>} Object with generated title
   */
  async updateChatTitle(chatId, messageContent) {
    try {
      return await this.api.createConversationTitle(
        this.config.spaceId,
        this.config.roomId,
        chatId,
        messageContent
      );
    } catch (error) {
      throw new Error(`Failed to update chat title: ${error.message}`);
    }
  }

  // ============================================================================
  // CONTEXT DISPLAY
  // ============================================================================

  /**
   * Get context display information
   * @returns {Object} Context display object
   */
  getContextDisplay() {
    return {
      label: this.instanceName,
      value: `${this.config.spaceId}/${this.config.roomId}`,
      details: {
        type: 'Netdata',
        spaceId: this.config.spaceId,
        roomId: this.config.roomId
      }
    };
  }

  /**
   * Get plugin-specific context information
   * Returns key-value pairs to display in context panel
   * @returns {Object} Context information object
   */
  getContextInfo() {
    return {
      'Plugin': 'Netdata',
      'Space ID': this.config.spaceId,
      'Room ID': this.config.roomId,
      'Base URL': this.config.baseUrl
    };
  }

  // ============================================================================
  // STATUS & HEALTH
  // ============================================================================

  /**
   * Get plugin status
   * @returns {Object} Status object with health, metrics, etc.
   */
  getStatus() {
    return {
      ...super.getStatus(),
      config: {
        spaceId: this.config.spaceId,
        roomId: this.config.roomId,
        baseUrl: this.config.baseUrl,
        hasToken: !!this.config.token
      },
      cacheStatus: {
        spacesLoaded: !!this._spacesCache,
        roomsLoaded: !!this._roomsCache[this.config.spaceId],
        userInfoLoaded: !!this._userInfoCache
      }
    };
  }
}

export default NetdataPlugin;

