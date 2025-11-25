/**
 * Plugin System - Public API
 *
 * This is the main entry point for the plugin system.
 * Import from this file to access plugin functionality.
 */

// Core classes
export { PluginInterface, PLUGIN_CAPABILITIES } from './PluginInterface';
export { PluginManager, getPluginManager } from './PluginManager';
export {
  PluginRegistry,
  getPluginRegistry,
  initializePluginSystem,
  registerPlugin
} from './PluginRegistry';

// Re-export for convenience
export { default as PluginInterfaceDefault } from './PluginInterface';
export { default as PluginManagerDefault } from './PluginManager';
export { default as PluginRegistryDefault } from './PluginRegistry';

