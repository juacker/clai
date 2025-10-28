/**
 * TabContent Component
 *
 * Renders the content of the active tab.
 * For Phase 1: Displays a single command visualization per tab.
 * For Phase 3: Will render TileView with split layouts.
 */

import React from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useCommand } from '../../contexts/CommandContext';
import Echo from '../Echo';
import styles from './TabContent.module.css';

const TabContent = () => {
  const { tabs, activeTabId } = useTabManager();
  const { commandHistory } = useCommand();

  // Get active tab directly from state instead of using getActiveTab()
  const activeTab = tabs.find(t => t.id === activeTabId);

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

  // Get the command for this tab's tile
  const commandId = activeTab.rootTile?.commandId;
  const command = commandHistory.find(cmd => cmd.id === commandId);

  // No command in this tab yet
  if (!command) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect
                x="8"
                y="8"
                width="32"
                height="32"
                rx="4"
                stroke="currentColor"
                strokeWidth="2"
                opacity="0.3"
              />
              <path
                d="M16 24H32M24 16V32"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </div>
          <h3 className={styles.emptyStateTitle}>{activeTab.title}</h3>
          <p className={styles.emptyStateDescription}>
            This tab is empty. Type a command to add content.
          </p>
        </div>
      </div>
    );
  }

  // Render command visualization based on command type
  const renderCommandVisualization = () => {
    switch (command.type) {
      case 'echo':
        return <Echo key={command.id} command={command} />;

      // Phase 3+ will add more command types:
      // case 'chart':
      //   return <ChartVisualization command={command} />;
      // case 'alerts':
      //   return <AlertsVisualization command={command} />;

      default:
        return (
          <div className={styles.unknownCommand}>
            <p>Unknown command type: {command.type}</p>
            <code>{command.raw}</code>
          </div>
        );
    }
  };

  return (
    <div className={styles.tabContent}>
      {renderCommandVisualization()}
    </div>
  );
};

export default TabContent;

