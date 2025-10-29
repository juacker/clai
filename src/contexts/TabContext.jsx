/**
 * TabContext
 *
 * Provides tab-specific context including space/room selection and custom context data.
 * Each tab has its own TabContext instance, allowing independent context per tab.
 *
 * This context wraps tab content and provides:
 * - Space/Room selection (per tab)
 * - Custom context key-value pairs (future)
 * - Access to shared space/room data cache
 *
 * Architecture:
 * - Uses SharedSpaceRoomData for cached spaces/rooms data
 * - Manages tab-specific selection state
 * - Syncs changes back to TabManagerContext
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useSharedSpaceRoomData } from './SharedSpaceRoomDataContext';

const TabContext = createContext(null);

export function TabContextProvider({ children, tabId, initialContext, onContextChange }) {
  // Access shared space/room data cache
  const {
    spaces,
    getRoomsForSpace,
    getSpaceById,
    getRoomById,
    loading: sharedDataLoading,
  } = useSharedSpaceRoomData();

  // Tab-specific state
  const [selectedSpaceId, setSelectedSpaceId] = useState(
    initialContext?.spaceRoom?.selectedSpaceId || null
  );
  const [selectedRoomId, setSelectedRoomId] = useState(
    initialContext?.spaceRoom?.selectedRoomId || null
  );
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [customContext, setCustomContextState] = useState(
    initialContext?.customContext || {}
  );

  // Derived state: Get full space/room objects
  const selectedSpace = useMemo(() => {
    return getSpaceById(selectedSpaceId);
  }, [selectedSpaceId, getSpaceById]);

  const selectedRoom = useMemo(() => {
    return getRoomById(selectedSpaceId, selectedRoomId);
  }, [selectedSpaceId, selectedRoomId, getRoomById]);

  // Load rooms when space changes
  useEffect(() => {
    if (selectedSpaceId) {
      loadRoomsForSpace(selectedSpaceId);
    } else {
      setRooms([]);
      setSelectedRoomId(null);
    }
  }, [selectedSpaceId]);

  /**
   * Load rooms for a specific space
   */
  const loadRoomsForSpace = useCallback(async (spaceId) => {
    if (!spaceId) {
      setRooms([]);
      return;
    }

    try {
      setRoomsLoading(true);
      const roomsData = await getRoomsForSpace(spaceId);
      setRooms(roomsData);

      // If current room is not in new rooms list, clear selection
      if (selectedRoomId && !roomsData.find(r => r.id === selectedRoomId)) {
        setSelectedRoomId(null);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, [getRoomsForSpace, selectedRoomId]);

  /**
   * Change to a different space
   * This will also clear the room selection and load new rooms
   */
  const changeSpace = useCallback((space) => {
    if (!space) {
      setSelectedSpaceId(null);
      setSelectedRoomId(null);
      setRooms([]);
      return;
    }

    const newSpaceId = space.id;
    setSelectedSpaceId(newSpaceId);
    setSelectedRoomId(null); // Clear room when changing space

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        spaceRoom: {
          selectedSpaceId: newSpaceId,
          selectedRoomId: null,
        },
        customContext,
      });
    }
  }, [onContextChange, customContext]);

  /**
   * Change to a different room within current space
   */
  const changeRoom = useCallback((room) => {
    if (!room) {
      setSelectedRoomId(null);
    } else {
      setSelectedRoomId(room.id);
    }

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        spaceRoom: {
          selectedSpaceId,
          selectedRoomId: room?.id || null,
        },
        customContext,
      });
    }
  }, [selectedSpaceId, onContextChange, customContext]);

  /**
   * Set a custom context value
   * @param {string} key - Context key
   * @param {any} value - Context value
   */
  const setCustomContext = useCallback((key, value) => {
    setCustomContextState(prev => {
      const newContext = { ...prev, [key]: value };

      // Notify parent of context change
      if (onContextChange) {
        onContextChange({
          spaceRoom: {
            selectedSpaceId,
            selectedRoomId,
          },
          customContext: newContext,
        });
      }

      return newContext;
    });
  }, [selectedSpaceId, selectedRoomId, onContextChange]);

  /**
   * Get a custom context value
   * @param {string} key - Context key
   * @returns {any} Context value or undefined
   */
  const getCustomContext = useCallback((key) => {
    return customContext[key];
  }, [customContext]);

  /**
   * Delete a custom context key
   * @param {string} key - Context key to delete
   */
  const deleteCustomContext = useCallback((key) => {
    setCustomContextState(prev => {
      const newContext = { ...prev };
      delete newContext[key];

      // Notify parent of context change
      if (onContextChange) {
        onContextChange({
          spaceRoom: {
            selectedSpaceId,
            selectedRoomId,
          },
          customContext: newContext,
        });
      }

      return newContext;
    });
  }, [selectedSpaceId, selectedRoomId, onContextChange]);

  /**
   * Clear all custom context
   */
  const clearCustomContext = useCallback(() => {
    setCustomContextState({});

    // Notify parent of context change
    if (onContextChange) {
      onContextChange({
        spaceRoom: {
          selectedSpaceId,
          selectedRoomId,
        },
        customContext: {},
      });
    }
  }, [selectedSpaceId, selectedRoomId, onContextChange]);

  /**
   * Navigate using cd command syntax
   * Supports: cd <space> [room]
   *
   * @param {string} spaceName - Space name or ID
   * @param {string} roomName - Optional room name or ID
   */
  const navigate = useCallback(async (spaceName, roomName = null) => {
    if (!spaceName) {
      // cd with no args - go to root (clear selection)
      changeSpace(null);
      return;
    }

    // Find space by name or ID
    const space = spaces.find(s =>
      s.id === spaceName ||
      s.name?.toLowerCase() === spaceName.toLowerCase()
    );

    if (!space) {
      throw new Error(`Space not found: ${spaceName}`);
    }

    // Change to the space
    changeSpace(space);

    // If room is specified, wait for rooms to load and select it
    if (roomName) {
      const roomsData = await getRoomsForSpace(space.id);
      const room = roomsData.find(r =>
        r.id === roomName ||
        r.name?.toLowerCase() === roomName.toLowerCase()
      );

      if (!room) {
        throw new Error(`Room not found: ${roomName}`);
      }

      changeRoom(room);
    }
  }, [spaces, changeSpace, changeRoom, getRoomsForSpace]);

  /**
   * Get current path (for pwd command)
   * @returns {string} Current path in format: /space/room or /space or /
   */
  const getCurrentPath = useCallback(() => {
    if (!selectedSpace) {
      return '/';
    }

    if (!selectedRoom) {
      return `/${selectedSpace.name || selectedSpace.id}`;
    }

    return `/${selectedSpace.name || selectedSpace.id}/${selectedRoom.name || selectedRoom.id}`;
  }, [selectedSpace, selectedRoom]);

  const value = {
    // Tab ID
    tabId,

    // Space/Room state
    selectedSpace,
    selectedRoom,
    rooms,
    loading: sharedDataLoading || roomsLoading,

    // Space/Room methods
    changeSpace,
    changeRoom,
    navigate,
    getCurrentPath,

    // Access to all spaces (for ls command, etc.)
    allSpaces: spaces,

    // Custom context (future)
    customContext,
    setCustomContext,
    getCustomContext,
    deleteCustomContext,
    clearCustomContext,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

/**
 * Hook to access tab context
 *
 * @returns {Object} Tab context
 * @throws {Error} If used outside of TabContextProvider
 */
export function useTabContext() {
  const context = useContext(TabContext);

  if (!context) {
    throw new Error('useTabContext must be used within a TabContextProvider');
  }

  return context;
}

export default TabContext;

