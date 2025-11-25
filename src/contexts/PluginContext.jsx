/**
 * PluginContext
 *
 * Provides access to the plugin system throughout the application.
 * Manages global plugin instances and per-tab active plugins.
 *
 * Architecture:
 * - Global plugin instances: All configured plugin instances (stored in PluginManager)
 * - Per-tab active plugins: Each tab has its own list of active plugin IDs
 * - Capability-based discovery: Components query for plugins by capability from active plugins
 *
 * Usage:
 * - Use `usePlugin()` hook to access plugin functionality
 * - Components query for plugins with specific capabilities
 * - Tabs manage their own active plugin lists
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getPluginManager } from '../plugins/PluginManager';
import { initializePluginSystem } from '../plugins/PluginRegistry';

const PluginContext = createContext(null);

/**
 * PluginProvider - Global plugin system provider
 * Should be placed at the root of the application
 */
export function PluginProvider({ children }) {
  const [pluginManager] = useState(() => getPluginManager());
  const [allPluginInstances, setAllPluginInstances] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize plugin system on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        await initializePluginSystem();
        setIsInitialized(true);

        // Load all plugin instances
        const instances = pluginManager.getAllInstances();
        setAllPluginInstances(instances);
      } catch (error) {
        console.error('[PluginContext] Failed to initialize plugin system:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [pluginManager]);

  // ============================================================================
  // GLOBAL PLUGIN INSTANCE MANAGEMENT
  // ============================================================================

  /**
   * Create a new plugin instance with complete configuration
   * @param {string} pluginTypeId - Plugin type ID
   * @param {Object} config - Complete plugin configuration (credentials + scope)
   * @param {string} instanceName - User-friendly instance name
   */
  const createPluginInstance = useCallback(
    async (pluginTypeId, config, instanceName) => {
      try {
        const metadata = await pluginManager.createInstance(pluginTypeId, config, instanceName);
        setAllPluginInstances(pluginManager.getAllInstances());
        return metadata;
      } catch (error) {
        console.error('[PluginContext] Failed to create plugin instance:', error);
        throw error;
      }
    },
    [pluginManager]
  );

  /**
   * Remove a plugin instance
   */
  const removePluginInstance = useCallback(
    async (instanceId) => {
      try {
        await pluginManager.removeInstance(instanceId);
        setAllPluginInstances(pluginManager.getAllInstances());
      } catch (error) {
        console.error('[PluginContext] Failed to remove plugin instance:', error);
        throw error;
      }
    },
    [pluginManager]
  );

  /**
   * Update plugin instance configuration
   */
  const updatePluginConfig = useCallback(
    async (instanceId, newConfig, instanceName) => {
      try {
        await pluginManager.updateInstanceConfig(instanceId, newConfig, instanceName);
        setAllPluginInstances(pluginManager.getAllInstances());
      } catch (error) {
        console.error('[PluginContext] Failed to update plugin config:', error);
        throw error;
      }
    },
    [pluginManager]
  );

  /**
   * Get available plugin types
   */
  const getAvailablePluginTypes = useCallback(() => {
    return pluginManager.getAvailablePluginTypes();
  }, [pluginManager]);

  /**
   * Get plugin instance by ID
   */
  const getPluginInstance = useCallback(
    (instanceId) => {
      return pluginManager.getInstance(instanceId);
    },
    [pluginManager]
  );

  /**
   * Get plugin instance metadata by ID
   */
  const getPluginMetadata = useCallback(
    (instanceId) => {
      return pluginManager.getInstanceMetadata(instanceId);
    },
    [pluginManager]
  );

  /**
   * Get plugin class by type
   * Returns the plugin class constructor for accessing static methods
   */
  const getPluginClass = useCallback(
    (pluginType) => {
      try {
        return pluginManager.getPluginType(pluginType);
      } catch (error) {
        console.error('[PluginContext] Failed to get plugin class:', error);
        return null;
      }
    },
    [pluginManager]
  );

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = useMemo(
    () => ({
      // State
      isInitialized,
      isLoading,
      allPluginInstances,

      // Managers
      pluginManager,

      // Global instance management
      createPluginInstance,
      removePluginInstance,
      updatePluginConfig,
      getAvailablePluginTypes,
      getPluginInstance,
      getPluginMetadata,
      getPluginClass,
    }),
    [
      isInitialized,
      isLoading,
      allPluginInstances,
      pluginManager,
      createPluginInstance,
      removePluginInstance,
      updatePluginConfig,
      getAvailablePluginTypes,
      getPluginInstance,
      getPluginMetadata,
      getPluginClass,
    ]
  );

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

/**
 * TabPluginProvider - Per-tab plugin context
 * Manages active plugins for a specific tab
 */
export function TabPluginProvider({ children, tabId, activePluginIds = [], onActivePluginsChange }) {
  const globalContext = useContext(PluginContext);

  if (!globalContext) {
    throw new Error('TabPluginProvider must be used within PluginProvider');
  }

  const { pluginManager } = globalContext;

  // Tab-specific state
  const [tabActivePluginIds, setTabActivePluginIds] = useState(activePluginIds);

  // Sync with prop changes (when switching tabs)
  useEffect(() => {
    setTabActivePluginIds(activePluginIds);
  }, [tabId, activePluginIds]);

  // ============================================================================
  // TAB-SPECIFIC PLUGIN MANAGEMENT
  // ============================================================================

  /**
   * Add a plugin to this tab's active plugins
   */
  const addPluginToTab = useCallback(
    async (pluginId) => {
      if (tabActivePluginIds.includes(pluginId)) {
        console.warn(`[TabPluginProvider] Plugin ${pluginId} already active in tab ${tabId}`);
        return;
      }

      try {
        // Activate the plugin instance
        await pluginManager.activateInstance(pluginId);

        const newActivePlugins = [...tabActivePluginIds, pluginId];
        setTabActivePluginIds(newActivePlugins);

        // Notify parent
        if (onActivePluginsChange) {
          onActivePluginsChange(newActivePlugins);
        }
      } catch (error) {
        console.error('[TabPluginProvider] Failed to add plugin to tab:', error);
        throw error;
      }
    },
    [tabId, tabActivePluginIds, pluginManager, onActivePluginsChange]
  );

  /**
   * Remove a plugin from this tab's active plugins
   */
  const removePluginFromTab = useCallback(
    async (pluginId) => {
      try {
        // Note: We don't deactivate the plugin instance here because it might be
        // active in other tabs. Deactivation happens when the instance is removed globally.

        const newActivePlugins = tabActivePluginIds.filter(id => id !== pluginId);
        setTabActivePluginIds(newActivePlugins);

        // Notify parent
        if (onActivePluginsChange) {
          onActivePluginsChange(newActivePlugins);
        }
      } catch (error) {
        console.error('[TabPluginProvider] Failed to remove plugin from tab:', error);
        throw error;
      }
    },
    [tabId, tabActivePluginIds, onActivePluginsChange]
  );

  // ============================================================================
  // CAPABILITY-BASED QUERIES (from active plugins only)
  // ============================================================================

  /**
   * Get active plugins with a specific capability
   */
  const getPluginsWithCapability = useCallback(
    (capability) => {
      return pluginManager.getInstancesWithCapability(capability, tabActivePluginIds);
    },
    [pluginManager, tabActivePluginIds]
  );

  /**
   * Get active data providers
   */
  const getDataProviders = useCallback(() => {
    return pluginManager.getDataProviders(tabActivePluginIds);
  }, [pluginManager, tabActivePluginIds]);

  /**
   * Get active chat providers
   */
  const getChatProviders = useCallback(() => {
    return pluginManager.getChatProviders(tabActivePluginIds);
  }, [pluginManager, tabActivePluginIds]);

  /**
   * Get active alert providers
   */
  const getAlertProviders = useCallback(() => {
    return pluginManager.getAlertProviders(tabActivePluginIds);
  }, [pluginManager, tabActivePluginIds]);

  /**
   * Get plugin instance by ID (from active plugins only)
   */
  const getPluginById = useCallback(
    (pluginId) => {
      if (!tabActivePluginIds.includes(pluginId)) {
        return null;
      }
      return pluginManager.getInstance(pluginId);
    },
    [pluginManager, tabActivePluginIds]
  );

  // ============================================================================
  // ACTIVE PLUGINS INFO
  // ============================================================================

  /**
   * Get active plugin instances
   */
  const activePlugins = useMemo(() => {
    return tabActivePluginIds
      .map(id => pluginManager.getInstance(id))
      .filter(Boolean);
  }, [pluginManager, tabActivePluginIds]);

  /**
   * Get active plugin metadata
   */
  const activePluginMetadata = useMemo(() => {
    return tabActivePluginIds
      .map(id => pluginManager.getInstanceMetadata(id))
      .filter(Boolean);
  }, [pluginManager, tabActivePluginIds]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = useMemo(
    () => ({
      // Inherit global context
      ...globalContext,

      // Tab-specific state
      tabId,
      activePluginIds: tabActivePluginIds,
      activePlugins,
      activePluginMetadata,

      // Tab-specific plugin management
      addPluginToTab,
      removePluginFromTab,

      // Capability-based queries (from active plugins)
      getPluginsWithCapability,
      getDataProviders,
      getChatProviders,
      getAlertProviders,
      getPluginById,
    }),
    [
      globalContext,
      tabId,
      tabActivePluginIds,
      activePlugins,
      activePluginMetadata,
      addPluginToTab,
      removePluginFromTab,
      getPluginsWithCapability,
      getDataProviders,
      getChatProviders,
      getAlertProviders,
      getPluginById,
    ]
  );

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

/**
 * usePlugin hook - Access plugin system
 * Can be used in both global context (PluginProvider) and tab context (TabPluginProvider)
 */
export function usePlugin() {
  const context = useContext(PluginContext);

  if (!context) {
    throw new Error('usePlugin must be used within PluginProvider or TabPluginProvider');
  }

  return context;
}

export default PluginContext;

