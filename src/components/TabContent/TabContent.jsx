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

  // No tabs - show minimal empty state (rare: only if user closes all tabs)
  if (tabs.length === 0) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.emptyState}>
          <p className={styles.emptyStateDescription}>
            Type <code>/help</code> to get started
          </p>
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

