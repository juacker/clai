/**
 * SettingsModal Component
 *
 * Modal overlay for application settings with multi-panel sliding interface.
 * Provides a better UX than full-page navigation with smooth transitions
 * and clear visual hierarchy.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import useSettingsNavigation from './hooks/useSettingsNavigation';
import MainPanel from './panels/MainPanel';
import PluginListPanel from './panels/PluginListPanel';
import styles from './SettingsModal.module.css';

// Panel registry - maps panel IDs to their components
const PANELS = {
  main: MainPanel,
  plugins: PluginListPanel,
};

// Panel titles - used in the modal header
const PANEL_TITLES = {
  main: 'Settings',
  plugins: 'Plugin Configurations',
};

const SettingsModal = ({ isOpen, onClose }) => {
  const {
    currentPanel,
    currentPanelData,
    navigateToPanel,
    navigateBack,
    canGoBack,
    slideDirection,
    resetNavigation
  } = useSettingsNavigation();

  // Reset navigation when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetNavigation();
    }
  }, [isOpen, resetNavigation]);

  // Handle ESC key to close modal or go back
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (canGoBack) {
          navigateBack();
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canGoBack, navigateBack, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const CurrentPanelComponent = PANELS[currentPanel];
  const panelTitle = PANEL_TITLES[currentPanel] || 'Settings';

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          {canGoBack && (
            <button
              className={styles.backButton}
              onClick={navigateBack}
              aria-label="Go back"
              title="Go back"
            >
              ←
            </button>
          )}
          <h2 className={styles.modalTitle}>{panelTitle}</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
          >
            ✕
          </button>
        </header>

        <div className={styles.panelContainer}>
          <div
            className={`${styles.panel} ${styles[slideDirection]}`}
            key={currentPanel} // Force re-render on panel change for animation
          >
            {CurrentPanelComponent && (
              <CurrentPanelComponent
                onNavigate={navigateToPanel}
                onClose={onClose}
                panelData={currentPanelData}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SettingsModal;

