/**
 * Base Plugin Interface
 *
 * This class defines the contract that all CLAI plugins must implement.
 * Plugins can implement different capabilities (data, chat, alerts, etc.)
 * by implementing the corresponding methods.
 */
export class PluginInterface {
  /**
   * Plugin metadata - Should be overridden by implementing plugins
   */
  static id = 'plugin-id';
  static name = 'Plugin Name';
  static version = '1.0.0';
  static description = 'Plugin description';

  /**
   * Configuration schema (JSON Schema format)
   * Defines what configuration options the plugin needs
   * @type {Object}
   * @deprecated Use getRegistrationSchema() and getInstanceParametersSchema() instead
   */
  static configSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  /**
   * Plugin capabilities
   * Defines what features this plugin supports
   * @type {Array<string>}
   */
  static capabilities = [];

  // ============================================================================
  // SINGLE-LEVEL CONFIGURATION ARCHITECTURE
  // ============================================================================

  /**
   * Get configuration schema (Single-Level: Credentials + Scope)
   * Defines all configuration needed to fully configure a plugin instance
   * This includes both credentials AND context/scope selection
   * This is what users enter in the settings page to create a plugin
   *
   * The schema can include UI metadata to define configuration steps:
   * {
   *   type: 'object',
   *   properties: { ... },
   *   required: [ ... ],
   *   ui: {
   *     steps: [
   *       {
   *         id: 'credentials',
   *         title: 'Configure Credentials',
   *         description: 'Enter your credentials',
   *         fields: ['token', 'baseUrl'],
   *         helpText: 'Optional help text',
   *         onComplete: 'fetchContexts' // Special action: 'fetchContexts'
   *       },
   *       {
   *         id: 'scope',
   *         title: 'Select Scope',
   *         fields: ['spaceId', 'roomId']
   *       }
   *     ]
   *   }
   * }
   *
   * If no UI metadata is provided, all fields will be shown in a single step.
   *
   * @returns {Object} JSON Schema for complete configuration
   */
  static getConfigurationSchema() {
    // Default: Use configSchema or registrationSchema for backward compatibility
    if (this.configSchema && Object.keys(this.configSchema.properties || {}).length > 0) {
      return this.configSchema;
    }
    return this.getRegistrationSchema?.() || this.configSchema;
  }

  /**
   * Fetch available contexts based on partial configuration (e.g., credentials)
   * Used to dynamically populate context pickers during configuration
   * @param {Object} partialConfig - Partial config (e.g., credentials entered so far)
   * @returns {Promise<Object|null>} Available contexts, or null if not applicable
   */
  static async fetchAvailableContexts(partialConfig) {
    // Default: No contexts
    return null;
  }

  /**
   * Validate complete configuration with detailed error messages
   * Called by UI to validate configuration and show specific error messages
   * @param {Object} config - Complete configuration including credentials and scope
   * @param {Object} availableContexts - Available contexts for validation (optional)
   * @returns {Object} Validation result: { valid: boolean, error?: string }
   */
  static validateConfiguration(config, availableContexts = null) {
    // Default: Always valid
    return { valid: true };
  }

  /**
   * Constructor
   * @param {Object} config - Complete plugin configuration (credentials + scope)
   * @param {string} instanceId - Unique instance identifier
   * @param {string} instanceName - User-friendly instance name
   */
  constructor(config, instanceId, instanceName) {
    this.config = config;
    this.instanceId = instanceId;
    this.instanceName = instanceName;
    this.status = 'inactive'; // inactive | active | error
    this.error = null;
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initialize the plugin
   * Called when the plugin instance is created
   * Use this to set up connections, validate config, etc.
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Plugin must implement initialize()');
  }

  /**
   * Activate the plugin
   * Called when the plugin is added to a tab's active plugins
   * @returns {Promise<void>}
   */
  async activate() {
    this.status = 'active';
  }

  /**
   * Deactivate the plugin
   * Called when the plugin is removed from a tab's active plugins
   * @returns {Promise<void>}
   */
  async deactivate() {
    this.status = 'inactive';
  }

  /**
   * Destroy the plugin
   * Called when the plugin instance is removed completely
   * Clean up resources, close connections, etc.
   * @returns {Promise<void>}
   */
  async destroy() {
    this.status = 'inactive';
  }

  // ============================================================================
  // AUTHENTICATION CAPABILITY
  // ============================================================================

  /**
   * Authenticate with the data provider
   * @param {Object} credentials - Authentication credentials
   * @returns {Promise<Object>} Authentication result with token/session info
   */
  async authenticate(credentials) {
    throw new Error('Plugin must implement authenticate()');
  }

  /**
   * Check if the plugin is currently authenticated
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    throw new Error('Plugin must implement isAuthenticated()');
  }

  // ============================================================================
  // DATA CAPABILITY
  // ============================================================================

  /**
   * Query data from the provider
   * @param {Object} params - Query parameters (provider-specific)
   * @returns {Promise<Object>} Query results
   */
  async queryData(params) {
    throw new Error('Plugin must implement queryData()');
  }

  /**
   * Get metadata about available metrics, contexts, etc.
   * @param {Object} params - Metadata query parameters
   * @returns {Promise<Object>} Metadata results
   */
  async getMetadata(params) {
    throw new Error('Plugin must implement getMetadata()');
  }

  /**
   * Get available contexts (spaces, rooms, namespaces, etc.)
   * Used to populate context selection UI
   * @returns {Promise<Array>} Array of available contexts
   */
  async getAvailableContexts() {
    throw new Error('Plugin must implement getAvailableContexts()');
  }

  // ============================================================================
  // CHAT CAPABILITY (Optional)
  // ============================================================================

  /**
   * Create a new chat conversation
   * @param {Object} params - Chat creation parameters
   * @returns {Promise<Object>} Created chat object with id
   */
  async createChat(params) {
    throw new Error('Plugin does not support chat capability');
  }

  /**
   * Send a message to a chat
   * @param {string} chatId - Chat conversation ID
   * @param {string} message - Message content
   * @param {Object} options - Additional options (streaming, etc.)
   * @returns {Promise<Object>} Response object
   */
  async sendMessage(chatId, message, options = {}) {
    throw new Error('Plugin does not support chat capability');
  }

  /**
   * List all chat conversations
   * @returns {Promise<Array>} Array of chat objects
   */
  async listChats() {
    throw new Error('Plugin does not support chat capability');
  }

  /**
   * Get a specific chat conversation
   * @param {string} chatId - Chat conversation ID
   * @returns {Promise<Object>} Chat object
   */
  async getChat(chatId) {
    throw new Error('Plugin does not support chat capability');
  }

  /**
   * Delete a chat conversation
   * @param {string} chatId - Chat conversation ID
   * @returns {Promise<void>}
   */
  async deleteChat(chatId) {
    throw new Error('Plugin does not support chat capability');
  }

  /**
   * Update chat title
   * @param {string} chatId - Chat conversation ID
   * @param {string} title - New title
   * @returns {Promise<void>}
   */
  async updateChatTitle(chatId, title) {
    throw new Error('Plugin does not support chat capability');
  }

  // ============================================================================
  // CONTEXT DISPLAY
  // ============================================================================

  /**
   * Get context display information
   * Returns how this plugin's context should be displayed in the UI
   * @returns {Object} Context display object { label, value, details }
   */
  getContextDisplay() {
    return {
      label: this.instanceName,
      value: this.instanceId,
      details: {}
    };
  }

  /**
   * Get plugin-specific context information
   * Returns key-value pairs to display in context panel
   * @returns {Object} Context information object
   */
  getContextInfo() {
    return {};
  }

  // ============================================================================
  // STATUS & CAPABILITIES
  // ============================================================================

  /**
   * Get plugin status
   * @returns {Object} Status object with health, metrics, etc.
   */
  getStatus() {
    return {
      status: this.status,
      error: this.error,
      instanceId: this.instanceId,
      instanceName: this.instanceName
    };
  }

  /**
   * Get plugin capabilities
   * @returns {Array<string>} Array of capability names
   */
  getCapabilities() {
    return this.constructor.capabilities || [];
  }

  /**
   * Check if plugin has a specific capability
   * @param {string} capability - Capability name
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.getCapabilities().includes(capability);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Set plugin error state
   * @param {Error} error - Error object
   */
  setError(error) {
    this.status = 'error';
    this.error = error.message || String(error);
  }

  /**
   * Clear plugin error state
   */
  clearError() {
    this.error = null;
    if (this.status === 'error') {
      this.status = 'inactive';
    }
  }

  /**
   * Validate configuration against schema
   * @returns {boolean}
   */
  validateConfig() {
    // Basic validation - can be enhanced with a JSON Schema validator
    const schema = this.constructor.configSchema;
    if (!schema || !schema.required) return true;

    for (const field of schema.required) {
      if (!(field in this.config)) {
        this.setError(new Error(`Missing required configuration field: ${field}`));
        return false;
      }
    }

    return true;
  }
}

/**
 * Standard capability names
 */
export const PLUGIN_CAPABILITIES = {
  DATA: 'data',           // Can query metrics/data
  CONTEXT: 'context',     // Has context hierarchy (spaces/rooms/etc.)
  AUTH: 'auth'            // Requires authentication
};

export default PluginInterface;

