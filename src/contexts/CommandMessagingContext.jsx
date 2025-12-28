/**
 * CommandMessagingContext
 *
 * Provides inter-command messaging capabilities, particularly for
 * sending data (elements, charts) to the canvas command.
 *
 * Features:
 * - sendToCanvas(element, spaceRoomKey): Sends an element to canvas for a space/room
 * - isElementInCanvas(elementId, spaceRoomKey): Checks if an element is already in canvas
 * - getCanvasElements(spaceRoomKey): Get elements for a specific space/room
 * - canvasExists: Boolean indicating if canvas command exists in current tab
 *
 * Element format:
 * {
 *   id: "unique-id",
 *   type: "context-chart" | "timeseries-chart" | "bar-chart" | etc,
 *   config: { ... element-specific configuration }
 * }
 *
 * Canvas elements are stored per space/room combination, so switching
 * space/room shows different elements (and switching back preserves them).
 *
 * Calling components should use useTabContext to get selectedSpace/selectedRoom
 * and create the spaceRoomKey: `${selectedSpace.id}_${selectedRoom.id}`
 */

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useTabManager } from './TabManagerContext';
import { useCommand } from './CommandContext';
import { validateCanvasElement } from '../utils/canvasElementValidator';

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
    getCanvasState,
    getActiveCanvasState,
    addCanvasElement,
    removeCanvasElement,
    clearCanvasMetrics,
    setCanvasCommandId,
    isElementInCanvas: checkElementInCanvas,
    splitTile,
    getLeafTiles,
    setActiveTile,
  } = useTabManager();

  const { executeCommand } = useCommand();

  /**
   * Whether canvas command exists in current tab
   */
  const canvasExists = useMemo(() => {
    const canvasState = getActiveCanvasState();
    return !!canvasState.commandId;
  }, [getActiveCanvasState]);

  /**
   * Get canvas elements for a specific space/room
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {Array} Array of element configs
   */
  const getCanvasElements = useCallback((spaceRoomKey) => {
    if (!spaceRoomKey) return [];
    const canvasState = getActiveCanvasState(spaceRoomKey);
    return canvasState.elements || [];
  }, [getActiveCanvasState]);

  /**
   * Check if an element is already in canvas for a space/room
   * @param {string} elementId - Element ID to check
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {boolean} True if element is in canvas
   */
  const isElementInCanvas = useCallback((elementId, spaceRoomKey) => {
    if (!activeTabId || !spaceRoomKey) return false;
    return checkElementInCanvas(activeTabId, elementId, spaceRoomKey);
  }, [activeTabId, checkElementInCanvas]);

  /**
   * Send an element to canvas for a specific space/room
   * If canvas doesn't exist, auto-creates it via horizontal split (left/right)
   * @param {Object} element - Element config { id, type, config }
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   * @returns {Object} Result with success status
   */
  const sendToCanvas = useCallback((element, spaceRoomKey) => {
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
    const validation = validateCanvasElement(element);
    if (!validation.valid) {
      return { success: false, message: `Invalid element: ${validation.error}` };
    }

    // Check if element is already in canvas
    if (isElementInCanvas(element.id, spaceRoomKey)) {
      return { success: false, message: 'Element already in canvas' };
    }

    const currentCanvasState = getCanvasState(activeTabId, spaceRoomKey);

    // If canvas doesn't exist, create it via horizontal split (left/right)
    if (!currentCanvasState.commandId) {
      if (!activeTileId) {
        return { success: false, message: 'No active tile' };
      }

      // Execute canvas command first to get the command ID
      const canvasCommand = executeCommand('canvas');
      if (!canvasCommand || !canvasCommand.id) {
        return { success: false, message: 'Failed to create canvas command' };
      }

      // Split the current tile horizontally (side by side: left | right)
      // Pass the canvas command ID so the new tile is created with the command already assigned
      const splitResult = splitTile(activeTileId, 'horizontal', canvasCommand.id);
      if (!splitResult.success) {
        return { success: false, message: `Failed to split tile: ${splitResult.message}` };
      }
    }

    // Add the element to canvas for the space/room
    addCanvasElement(activeTabId, element, spaceRoomKey);

    return { success: true, message: 'Element sent to canvas' };
  }, [activeTabId, activeTileId, isElementInCanvas, getCanvasState, splitTile, executeCommand, addCanvasElement]);

  /**
   * Remove an element from canvas for a specific space/room
   * @param {string} elementId - Element ID to remove
   * @param {string} spaceRoomKey - Key in format 'spaceId_roomId'
   */
  const removeFromCanvas = useCallback((elementId, spaceRoomKey) => {
    if (!activeTabId || !spaceRoomKey) return;
    removeCanvasElement(activeTabId, elementId, spaceRoomKey);
  }, [activeTabId, removeCanvasElement]);

  /**
   * Clear all metrics from canvas for a specific space/room
   * @param {string} spaceRoomKey - Optional key - if not provided, clears all space/rooms
   */
  const clearCanvas = useCallback((spaceRoomKey = null) => {
    if (!activeTabId) return;
    clearCanvasMetrics(activeTabId, spaceRoomKey);
  }, [activeTabId, clearCanvasMetrics]);

  /**
   * Register canvas command with the tab (called by Canvas component on mount)
   * @param {string} commandId - Canvas command ID
   */
  const registerCanvas = useCallback((commandId) => {
    if (!activeTabId) return;
    setCanvasCommandId(activeTabId, commandId);
  }, [activeTabId, setCanvasCommandId]);

  /**
   * Unregister canvas command (called by Canvas component on unmount)
   */
  const unregisterCanvas = useCallback(() => {
    if (!activeTabId) return;
    setCanvasCommandId(activeTabId, null);
  }, [activeTabId, setCanvasCommandId]);

  /**
   * Focus the canvas tile if it exists (singleton behavior)
   * Used to prevent creating multiple canvas commands - instead focuses existing one
   * @returns {boolean} True if canvas was focused, false if no canvas exists
   */
  const focusCanvasTile = useCallback(() => {
    const currentCanvasState = getActiveCanvasState();
    if (!currentCanvasState.commandId) {
      return false;
    }

    // Find the tile containing the canvas command
    const leafTiles = getLeafTiles();
    const canvasTile = leafTiles.find(tile => tile.commandId === currentCanvasState.commandId);

    if (canvasTile) {
      setActiveTile(canvasTile.id);
      return true;
    }

    return false;
  }, [getActiveCanvasState, getLeafTiles, setActiveTile]);

  const value = useMemo(() => ({
    // State
    canvasExists,

    // Actions
    getCanvasElements,
    sendToCanvas,
    removeFromCanvas,
    clearCanvas,
    isElementInCanvas,
    focusCanvasTile,

    // Canvas registration (for Canvas component)
    registerCanvas,
    unregisterCanvas,
  }), [
    canvasExists,
    getCanvasElements,
    sendToCanvas,
    removeFromCanvas,
    clearCanvas,
    isElementInCanvas,
    focusCanvasTile,
    registerCanvas,
    unregisterCanvas,
  ]);

  return (
    <CommandMessagingContext.Provider value={value}>
      {children}
    </CommandMessagingContext.Provider>
  );
};

export default CommandMessagingContext;
