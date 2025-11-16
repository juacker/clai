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

  // No tabs - show default dashboard
  if (tabs.length === 0) {
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

  // Render ALL tabs but only show the active one
  // This keeps all tab components mounted, preserving their state
  // and avoiding re-fetching data when switching tabs
  return (
    <div className={styles.tabContent}>
      {tabs.map((tab) => (
        <TabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          activeTileId={activeTileId}
          updateTabContext={updateTabContext}
        />
      ))}
    </div>
  );
};

/**
 * TabPanel - Individual tab content wrapper
 * Keeps tab mounted but hidden when inactive to preserve state
 */
const TabPanel = ({ tab, isActive, activeTileId, updateTabContext }) => {
  // Handle context changes for this specific tab
  const handleContextChange = useCallback((context) => {
    updateTabContext(tab.id, context);
  }, [tab.id, updateTabContext]);

  return (
    <TabContextProvider
      tabId={tab.id}
      initialContext={tab.context}
      onContextChange={handleContextChange}
    >
      <div
        className={styles.tabPanel}
        data-active={isActive}
        aria-hidden={!isActive}
      >
        <TileView
          tile={tab.rootTile}
          activeTileId={activeTileId}
        />
      </div>
    </TabContextProvider>
  );
};

export default TabContent;

