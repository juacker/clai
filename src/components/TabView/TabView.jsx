/**
 * TabView Component
 *
 * Main component that combines TabBar and TabContent.
 * Provides the complete tab interface for the application.
 */

import React from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import TabBar from '../TabBar/TabBar';
import TabContent from '../TabContent/TabContent';
import styles from './TabView.module.css';

const TabView = () => {
  const { tabs } = useTabManager();

  return (
    <div className={styles.tabView}>
      {/* Tab Bar - always show */}
      <TabBar />

      {/* Tab Content */}
      <div className={styles.tabContentWrapper}>
        <TabContent />
      </div>
    </div>
  );
};

export default TabView;

