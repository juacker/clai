/**
 * TabView Component
 *
 * Main component that combines TabBar, ContextPanel, and TabContent.
 * Provides the complete tab interface for the application.
 */

import React from 'react';
import TabBar from '../TabBar/TabBar';
import TabContent from '../TabContent/TabContent';
import styles from './TabView.module.css';

const TabView = () => {
  return (
    <div className={styles.tabView}>
      {/* Tab Bar - hidden on mobile, shown on desktop */}
      <div className={styles.tabBar}>
        <TabBar />
      </div>

      {/* Tab Content */}
      <div className={styles.tabContentWrapper}>
        <TabContent />
      </div>
    </div>
  );
};

export default TabView;

