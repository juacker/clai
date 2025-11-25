/**
 * useSettingsNavigation Hook
 *
 * Manages the navigation state for the settings modal's multi-panel interface.
 * Handles panel stack, slide directions, and navigation between panels.
 * Now supports passing data between panels.
 */

import { useState, useCallback } from 'react';

const useSettingsNavigation = () => {
  const [panelStack, setPanelStack] = useState([{ id: 'main', data: null }]);
  const [slideDirection, setSlideDirection] = useState('forward');

  /**
   * Navigate to a new panel
   * @param {string} panelId - The ID of the panel to navigate to
   * @param {object} panelData - Optional data to pass to the panel
   */
  const navigateToPanel = useCallback((panelId, panelData = null) => {
    setSlideDirection('forward');
    setPanelStack(prev => [...prev, { id: panelId, data: panelData }]);
  }, []);

  /**
   * Navigate back to the previous panel
   */
  const navigateBack = useCallback(() => {
    if (panelStack.length > 1) {
      setSlideDirection('backward');
      setPanelStack(prev => prev.slice(0, -1));
    }
  }, [panelStack.length]);

  /**
   * Reset navigation to the main panel
   */
  const resetNavigation = useCallback(() => {
    setPanelStack([{ id: 'main', data: null }]);
    setSlideDirection('forward');
  }, []);

  const currentPanelEntry = panelStack[panelStack.length - 1];
  const currentPanel = currentPanelEntry.id;
  const currentPanelData = currentPanelEntry.data;
  const canGoBack = panelStack.length > 1;

  return {
    currentPanel,
    currentPanelData,
    navigateToPanel,
    navigateBack,
    canGoBack,
    slideDirection,
    resetNavigation
  };
};

export default useSettingsNavigation;

