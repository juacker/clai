/**
 * TabContent Component
 *
 * Renders the content of the active tab wrapped with TabContext.
 * Each tab has its own isolated context (space/room selection).
 * Phase 3: Renders TileView with split layouts for multiple command visualizations.
 */

import React, { useCallback } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import TileView from '../TileView';
import styles from './TabContent.module.css';

const TabContent = () => {
  const { tabs, activeTabId, activeTileId, updateTabContext } = useTabManager();

  // Get active tab directly from state instead of using getActiveTab()
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Handle context changes from TabContext
  // IMPORTANT: Use useCallback with activeTabId as dependency to prevent stale closure bug
  // This ensures we always update the correct tab's context when switching tabs
  const handleContextChange = useCallback((context) => {
    if (activeTabId) {
      updateTabContext(activeTabId, context);
    }
  }, [activeTabId, updateTabContext]);

  // No active tab - show default dashboard
  if (!activeTab) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path
                d="M32 8L8 20V44L32 56L56 44V20L32 8Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />
              <path
                d="M32 32L8 20M32 32L56 20M32 32V56"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />
            </svg>
          </div>
          <h2 className={styles.emptyStateTitle}>Welcome to Netdata AI</h2>
          <p className={styles.emptyStateDescription}>
            Type a command in the terminal below to get started
          </p>
          <div className={styles.emptyStateHint}>
            <span className={styles.hintLabel}>Try:</span>
            <code className={styles.hintCommand}>echo hello world</code>
          </div>
        </div>
      </div>
    );
  }

  // Wrap tab content with TabContext provider for context isolation
  // Phase 3: Use TileView to render the tile layout (supports split views)
  return (
    <TabContextProvider
      tabId={activeTab.id}
      initialContext={activeTab.context}
      onContextChange={handleContextChange}
    >
      <div className={styles.tabContent}>
        <TileView
          tile={activeTab.rootTile}
          activeTileId={activeTileId}
        />
      </div>
    </TabContextProvider>
  );
};

export default TabContent;

