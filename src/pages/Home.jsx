import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TabView from '../components/TabView/TabView';
import { useTabManager } from '../contexts/TabManagerContext';
import { useChatManager } from '../contexts/ChatManagerContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();

  // Get tab and tile management functions from context
  const {
    switchToTabByIndex,
    createTab,
    closeTab,
    switchToNextTab,
    switchToPrevTab,
    activeTabId,
    activeTileId,
    tabs,
    splitTile,
    closeTile,
    focusNextTile,
    focusPrevTile
  } = useTabManager();

  // Get chat management functions from context
  const { toggleChat } = useChatManager();

  // Register global keyboard shortcuts
  useKeyboardShortcuts({
    // Alt+1-9: Switch to tab by position
    onSwitchTab: (index) => {
      switchToTabByIndex(index);
    },

    // Ctrl/Cmd+T: Create new tab
    onNewTab: () => {
      createTab();
    },

    // Ctrl/Cmd+W: Close active tab
    onCloseTab: () => {
      if (activeTabId && tabs.length > 0) {
        closeTab(activeTabId);
      }
    },

    // Ctrl/Cmd+Tab: Switch to next tab
    onNextTab: () => {
      switchToNextTab();
    },

    // Ctrl/Cmd+Shift+Tab: Switch to previous tab
    onPrevTab: () => {
      switchToPrevTab();
    },

    // Ctrl/Cmd+\: Split tile vertically
    onSplitVertical: () => {
      if (activeTileId) {
        splitTile(activeTileId, 'vertical');
      }
    },

    // Ctrl/Cmd+-: Split tile horizontally
    onSplitHorizontal: () => {
      if (activeTileId) {
        splitTile(activeTileId, 'horizontal');
      }
    },

    // Ctrl/Cmd+Shift+W: Close current tile
    onCloseTile: () => {
      if (activeTileId) {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab) {
          // Count tiles to prevent closing the last one
          const countTiles = (layout) => {
            if (!layout) return 0;
            if (layout.type === 'leaf') return 1;
            if (layout.type === 'split') {
              return layout.children.reduce((sum, child) => sum + countTiles(child), 0);
            }
            return 0;
          };

          const tileCount = countTiles(currentTab.rootTile);
          if (tileCount > 1) {
            closeTile(activeTileId);
          }
        }
      }
    },

    // Ctrl/Cmd+]: Next tile
    onNextTile: () => {
      focusNextTile();
    },

    // Ctrl/Cmd+[: Previous tile
    onPrevTile: () => {
      focusPrevTile();
    },

    // Ctrl/Cmd+Shift+C: Toggle chat panel
    onToggleChat: () => {
      toggleChat();
    },
  });

  return (
    <div className={styles.homePage}>
      <TabView />
    </div>
  );
};

export default Home;
