/**
 * CommandMessagingContext
 *
 * Provides inter-command messaging capabilities, particularly for
 * sending data (elements, charts) to the dashboard command.
 *
 * Features:
 * - sendToDashboard(element, spaceRoomKey): Sends an element to dashboard for a space/room
 * - isElementInDashboard(elementId, spaceRoomKey): Checks if an element is already in dashboard
 * - getDashboardElements(spaceRoomKey): Get elements for a specific space/room
 * - dashboardExists: Boolean indicating if dashboard command exists in current tab
 *
 * Element format:
 * {
 *   id: "unique-id",
 *   type: "context-chart" | "timeseries-chart" | "bar-chart" | etc,
 *   config: { ... element-specific configuration }
 * }
 *
 * Dashboard elements are stored per space/room combination, so switching
 * space/room shows different elements (and switching back preserves them).
 *
 * Calling components should use useTabContext to get selectedSpace/selectedRoom
 * and create the spaceRoomKey: `${selectedSpace.id}_${selectedRoom.id}`
 */

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useTabManager } from './TabManagerContext';
import { useCommand } from './CommandContext';
import { validateDashboardElement } from '../utils/dashboardElementValidator';

const CommandMessagingContext = createContext(null);

/**
 * Hook to use the CommandMessagingContext
 * @throws {Error} If used outside of CommandMessagingProvider
 */
export const useCommandMessaging = () => {
  const context = useContext(CommandMessagingContext);
  if (!context) {
    throw new Error('useCommandMessaging must be used within a CommandMessagingProvider');
  }
  return context;
};

/**
 * CommandMessagingProvider component
 * Provides messaging capabilities for inter-command communication
 */
export const CommandMessagingProvider = ({ children }) => {
  const {
    activeTabId,
    activeTileId,
    getDashboardState,
    getActiveDashboardState,
    addDashboardElement,
    removeDashboardElement,
    clearDashboardMetrics,
    setDashboardCommandId,
    isElementInDashboard: checkElementInDashboard,
    splitTile,
    getLeafTiles,
    setActiveTile,
  } = useTabManager();

  const { executeCommand } = useCommand();

  /**
   * Whether dashboard command exists in current tab
   */
  const dashboardExists = useMemo(() => {
    const dashboardState = getActiveDashboardState();
    return !!dashboardState.commandId;
  }, [getActiveDashboardState]);

  /**
   * Get dashboard elements for a specific space/room
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {Array} Array of element configs
   */
  const getDashboardElements = useCallback((spaceRoomKey) => {
    if (!spaceRoomKey) return [];
    const dashboardState = getActiveDashboardState(spaceRoomKey);
    return dashboardState.elements || [];
  }, [getActiveDashboardState]);

  /**
   * Check if an element is already in dashboard for a space/room
   * @param {string} elementId - Element ID to check
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {boolean} True if element is in dashboard
   */
  const isElementInDashboard = useCallback((elementId, spaceRoomKey) => {
    if (!activeTabId || !spaceRoomKey) return false;
    return checkElementInDashboard(activeTabId, elementId, spaceRoomKey);
  }, [activeTabId, checkElementInDashboard]);

  /**
   * Send an element to dashboard for a specific space/room
   * If dashboard doesn't exist, auto-creates it via horizontal split (left/right)
   * @param {Object} element - Element config { id, type, config }
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {Object} Result with success status
   */
  const sendToDashboard = useCallback((element, spaceRoomKey) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    if (!spaceRoomKey) {
      return { success: false, message: 'No space/room selected' };
    }

    if (!element || !element.id) {
      return { success: false, message: 'Invalid element: missing id' };
    }

    // Validate element configuration
    const validation = validateDashboardElement(element);
    if (!validation.valid) {
      return { success: false, message: `Invalid element: ${validation.error}` };
    }

    // Check if element is already in dashboard
    if (isElementInDashboard(element.id, spaceRoomKey)) {
      return { success: false, message: 'Element already in dashboard' };
    }

    const currentDashboardState = getDashboardState(activeTabId, spaceRoomKey);

    // If dashboard doesn't exist, create it via horizontal split (left/right)
    if (!currentDashboardState.commandId) {
      if (!activeTileId) {
        return { success: false, message: 'No active tile' };
      }

      // Execute dashboard command first to get the command ID
      const dashboardCommand = executeCommand('dashboard');
      if (!dashboardCommand || !dashboardCommand.id) {
        return { success: false, message: 'Failed to create dashboard command' };
      }

      // Split the current tile horizontally (side by side: left | right)
      // Pass the dashboard command ID so the new tile is created with the command already assigned
      const splitResult = splitTile(activeTileId, 'horizontal', dashboardCommand.id);
      if (!splitResult.success) {
        return { success: false, message: `Failed to split tile: ${splitResult.message}` };
      }
    }

    // Add the element to dashboard for the space/room
    addDashboardElement(activeTabId, element, spaceRoomKey);

    return { success: true, message: 'Element sent to dashboard' };
  }, [activeTabId, activeTileId, isElementInDashboard, getDashboardState, splitTile, executeCommand, addDashboardElement]);

  /**
   * Remove an element from dashboard for a specific space/room
   * @param {string} elementId - Element ID to remove
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   */
  const removeFromDashboard = useCallback((elementId, spaceRoomKey) => {
    if (!activeTabId || !spaceRoomKey) return;
    removeDashboardElement(activeTabId, elementId, spaceRoomKey);
  }, [activeTabId, removeDashboardElement]);

  /**
   * Clear all metrics from dashboard for a specific space/room
   * @param {string} spaceRoomKey - Optional key - if not provided, clears all space/rooms
   */
  const clearDashboard = useCallback((spaceRoomKey = null) => {
    if (!activeTabId) return;
    clearDashboardMetrics(activeTabId, spaceRoomKey);
  }, [activeTabId, clearDashboardMetrics]);

  /**
   * Register dashboard command with the tab (called by Dashboard component on mount)
   * @param {string} commandId - Dashboard command ID
   */
  const registerDashboard = useCallback((commandId) => {
    if (!activeTabId) return;
    setDashboardCommandId(activeTabId, commandId);
  }, [activeTabId, setDashboardCommandId]);

  /**
   * Unregister dashboard command (called by Dashboard component on unmount)
   */
  const unregisterDashboard = useCallback(() => {
    if (!activeTabId) return;
    setDashboardCommandId(activeTabId, null);
  }, [activeTabId, setDashboardCommandId]);

  /**
   * Focus the dashboard tile if it exists (singleton behavior)
   * Used to prevent creating multiple dashboard commands - instead focuses existing one
   * @returns {boolean} True if dashboard was focused, false if no dashboard exists
   */
  const focusDashboardTile = useCallback(() => {
    const currentDashboardState = getActiveDashboardState();
    if (!currentDashboardState.commandId) {
      return false;
    }

    // Find the tile containing the dashboard command
    const leafTiles = getLeafTiles();
    const dashboardTile = leafTiles.find(tile => tile.commandId === currentDashboardState.commandId);

    if (dashboardTile) {
      setActiveTile(dashboardTile.id);
      return true;
    }

    return false;
  }, [getActiveDashboardState, getLeafTiles, setActiveTile]);

  const value = useMemo(() => ({
    // State
    dashboardExists,

    // Actions
    getDashboardElements,
    sendToDashboard,
    removeFromDashboard,
    clearDashboard,
    isElementInDashboard,
    focusDashboardTile,

    // Dashboard registration (for Dashboard component)
    registerDashboard,
    unregisterDashboard,
  }), [
    dashboardExists,
    getDashboardElements,
    sendToDashboard,
    removeFromDashboard,
    clearDashboard,
    isElementInDashboard,
    focusDashboardTile,
    registerDashboard,
    unregisterDashboard,
  ]);

  return (
    <CommandMessagingContext.Provider value={value}>
      {children}
    </CommandMessagingContext.Provider>
  );
};

export default CommandMessagingContext;
