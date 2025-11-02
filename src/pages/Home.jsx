import React from 'react';
import { useOutletContext } from 'react-router-dom';
import TabView from '../components/TabView/TabView';
import { useTabManager } from '../contexts/TabManagerContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();

  // Get tab management functions from context
  const {
    switchToTabByIndex,
    createTab,
    closeTab,
    switchToNextTab,
    switchToPrevTab,
    activeTabId,
    tabs
  } = useTabManager();

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
  });

  return (
    <div className={styles.homePage}>
      <TabView />
    </div>
  );
};

export default Home;
