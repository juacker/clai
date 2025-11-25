/**
 * AddPluginToTabDialog Component
 *
 * Simplified dialog for adding a pre-configured plugin instance to the current tab.
 * This is the NEW single-level system - just select and add (ZERO configuration).
 *
 * Flow:
 * 1. User sees list of all configured plugin instances
 * 2. User clicks on one to add it to the tab
 * 3. Done! No configuration needed.
 *
 * Phase 3: Single-Level Configuration UI
 */

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlugin } from '../../contexts/PluginContext';
import styles from './AddPluginToTabDialog.module.css';

const AddPluginToTabDialog = ({ isOpen, onClose, onInstanceSelected, excludeInstanceIds = [] }) => {
  const { allPluginInstances, getPluginMetadata } = usePlugin();

  // Get all available plugin instances
  const availableInstances = useMemo(() => {
    // Filter out instances that are already added to the tab
    return allPluginInstances.filter(instance => !excludeInstanceIds.includes(instance.id));
  }, [allPluginInstances, excludeInstanceIds]);

  // Handle instance selection
  const handleSelectInstance = (instanceId) => {
    onInstanceSelected(instanceId);
    onClose();
  };

  if (!isOpen) return null;

  const dialogContent = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Add Plugin to Tab</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.content}>
          {availableInstances.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No configured plugins available.</p>
              <p>
                Please configure a plugin in Settings first.
              </p>
            </div>
          ) : (
            <>
              <p className={styles.description}>
                Select a pre-configured plugin to add to this tab:
              </p>
              <div className={styles.instanceList}>
                {availableInstances.map((instance) => {
                  const metadata = getPluginMetadata(instance.id);

                  return (
                    <button
                      key={instance.id}
                      className={styles.instanceItem}
                      onClick={() => handleSelectInstance(instance.id)}
                    >
                      <div className={styles.instanceIcon}>
                        <span className={styles.iconPlaceholder}>
                          {instance.type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.instanceInfo}>
                        <div className={styles.instanceName}>{instance.name}</div>
                        <div className={styles.instanceType}>{instance.type}</div>
                        {metadata?.contextLabel && (
                          <div className={styles.instanceContext}>{metadata.contextLabel}</div>
                        )}
                      </div>
                      <div className={styles.instanceArrow}>→</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

export default AddPluginToTabDialog;

