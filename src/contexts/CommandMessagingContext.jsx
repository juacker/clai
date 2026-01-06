/**
 * CommandMessagingContext
 *
 * Provides inter-command messaging capabilities, particularly for
 * sending data (elements, charts) to the dashboard command.
 *
 * Now uses the Dashboard's registered API via CommandRegistry instead of
 * storing dashboard state in TabManagerContext.
 *
 * Features:
 * - sendToDashboard(config): Sends a chart config to dashboard
 * - isElementInDashboard(elementId): Checks if an element is already in dashboard
 * - getDashboardElements(): Get all elements from dashboard
 * - dashboardExists: Boolean indicating if dashboard command exists in current tab
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
    splitTile,
    getLeafTiles,
    setActiveTile,
    getCommandsByType,
  } = useTabManager();

  const { executeCommand } = useCommand();

  /**
   * Get all dashboard commands from the current tab
   * @returns {Array} Array of dashboard command entries
   */
  const getDashboards = useCallback(() => {
    return getCommandsByType('dashboard');
  }, [getCommandsByType]);

  /**
   * Get the first dashboard command from the current tab (if exists)
   */
  const getDashboardCommand = useCallback(() => {
    const dashboards = getDashboards();
    return dashboards.length > 0 ? dashboards[0] : null;
  }, [getDashboards]);

  /**
   * Whether dashboard command exists in current tab
   */
  const dashboardExists = useMemo(() => {
    const dashboards = getDashboards();
    return dashboards.length > 0;
  }, [getDashboards]);

  /**
   * Number of dashboards in the current tab
   */
  const dashboardCount = useMemo(() => {
    return getDashboards().length;
  }, [getDashboards]);

  /**
   * Get dashboard elements
   * @returns {Array} Array of element configs
   */
  const getDashboardElements = useCallback(() => {
    const dashboard = getDashboardCommand();
    if (!dashboard?.api?.getCharts) return [];
    return dashboard.api.getCharts();
  }, [getDashboardCommand]);

  /**
   * Check if an element is already in dashboard
   * @param {string} elementId - Element ID to check
   * @returns {boolean} True if element is in dashboard
   */
  const isElementInDashboard = useCallback((elementId) => {
    const dashboard = getDashboardCommand();
    if (!dashboard?.api?.hasElement) return false;
    return dashboard.api.hasElement(elementId);
  }, [getDashboardCommand]);

  /**
   * Send a chart config to a specific dashboard by ID
   * @param {string} dashboardId - The dashboard command ID
   * @param {Object} config - Chart configuration { context, groupBy?, filterBy?, ... }
   * @returns {Object} Result with success status and elementId
   */
  const sendToDashboardById = useCallback((dashboardId, config) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    if (!config || !config.context) {
      return { success: false, message: 'Invalid config: missing context' };
    }

    // Validate element configuration
    const element = { id: 'temp', type: 'context-chart', config };
    const validation = validateDashboardElement(element);
    if (!validation.valid) {
      return { success: false, message: `Invalid element: ${validation.error}` };
    }

    // Find the specific dashboard
    const dashboards = getDashboards();
    const dashboard = dashboards.find(d => d.id === dashboardId);

    if (!dashboard) {
      return { success: false, message: 'Dashboard not found' };
    }

    // Wait for dashboard API to be ready (component needs to mount)
    if (!dashboard?.api?.addChart) {
      return { success: false, message: 'Dashboard not ready yet, please try again' };
    }

    // Add the chart to dashboard
    const elementId = dashboard.api.addChart(config);
    if (!elementId) {
      return { success: false, message: 'Failed to add chart to dashboard' };
    }

    return { success: true, message: 'Chart sent to dashboard', elementId };
  }, [activeTabId, getDashboards]);

  /**
   * Send a chart config to dashboard
   * - If no dashboard exists, auto-creates one via horizontal split (left/right)
   * - If one dashboard exists, sends directly to it
   * - If multiple dashboards exist, returns needsSelection: true with list of dashboards
   * @param {Object} config - Chart configuration { context, groupBy?, filterBy?, ... }
   * @returns {Object} Result with success status, elementId, or needsSelection flag
   */
  const sendToDashboard = useCallback((config) => {
    if (!activeTabId) {
      return { success: false, message: 'No active tab' };
    }

    if (!config || !config.context) {
      return { success: false, message: 'Invalid config: missing context' };
    }

    // Validate element configuration
    const element = { id: 'temp', type: 'context-chart', config };
    const validation = validateDashboardElement(element);
    if (!validation.valid) {
      return { success: false, message: `Invalid element: ${validation.error}` };
    }

    const dashboards = getDashboards();

    // If no dashboard exists, create one via horizontal split (left/right)
    if (dashboards.length === 0) {
      if (!activeTileId) {
        return { success: false, message: 'No active tile' };
      }

      // Execute dashboard command first to get the command ID
      const dashboardCommand = executeCommand('dashboard');
      if (!dashboardCommand || !dashboardCommand.id) {
        return { success: false, message: 'Failed to create dashboard command' };
      }

      // Split the current tile horizontally (side by side: left | right)
      const splitResult = splitTile(activeTileId, 'horizontal', dashboardCommand.id);
      if (!splitResult.success) {
        return { success: false, message: `Failed to split tile: ${splitResult.message}` };
      }

      // Get the newly created dashboard
      const newDashboards = getDashboards();
      const dashboard = newDashboards.length > 0 ? newDashboards[0] : null;

      if (!dashboard?.api?.addChart) {
        return { success: false, message: 'Dashboard not ready yet, please try again' };
      }

      const elementId = dashboard.api.addChart(config);
      if (!elementId) {
        return { success: false, message: 'Failed to add chart to dashboard' };
      }

      return { success: true, message: 'Chart sent to dashboard', elementId };
    }

    // If multiple dashboards exist, return selection needed
    if (dashboards.length > 1) {
      // Return dashboard info for picker UI
      const dashboardInfo = dashboards.map((d, index) => ({
        id: d.id,
        label: `Dashboard ${index + 1}`,
        chartCount: d.api?.getCharts?.()?.length || 0,
      }));
      return { success: false, needsSelection: true, dashboards: dashboardInfo, config };
    }

    // Single dashboard - send directly
    const dashboard = dashboards[0];

    if (!dashboard?.api?.addChart) {
      return { success: false, message: 'Dashboard not ready yet, please try again' };
    }

    const elementId = dashboard.api.addChart(config);
    if (!elementId) {
      return { success: false, message: 'Failed to add chart to dashboard' };
    }

    return { success: true, message: 'Chart sent to dashboard', elementId };
  }, [activeTabId, activeTileId, getDashboards, splitTile, executeCommand]);

  /**
   * Remove an element from dashboard
   * @param {string} elementId - Element ID to remove
   * @returns {boolean} Success
   */
  const removeFromDashboard = useCallback((elementId) => {
    const dashboard = getDashboardCommand();
    if (!dashboard?.api?.removeChart) return false;
    return dashboard.api.removeChart(elementId);
  }, [getDashboardCommand]);

  /**
   * Clear all charts from dashboard
   */
  const clearDashboard = useCallback(() => {
    const dashboard = getDashboardCommand();
    if (!dashboard?.api?.clearCharts) return;
    dashboard.api.clearCharts();
  }, [getDashboardCommand]);

  /**
   * Focus the dashboard tile if it exists (singleton behavior)
   * Used to prevent creating multiple dashboard commands - instead focuses existing one
   * @returns {boolean} True if dashboard was focused, false if no dashboard exists
   */
  const focusDashboardTile = useCallback(() => {
    const dashboard = getDashboardCommand();
    if (!dashboard) {
      return false;
    }

    // Find the tile containing the dashboard command
    const leafTiles = getLeafTiles();
    const dashboardTile = leafTiles.find(tile => tile.commandId === dashboard.id);

    if (dashboardTile) {
      setActiveTile(dashboardTile.id);
      return true;
    }

    return false;
  }, [getDashboardCommand, getLeafTiles, setActiveTile]);

  /**
   * Highlight a dashboard tile (for picker hover preview)
   * @param {string|null} dashboardId - Dashboard command ID to highlight, or null to clear
   */
  const highlightDashboard = useCallback((dashboardId) => {
    // Remove any existing highlights
    document.querySelectorAll('[data-dashboard-highlight="true"]').forEach(el => {
      el.removeAttribute('data-dashboard-highlight');
    });

    if (!dashboardId) return;

    // Find the dashboard command
    const dashboards = getDashboards();
    const dashboard = dashboards.find(d => d.id === dashboardId);
    if (!dashboard) return;

    // Find the tile containing this dashboard
    const leafTiles = getLeafTiles();
    const tile = leafTiles.find(t => t.commandId === dashboardId);
    if (!tile) return;

    // Find and highlight the tile element
    const tileElement = document.querySelector(`[data-tile-id="${tile.id}"]`);
    if (tileElement) {
      tileElement.setAttribute('data-dashboard-highlight', 'true');
    }
  }, [getDashboards, getLeafTiles]);

  const value = useMemo(() => ({
    // State
    dashboardExists,
    dashboardCount,

    // Actions
    getDashboards,
    getDashboardElements,
    sendToDashboard,
    sendToDashboardById,
    removeFromDashboard,
    clearDashboard,
    isElementInDashboard,
    focusDashboardTile,
    highlightDashboard,
  }), [
    dashboardExists,
    dashboardCount,
    getDashboards,
    getDashboardElements,
    sendToDashboard,
    sendToDashboardById,
    removeFromDashboard,
    clearDashboard,
    isElementInDashboard,
    focusDashboardTile,
    highlightDashboard,
  ]);

  return (
    <CommandMessagingContext.Provider value={value}>
      {children}
    </CommandMessagingContext.Provider>
  );
};

export default CommandMessagingContext;
