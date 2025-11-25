/**
 * Plugin Registry
 *
 * Central registry for all available plugin types.
 * This is where we register all built-in plugins.
 */

import { getPluginManager } from './PluginManager';
import { NetdataPlugin } from './netdata/NetdataPlugin';

/**
 * Plugin Registry Class
 * Manages registration and initialization of plugin types
 */
export class PluginRegistry {
  constructor() {
    this.registeredPlugins = [];
  }

  /**
   * Register a plugin type
   * @param {Class} PluginClass - Plugin class that extends PluginInterface
   */
  register(PluginClass) {
    this.registeredPlugins.push(PluginClass);
  }

  /**
   * Initialize all registered plugins with the plugin manager
   * @param {PluginManager} pluginManager - Plugin manager instance
   */
  initializeAll(pluginManager) {
    this.registeredPlugins.forEach(PluginClass => {
      try {
        pluginManager.registerPluginType(PluginClass);
        console.log(`[PluginRegistry] Registered plugin: ${PluginClass.id}`);
      } catch (error) {
        console.error(`[PluginRegistry] Failed to register plugin ${PluginClass.id}:`, error);
      }
    });
  }

  /**
   * Get all registered plugin types
   * @returns {Array<Class>}
   */
  getAll() {
    return this.registeredPlugins;
  }

  /**
   * Get a specific plugin type by ID
   * @param {string} pluginId - Plugin type ID
   * @returns {Class|null}
   */
  get(pluginId) {
    return this.registeredPlugins.find(PluginClass => PluginClass.id === pluginId) || null;
  }
}

// Singleton instance
let registryInstance = null;

/**
 * Get the singleton PluginRegistry instance
 * @returns {PluginRegistry}
 */
export function getPluginRegistry() {
  if (!registryInstance) {
    registryInstance = new PluginRegistry();
  }
  return registryInstance;
}

/**
 * Initialize the plugin system
 * Registers all available plugins and loads saved instances
 * @returns {Promise<void>}
 */
export async function initializePluginSystem() {
  const registry = getPluginRegistry();
  const manager = getPluginManager();

  console.log('[PluginRegistry] Initializing plugin system...');

  // Register built-in plugins
  registry.register(NetdataPlugin);

  // Register all plugin types
  registry.initializeAll(manager);

  // Load saved plugin instances from storage
  await manager.loadFromStorage();

  console.log('[PluginRegistry] Plugin system initialized');
  console.log('[PluginRegistry] Statistics:', manager.getStatistics());
}

/**
 * Register a new plugin type
 * Helper function to register plugins from anywhere
 * @param {Class} PluginClass - Plugin class
 */
export function registerPlugin(PluginClass) {
  const registry = getPluginRegistry();
  registry.register(PluginClass);
}

export default PluginRegistry;

