/**
 * SharedSpaceRoomDataContext
 *
 * Provides shared cache of spaces and rooms data across all tabs.
 * This context is responsible for:
 * - Fetching spaces from API (once)
 * - Caching rooms per space (lazy loading)
 * - Providing shared data to all tabs
 *
 * Note: This context does NOT manage space/room selection.
 * Selection is handled per-tab by TabContext.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSpaces, getRooms } from '../api/client';

const SharedSpaceRoomDataContext = createContext(null);

export function SharedSpaceRoomDataProvider({ children }) {
  // Shared data state
  const [spaces, setSpaces] = useState([]);
  const [roomsCache, setRoomsCache] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch spaces on mount
  useEffect(() => {
    fetchSpaces();
  }, []);

  /**
   * Fetch all available spaces from API
   */
  const fetchSpaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get token from localStorage
      const token = localStorage.getItem('netdata_token');

      if (!token) {
        console.warn('No token available, skipping spaces fetch');
        setSpaces([]);
        setLoading(false);
        return;
      }

      const spacesData = await getSpaces(token);
      setSpaces(spacesData || []);
    } catch (err) {
      console.error('Error fetching spaces:', err);
      setError(err);
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get rooms for a specific space
   * Uses cache if available, otherwise fetches from API
   *
   * @param {string} spaceId - The space ID to get rooms for
   * @returns {Promise<Array>} Array of rooms
   */
  const getRoomsForSpace = useCallback(async (spaceId) => {
    if (!spaceId) {
      return [];
    }

    // Check cache first
    if (roomsCache.has(spaceId)) {
      return roomsCache.get(spaceId);
    }

    try {
      // Get token from localStorage
      const token = localStorage.getItem('netdata_token');

      if (!token) {
        console.warn('No token available, skipping rooms fetch');
        return [];
      }

      // Fetch rooms from API
      const roomsData = await getRooms(token, spaceId);
      const rooms = roomsData || [];

      // Update cache
      setRoomsCache(prev => {
        const newCache = new Map(prev);
        newCache.set(spaceId, rooms);
        return newCache;
      });

      return rooms;
    } catch (err) {
      console.error(`Error fetching rooms for space ${spaceId}:`, err);
      return [];
    }
  }, [roomsCache]);

  /**
   * Get space by ID
   *
   * @param {string} spaceId - The space ID to find
   * @returns {Object|null} Space object or null if not found
   */
  const getSpaceById = useCallback((spaceId) => {
    if (!spaceId || !spaces.length) {
      return null;
    }
    return spaces.find(space => space.id === spaceId) || null;
  }, [spaces]);

  /**
   * Get room by ID from cache
   *
   * @param {string} spaceId - The space ID the room belongs to
   * @param {string} roomId - The room ID to find
   * @returns {Object|null} Room object or null if not found
   */
  const getRoomById = useCallback((spaceId, roomId) => {
    if (!spaceId || !roomId) {
      return null;
    }

    const rooms = roomsCache.get(spaceId);
    if (!rooms) {
      return null;
    }

    return rooms.find(room => room.id === roomId) || null;
  }, [roomsCache]);

  /**
   * Refetch spaces from API
   * Clears rooms cache to ensure fresh data
   */
  const refetch = useCallback(async () => {
    setRoomsCache(new Map()); // Clear rooms cache
    await fetchSpaces();
  }, [fetchSpaces]);

  /**
   * Clear rooms cache for a specific space
   * Useful when rooms data might be stale
   *
   * @param {string} spaceId - The space ID to clear cache for
   */
  const clearRoomsCache = useCallback((spaceId) => {
    if (spaceId) {
      setRoomsCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(spaceId);
        return newCache;
      });
    } else {
      // Clear all cache
      setRoomsCache(new Map());
    }
  }, []);

  const value = useMemo(() => ({
    // Data
    spaces,
    loading,
    error,

    // Methods
    getRoomsForSpace,
    getSpaceById,
    getRoomById,
    refetch,
    clearRoomsCache,
  }), [
    spaces,
    roomsCache,
    loading,
    error,
    getRoomsForSpace,
    getSpaceById,
    getRoomById,
    refetch,
    clearRoomsCache
  ]);

  return (
    <SharedSpaceRoomDataContext.Provider value={value}>
      {children}
    </SharedSpaceRoomDataContext.Provider>
  );
}

/**
 * Hook to access shared space/room data
 *
 * @returns {Object} Shared space/room data context
 * @throws {Error} If used outside of SharedSpaceRoomDataProvider
 */
export function useSharedSpaceRoomData() {
  const context = useContext(SharedSpaceRoomDataContext);

  if (!context) {
    throw new Error('useSharedSpaceRoomData must be used within a SharedSpaceRoomDataProvider');
  }

  return context;
}

export default SharedSpaceRoomDataContext;

