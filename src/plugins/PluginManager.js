/**
 * Plugin Manager
 *
 * Manages plugin instances lifecycle, storage, and discovery.
 * Handles creating, activating, deactivating, and destroying plugin instances.
 */

const STORAGE_KEY = 'clai_plugin_instances';
const OLD_REGISTRATION_KEY = 'clai_plugin_registrations'; // Deprecated, removed in Phase 2

/**
 * Generate a unique plugin instance ID
 * @param {string} pluginType - Plugin type identifier
 * @returns {string} Unique instance ID
 */
function generateInstanceId(pluginType) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${pluginType}_${timestamp}_${random}`;
}

export class PluginManager {
  constructor() {
    /**
     * Registry of available plugin types
     * @type {Map<string, Class>}
     */
    this.availablePlugins = new Map();

    /**
     * Active plugin instances
     * @type {Map<string, PluginInterface>}
     */
    this.instances = new Map();

    /**
     * Plugin instance metadata
     * @type {Map<string, Object>}
     */
    this.instanceMetadata = new Map();
  }

  // ============================================================================
  // PLUGIN TYPE REGISTRATION
  // ============================================================================

  /**
   * Register a plugin type
   * @param {Class} PluginClass - Plugin class that extends PluginInterface
   */
  registerPluginType(PluginClass) {
    if (!PluginClass.id) {
      throw new Error('Plugin must have a static id property');
    }

    this.availablePlugins.set(PluginClass.id, PluginClass);
    console.log(`[PluginManager] Registered plugin type: ${PluginClass.id}`);
  }

  /**
   * Get all available plugin types
   * @returns {Array<Object>} Array of plugin type metadata
   */
  getAvailablePluginTypes() {
    return Array.from(this.availablePlugins.entries()).map(([id, PluginClass]) => ({
      id,
      name: PluginClass.name,
      version: PluginClass.version,
      description: PluginClass.description,
      capabilities: PluginClass.capabilities || [],
      configSchema: PluginClass.configSchema
    }));
  }

  /**
   * Get a specific plugin type
   * @param {string} pluginTypeId - Plugin type ID
   * @returns {Class|null} Plugin class or null if not found
   */
  getPluginType(pluginTypeId) {
    return this.availablePlugins.get(pluginTypeId) || null;
  }

  // ============================================================================
  // PLUGIN INSTANCE MANAGEMENT
  // ============================================================================

  /**
   * Create a new plugin instance
   * @param {string} pluginTypeId - Plugin type ID
   * @param {Object} config - Complete plugin configuration (credentials + scope)
   * @param {string} instanceName - User-friendly instance name
   * @returns {Promise<Object>} Created instance metadata
   */
  async createInstance(pluginTypeId, config, instanceName) {
    const PluginClass = this.availablePlugins.get(pluginTypeId);

    if (!PluginClass) {
      throw new Error(`Plugin type not found: ${pluginTypeId}`);
    }

    // Generate unique instance ID
    const instanceId = generateInstanceId(pluginTypeId);

    // Create plugin instance
    const plugin = new PluginClass(config, instanceId, instanceName);

    // Validate configuration
    if (!plugin.validateConfig()) {
      throw new Error(`Invalid configuration for plugin: ${plugin.error}`);
    }

    // Initialize plugin
    try {
      await plugin.initialize();
    } catch (error) {
      console.error(`[PluginManager] Failed to initialize plugin ${instanceId}:`, error);
      plugin.setError(error);
      throw error;
    }

    // Store instance
    this.instances.set(instanceId, plugin);

    // Store metadata
    const metadata = {
      id: instanceId,
      type: pluginTypeId,
      name: instanceName,
      config,
      capabilities: plugin.getCapabilities(),
      status: plugin.status,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };
    this.instanceMetadata.set(instanceId, metadata);

    // Persist to storage
    this.saveToStorage();

    console.log(`[PluginManager] Created plugin instance: ${instanceId} (${instanceName})`);

    return metadata;
  }

  /**
   * Get a plugin instance
   * @param {string} instanceId - Plugin instance ID
   * @returns {PluginInterface|null} Plugin instance or null if not found
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get plugin instance metadata
   * @param {string} instanceId - Plugin instance ID
   * @returns {Object|null} Instance metadata or null if not found
   */
  getInstanceMetadata(instanceId) {
    return this.instanceMetadata.get(instanceId) || null;
  }

  /**
   * Get all plugin instances
   * @returns {Array<Object>} Array of instance metadata
   */
  getAllInstances() {
    return Array.from(this.instanceMetadata.values());
  }

  /**
   * Update plugin instance configuration
   * @param {string} instanceId - Plugin instance ID
   * @param {Object} newConfig - New configuration
   * @param {string} instanceName - Optional: New instance name
   * @returns {Promise<void>}
   */
  async updateInstanceConfig(instanceId, newConfig, instanceName) {
    const plugin = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!plugin || !metadata) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    // Update config
    plugin.config = { ...plugin.config, ...newConfig };
    metadata.config = plugin.config;

    // Update name if provided
    if (instanceName !== undefined && instanceName !== null) {
      plugin.name = instanceName;
      metadata.name = instanceName;
    }

    // Validate new config
    if (!plugin.validateConfig()) {
      throw new Error(`Invalid configuration: ${plugin.error}`);
    }

    // Re-initialize plugin
    try {
      await plugin.destroy();
      await plugin.initialize();
    } catch (error) {
      console.error(`[PluginManager] Failed to update plugin ${instanceId}:`, error);
      plugin.setError(error);
      throw error;
    }

    // Persist to storage
    this.saveToStorage();

    console.log(`[PluginManager] Updated plugin instance: ${instanceId}`);
  }

  /**
   * Remove a plugin instance
   * @param {string} instanceId - Plugin instance ID
   * @returns {Promise<void>}
   */
  async removeInstance(instanceId) {
    const plugin = this.instances.get(instanceId);

    if (!plugin) {
      console.warn(`[PluginManager] Plugin instance not found: ${instanceId}`);
      return;
    }

    // Destroy plugin
    try {
      await plugin.destroy();
    } catch (error) {
      console.error(`[PluginManager] Error destroying plugin ${instanceId}:`, error);
    }

    // Remove from maps
    this.instances.delete(instanceId);
    this.instanceMetadata.delete(instanceId);

    // Persist to storage
    this.saveToStorage();

    console.log(`[PluginManager] Removed plugin instance: ${instanceId}`);
  }

  /**
   * Activate a plugin instance
   * @param {string} instanceId - Plugin instance ID
   * @returns {Promise<void>}
   */
  async activateInstance(instanceId) {
    const plugin = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!plugin || !metadata) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    try {
      await plugin.activate();
      metadata.status = plugin.status;
      metadata.lastUsed = Date.now();
      this.saveToStorage();
    } catch (error) {
      console.error(`[PluginManager] Failed to activate plugin ${instanceId}:`, error);
      plugin.setError(error);
      throw error;
    }
  }

  /**
   * Deactivate a plugin instance
   * @param {string} instanceId - Plugin instance ID
   * @returns {Promise<void>}
   */
  async deactivateInstance(instanceId) {
    const plugin = this.instances.get(instanceId);
    const metadata = this.instanceMetadata.get(instanceId);

    if (!plugin || !metadata) {
      throw new Error(`Plugin instance not found: ${instanceId}`);
    }

    try {
      await plugin.deactivate();
      metadata.status = plugin.status;
      this.saveToStorage();
    } catch (error) {
      console.error(`[PluginManager] Failed to deactivate plugin ${instanceId}:`, error);
      plugin.setError(error);
      throw error;
    }
  }

  // ============================================================================
  // CAPABILITY-BASED DISCOVERY
  // ============================================================================

  /**
   * Get plugin instances that have a specific capability
   * @param {string} capability - Capability name
   * @param {Array<string>} instanceIds - Optional: Filter by specific instance IDs
   * @returns {Array<PluginInterface>} Array of plugin instances
   */
  getInstancesWithCapability(capability, instanceIds = null) {
    const instances = instanceIds
      ? instanceIds.map(id => this.instances.get(id)).filter(Boolean)
      : Array.from(this.instances.values());

    return instances.filter(plugin => plugin.hasCapability(capability));
  }

  /**
   * Get plugin instances that support data queries
   * @param {Array<string>} instanceIds - Optional: Filter by specific instance IDs
   * @returns {Array<PluginInterface>}
   */
  getDataProviders(instanceIds = null) {
    return this.getInstancesWithCapability('data', instanceIds);
  }

  /**
   * Get plugin instances that support chat
   * @param {Array<string>} instanceIds - Optional: Filter by specific instance IDs
   * @returns {Array<PluginInterface>}
   */
  getChatProviders(instanceIds = null) {
    return this.getInstancesWithCapability('chat', instanceIds);
  }

  /**
   * Get plugin instances that support alerts
   * @param {Array<string>} instanceIds - Optional: Filter by specific instance IDs
   * @returns {Array<PluginInterface>}
   */
  getAlertProviders(instanceIds = null) {
    return this.getInstancesWithCapability('alerts', instanceIds);
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Save plugin instances to localStorage
   */
  saveToStorage() {
    try {
      const data = {
        instances: Array.from(this.instanceMetadata.values())
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[PluginManager] Failed to save to storage:', error);
    }
  }

  /**
   * Load plugin instances from localStorage
   * @returns {Promise<void>}
   */
  async loadFromStorage() {
    try {
      // Clean up old registration storage (Phase 2 migration)
      if (localStorage.getItem(OLD_REGISTRATION_KEY)) {
        console.log('[PluginManager] Removing deprecated plugin registrations storage');
        localStorage.removeItem(OLD_REGISTRATION_KEY);
      }

      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        console.log('[PluginManager] No saved plugin instances found');
        return;
      }

      const { instances } = JSON.parse(data);

      // Recreate plugin instances
      for (const metadata of instances) {
        const PluginClass = this.availablePlugins.get(metadata.type);

        if (!PluginClass) {
          console.warn(`[PluginManager] Plugin type not found: ${metadata.type}, skipping instance ${metadata.id}`);
          continue;
        }

        try {
          // Create plugin instance
          const plugin = new PluginClass(
            metadata.config,
            metadata.id,
            metadata.name
          );

          // Initialize
          await plugin.initialize();

          // Store instance
          this.instances.set(metadata.id, plugin);
          this.instanceMetadata.set(metadata.id, metadata);

          console.log(`[PluginManager] Loaded plugin instance: ${metadata.id} (${metadata.name})`);
        } catch (error) {
          console.error(`[PluginManager] Failed to load plugin instance ${metadata.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[PluginManager] Failed to load from storage:', error);
    }
  }

  /**
   * Clear all plugin instances from storage
   */
  clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Get plugin statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    const instances = Array.from(this.instances.values());

    return {
      totalInstances: instances.length,
      activeInstances: instances.filter(p => p.status === 'active').length,
      errorInstances: instances.filter(p => p.status === 'error').length,
      byType: instances.reduce((acc, plugin) => {
        const type = plugin.constructor.id;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      byCapability: instances.reduce((acc, plugin) => {
        plugin.getCapabilities().forEach(cap => {
          acc[cap] = (acc[cap] || 0) + 1;
        });
        return acc;
      }, {})
    };
  }

  /**
   * Destroy all plugin instances
   * @returns {Promise<void>}
   */
  async destroyAll() {
    const instances = Array.from(this.instances.values());

    await Promise.all(
      instances.map(plugin =>
        plugin.destroy().catch(err =>
          console.error(`[PluginManager] Error destroying plugin:`, err)
        )
      )
    );

    this.instances.clear();
    this.instanceMetadata.clear();
  }
}

// Singleton instance
let pluginManagerInstance = null;

/**
 * Get the singleton PluginManager instance
 * @returns {PluginManager}
 */
export function getPluginManager() {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}

export default PluginManager;

