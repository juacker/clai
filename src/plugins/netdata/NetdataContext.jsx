import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Netdata Context
 * Manages Netdata-specific context data like spaces and rooms
 * This is used internally by Netdata plugin instances
 */
const NetdataContext = createContext(null);

/**
 * Netdata Context Provider
 * @param {Object} props
 * @param {Object} props.plugin - Netdata plugin instance
 * @param {React.ReactNode} props.children
 */
export const NetdataContextProvider = ({ plugin, children }) => {
  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch spaces and rooms from the plugin
   */
  const fetchContexts = useCallback(async () => {
    if (!plugin) return;

    setLoading(true);
    setError(null);

    try {
      const contexts = await plugin.getAvailableContexts();
      setSpaces(contexts.spaces || []);
      setRooms(contexts.rooms || []);
    } catch (err) {
      console.error('Failed to fetch Netdata contexts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [plugin]);

  /**
   * Fetch rooms for a specific space
   */
  const fetchRoomsForSpace = useCallback(async (spaceId) => {
    if (!plugin) return;

    setLoading(true);
    setError(null);

    try {
      const roomsResponse = await plugin.api.getRooms(spaceId);
      const fetchedRooms = roomsResponse.rooms || [];
      setRooms(fetchedRooms);
      return fetchedRooms;
    } catch (err) {
      console.error(`Failed to fetch rooms for space ${spaceId}:`, err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [plugin]);

  /**
   * Get current space info
   */
  const getCurrentSpace = useCallback(() => {
    if (!plugin || !spaces.length) return null;
    return spaces.find(space => space.id === plugin.config.spaceId);
  }, [plugin, spaces]);

  /**
   * Get current room info
   */
  const getCurrentRoom = useCallback(() => {
    if (!plugin || !rooms.length) return null;
    return rooms.find(room => room.id === plugin.config.roomId);
  }, [plugin, rooms]);

  /**
   * Refresh contexts
   */
  const refresh = useCallback(() => {
    fetchContexts();
  }, [fetchContexts]);

  // Fetch contexts on mount and when plugin changes
  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  const value = {
    // Data
    spaces,
    rooms,
    loading,
    error,

    // Current context
    currentSpace: getCurrentSpace(),
    currentRoom: getCurrentRoom(),

    // Actions
    fetchContexts,
    fetchRoomsForSpace,
    refresh
  };

  return (
    <NetdataContext.Provider value={value}>
      {children}
    </NetdataContext.Provider>
  );
};

/**
 * Hook to use Netdata context
 * @returns {Object} Netdata context value
 */
export const useNetdataContext = () => {
  const context = useContext(NetdataContext);
  if (!context) {
    throw new Error('useNetdataContext must be used within NetdataContextProvider');
  }
  return context;
};

export default NetdataContext;

