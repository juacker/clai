/**
 * PluginListPanel Component
 *
 * Displays all configured plugin instances.
 * Allows adding, editing, and deleting plugin configurations.
 */

import React, { useState } from 'react';
import { usePlugin } from '../../../contexts/PluginContext';
import PluginConfigurationDialog from '../../PluginManagement/PluginConfigurationDialog';
import styles from '../SettingsModal.module.css';

const PluginListPanel = () => {
  const { allPluginInstances, removePluginInstance } = usePlugin();
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);

  // Handle add plugin configuration
  const handleAddPlugin = () => {
    setSelectedInstanceId(null);
    setShowConfigDialog(true);
  };

  // Handle edit plugin configuration
  const handleEditPlugin = (instanceId) => {
    setSelectedInstanceId(instanceId);
    setShowConfigDialog(true);
  };

  // Handle delete plugin configuration
  const handleDeletePlugin = (instanceId, instanceName) => {
    if (window.confirm(`Are you sure you want to delete "${instanceName}"? This action cannot be undone.`)) {
      removePluginInstance(instanceId);
    }
  };

  // Get plugin icon
  const getPluginIcon = (type) => {
    const icons = {
      netdata: '📊',
      prometheus: '📈',
      grafana: '📉',
      default: '🔌'
    };
    return icons[type?.toLowerCase()] || icons.default;
  };

  return (
    <>
      <div className={styles.settingsList}>
        {/* Add New Plugin Button */}
        <button
          className={styles.settingsItem}
          onClick={handleAddPlugin}
        >
          <span className={styles.settingsIcon}>➕</span>
          <div className={styles.settingsContent}>
            <h3>Add New Plugin</h3>
            <p>Configure a new plugin instance</p>
          </div>
          <span className={styles.settingsArrow}>›</span>
        </button>

        {/* Empty State */}
        {allPluginInstances.length === 0 && (
          <div className={styles.emptyState}>
            <p>No plugins configured yet. Click "Add New Plugin" above to get started.</p>
          </div>
        )}

        {/* List of Configured Plugins */}
        {allPluginInstances.map((instance) => (
          <div key={instance.id} className={styles.pluginCard}>
            <div className={styles.pluginCardIcon}>
              {getPluginIcon(instance.type)}
            </div>
            <div className={styles.pluginCardInfo}>
              <h3 className={styles.pluginCardName}>{instance.name}</h3>
              <p className={styles.pluginCardMeta}>
                {instance.type} • Added {new Date(instance.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className={styles.pluginCardActions}>
              <button
                className={styles.iconButton}
                onClick={() => handleEditPlugin(instance.id)}
                title="Edit configuration"
              >
                ✏️
              </button>
              <button
                className={styles.iconButton}
                onClick={() => handleDeletePlugin(instance.id, instance.name)}
                title="Delete configuration"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Plugin Configuration Dialog */}
      <PluginConfigurationDialog
        isOpen={showConfigDialog}
        onClose={() => setShowConfigDialog(false)}
        instanceId={selectedInstanceId}
      />
    </>
  );
};

export default PluginListPanel;

