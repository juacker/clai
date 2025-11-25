/**
 * ContextPanel Component
 *
 * Displays the current tab's active plugins as chips.
 * Each chip shows the plugin's context and has an X button to remove it.
 * A "+" button allows adding more plugins to the tab.
 *
 * Phase 3: Refactored to use plugin system instead of SharedSpaceRoomDataContext.
 *
 * Note: This component reads from TabManagerContext (not TabContext) because it's
 * rendered at the TabView level, outside of the TabContextProvider.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { usePlugin } from '../../contexts/PluginContext';
import ContextBadge from './ContextBadge';
import AddPluginToTabDialog from '../PluginManagement/AddPluginToTabDialog';
import styles from './ContextPanel.module.css';

const ContextPanel = () => {
  const { getActiveTab, updateTabContext } = useTabManager();
  const { getPluginMetadata } = usePlugin();

  // Plugin selector state
  const [showPluginSelector, setShowPluginSelector] = useState(false);

  // Get the active tab's context
  const activeTab = getActiveTab();
  const tabContext = activeTab?.context;
  const activePluginIds = tabContext?.activePlugins || [];

  // Get metadata for all active plugins
  const activePluginsWithMetadata = useMemo(() => {
    return activePluginIds
      .map(pluginId => {
        const metadata = getPluginMetadata(pluginId);
        return metadata ? { id: pluginId, ...metadata } : null;
      })
      .filter(Boolean);
  }, [activePluginIds, getPluginMetadata]);

  // Check if there are any active plugins to display
  const hasActivePlugins = activePluginsWithMetadata.length > 0;

  console.log('[ContextPanel] Active plugins:', {
    activePluginIds,
    activePluginsWithMetadata,
    hasActivePlugins,
  });

  // Handle removing a plugin from the tab
  const handleRemovePlugin = useCallback((pluginId) => {
    if (!activeTab) return;

    console.log('[ContextPanel] Removing plugin:', pluginId);

    // Remove the plugin from the tab's active plugins
    const updatedPlugins = activePluginIds.filter(id => id !== pluginId);
    updateTabContext(activeTab.id, {
      activePlugins: updatedPlugins,
    });
  }, [activeTab, activePluginIds, updateTabContext]);

  // Handle adding a plugin
  const handleAddPlugin = useCallback(() => {
    console.log('[ContextPanel] Add plugin clicked');
    setShowPluginSelector(true);
  }, []);

  // Handle instance selected (from pre-configured instances)
  const handleInstanceSelected = useCallback((instanceId) => {
    if (!activeTab) return;

    console.log('[ContextPanel] Instance selected:', instanceId);

    // Add the selected instance to the tab's active plugins
    const updatedPlugins = [...activePluginIds, instanceId];
    updateTabContext(activeTab.id, {
      activePlugins: updatedPlugins,
    });

    setShowPluginSelector(false);
  }, [activeTab, activePluginIds, updateTabContext]);

  // Always render the panel (even if empty) to show the "+" button
  // Users can add plugins even if none are active yet

  return (
    <div className={styles.contextPanel}>
      <div className={styles.contextContainer}>
        {/* Active Plugin Chips */}
        {activePluginsWithMetadata.map((plugin) => (
          <ContextBadge
            key={plugin.id}
            type="plugin"
            label={plugin.name}
            value={plugin.displayName || plugin.name}
            onRemove={() => handleRemovePlugin(plugin.id)}
            clickable={false}
            removable={true}
          />
        ))}

        {/* Add Plugin Button */}
        <button
          className={styles.addPluginButton}
          onClick={handleAddPlugin}
          aria-label="Add plugin"
          title="Add plugin to this tab"
        >
          +
        </button>
      </div>

      {/* Add Plugin to Tab Dialog */}
      <AddPluginToTabDialog
        isOpen={showPluginSelector}
        onClose={() => setShowPluginSelector(false)}
        onInstanceSelected={handleInstanceSelected}
        excludeInstanceIds={activePluginIds}
      />
    </div>
  );
};

export default ContextPanel;

