/**
 * TabContext
 *
 * Provides tab-specific context including active plugins and custom context data.
 * Each tab has its own TabContext instance, allowing independent context per tab.
 *
 * This context wraps tab content and provides:
 * - Active plugin management (per tab)
 * - Custom context key-value pairs
 * - Access to plugin instances
 *
 * Architecture:
 * - Uses PluginContext for global plugin instances
 * - Manages tab-specific active plugin IDs
 * - Syncs changes back to TabManagerContext
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePlugin } from './PluginContext';

const TabContext = createContext(null);

export function TabContextProvider({ children, tabId, initialContext, onContextChange }) {
  // Access global plugin system
  const {
    allPluginInstances,
    getPluginInstance,
    isInitialized,
    isLoading: pluginSystemLoading,
  } = usePlugin();

  // Tab-specific state
  const [activePluginIds, setActivePluginIds] = useState(
    initialContext?.activePlugins || []
  );
  const [customContext, setCustomContextState] = useState(
    initialContext?.customContext || {}
  );

  // CRITICAL: Sync internal state when tabId or initialContext changes (tab switching)
  // This ensures each tab displays its own isolated context
  useEffect(() => {
    setActivePluginIds(initialContext?.activePlugins || []);
    setCustomContextState(initialContext?.customContext || {});
  }, [tabId, initialContext]);

  // Derived state: Get full plugin instances for active plugins
  const activePlugins = useMemo(() => {
    return activePluginIds
      .map(id => getPluginInstance(id))
      .filter(Boolean); // Filter out null/undefined (plugins that don't exist)
  }, [activePluginIds, getPluginInstance, allPluginInstances]);

  /**
   * Add a plugin to this tab
   * @param {string} pluginId - Plugin instance ID to add
   */
  const addPluginToTab = useCallback((pluginId) => {
    if (!pluginId) {
      console.warn('Cannot add plugin: pluginId is required');
      return;
    }

    // Check if plugin exists
    const plugin = getPluginInstance(pluginId);
    if (!plugin) {
      console.warn(`Cannot add plugin: Plugin with ID "${pluginId}" not found`);
      return;
    }

    // Check if already active
    if (activePluginIds.includes(pluginId)) {
      console.warn(`Plugin "${pluginId}" is already active in this tab`);
      return;
    }

    const newActivePlugins = [...activePluginIds, pluginId];
    setActivePluginIds(newActivePlugins);

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        activePlugins: newActivePlugins,
        customContext,
      });
    }
  }, [activePluginIds, getPluginInstance, onContextChange, customContext]);

  /**
   * Remove a plugin from this tab
   * @param {string} pluginId - Plugin instance ID to remove
   */
  const removePluginFromTab = useCallback((pluginId) => {
    if (!pluginId) {
      console.warn('Cannot remove plugin: pluginId is required');
      return;
    }

    if (!activePluginIds.includes(pluginId)) {
      console.warn(`Plugin "${pluginId}" is not active in this tab`);
      return;
    }

    const newActivePlugins = activePluginIds.filter(id => id !== pluginId);
    setActivePluginIds(newActivePlugins);

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        activePlugins: newActivePlugins,
        customContext,
      });
    }
  }, [activePluginIds, onContextChange, customContext]);

  /**
   * Get active plugin instances
   * @returns {Array} Array of plugin instances
   */
  const getActivePlugins = useCallback(() => {
    return activePlugins;
  }, [activePlugins]);

  /**
   * Get plugins with specific capability
   * @param {string} capability - Capability name (e.g., 'chat', 'data')
   * @returns {Array} Array of plugin instances with the capability
   */
  const getPluginsWithCapability = useCallback((capability) => {
    return activePlugins.filter(plugin =>
      plugin.hasCapability && plugin.hasCapability(capability)
    );
  }, [activePlugins]);

  /**
   * Check if any active plugin has a specific capability
   * @param {string} capability - Capability name
   * @returns {boolean} True if at least one active plugin has the capability
   */
  const hasCapability = useCallback((capability) => {
    return activePlugins.some(plugin =>
      plugin.hasCapability && plugin.hasCapability(capability)
    );
  }, [activePlugins]);

  /**
   * Set a custom context value
   * @param {string} key - Context key
   * @param {any} value - Context value
   */
  const setCustomContext = useCallback((key, value) => {
    setCustomContextState(prev => {
      const newContext = { ...prev, [key]: value };

      // Notify parent of context change
      if (onContextChange) {
        onContextChange({
          activePlugins: activePluginIds,
          customContext: newContext,
        });
      }

      return newContext;
    });
  }, [activePluginIds, onContextChange]);

  /**
   * Get a custom context value
   * @param {string} key - Context key
   * @returns {any} Context value or undefined
   */
  const getCustomContext = useCallback((key) => {
    return customContext[key];
  }, [customContext]);

  /**
   * Delete a custom context key
   * @param {string} key - Context key to delete
   */
  const deleteCustomContext = useCallback((key) => {
    setCustomContextState(prev => {
      const newContext = { ...prev };
      delete newContext[key];

      // Notify parent of context change
      if (onContextChange) {
        onContextChange({
          activePlugins: activePluginIds,
          customContext: newContext,
        });
      }

      return newContext;
    });
  }, [activePluginIds, onContextChange]);

  /**
   * Clear all custom context
   */
  const clearCustomContext = useCallback(() => {
    setCustomContextState({});

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        activePlugins: activePluginIds,
        customContext: {},
      });
    }
  }, [activePluginIds, onContextChange]);

  /**
   * Get summary of active plugins (for display in terminal prompt, etc.)
   * @returns {string} Summary string (e.g., "netdata-prod, prometheus-dev")
   */
  const getActivePluginsSummary = useCallback(() => {
    if (activePlugins.length === 0) {
      return 'no plugins';
    }

    return activePlugins
      .map(plugin => {
        const display = plugin.getContextDisplay ? plugin.getContextDisplay() : null;
        return display?.primary || plugin.id;
      })
      .join(', ');
  }, [activePlugins]);

  const value = {
    // Tab ID
    tabId,

    // Plugin state
    activePluginIds,
    activePlugins,
    loading: pluginSystemLoading,
    isInitialized,

    // Plugin methods
    addPluginToTab,
    removePluginFromTab,
    getActivePlugins,
    getPluginsWithCapability,
    hasCapability,
    getActivePluginsSummary,

    // Custom context
    customContext,
    setCustomContext,
    getCustomContext,
    deleteCustomContext,
    clearCustomContext,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

/**
 * Hook to access tab context
 *
 * @returns {Object} Tab context
 * @throws {Error} If used outside of TabContextProvider
 */
export function useTabContext() {
  const context = useContext(TabContext);

  if (!context) {
    throw new Error('useTabContext must be used within a TabContextProvider');
  }

  return context;
}

export default TabContext;
