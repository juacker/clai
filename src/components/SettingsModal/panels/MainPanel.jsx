/**
 * MainPanel Component
 *
 * Root settings menu that displays all available settings categories.
 * Each item navigates to a detail panel when clicked.
 */

import React from 'react';
import styles from '../SettingsModal.module.css';

const MainPanel = ({ onNavigate }) => {
  return (
    <div className={styles.settingsList}>
      {/* Plugin Configurations */}
      <button
        className={styles.settingsItem}
        onClick={() => onNavigate('plugins')}
      >
        <span className={styles.settingsIcon}>🔌</span>
        <div className={styles.settingsContent}>
          <h3>Plugin Configurations</h3>
          <p>Configure plugins with credentials and scope</p>
        </div>
        <span className={styles.settingsArrow}>›</span>
      </button>
    </div>
  );
};

export default MainPanel;

