import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSpaces, getRooms, hasToken } from '../api/client';

const SpaceRoomContext = createContext(null);

export const useSpaceRoom = () => {
  const context = useContext(SpaceRoomContext);
  if (!context) {
    throw new Error('useSpaceRoom must be used within a SpaceRoomProvider');
  }
  return context;
};

export const SpaceRoomProvider = ({ children }) => {
  const [spaces, setSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch spaces from API
  const fetchSpaces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if user is authenticated
      const isAuthenticated = await hasToken();
      if (!isAuthenticated) {
        throw new Error('No authentication token found');
      }

      // Token is handled by Rust backend
      const spacesData = await getSpaces();
      setSpaces(spacesData);

      // Load saved selection from localStorage or select first space
      const savedSpaceId = localStorage.getItem('netdata_selected_space');
      const savedRoomId = localStorage.getItem('netdata_selected_room');

      if (savedSpaceId && spacesData.find(s => s.id === savedSpaceId)) {
        const space = spacesData.find(s => s.id === savedSpaceId);
        setSelectedSpace(space);

        // Fetch rooms for the saved space
        await fetchRoomsForSpace(space.id, savedRoomId);
      } else if (spacesData.length > 0) {
        // Select first space by default
        setSelectedSpace(spacesData[0]);
        await fetchRoomsForSpace(spacesData[0].id);
      }
    } catch (err) {
      console.error('Error fetching spaces:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch rooms for a specific space
  const fetchRoomsForSpace = async (spaceId, savedRoomId = null) => {
    try {
      // Token is handled by Rust backend
      const roomsData = await getRooms(spaceId);

      // The API returns an array of rooms
      const roomsList = Array.isArray(roomsData) ? roomsData : [];

      setRooms(roomsList);

      // Select saved room or default to first room
      if (savedRoomId && roomsList.find(r => r.id === savedRoomId)) {
        setSelectedRoom(roomsList.find(r => r.id === savedRoomId));
      } else if (roomsList.length > 0) {
        setSelectedRoom(roomsList[0]);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
      // Don't set error here, just use empty rooms
      setRooms([]);
    }
  };

  // Change selected space
  const changeSpace = useCallback(async (space) => {
    if (!space || space.id === selectedSpace?.id) return;

    setSelectedSpace(space);
    setSelectedRoom(null);
    setRooms([]);

    // Save to localStorage
    localStorage.setItem('netdata_selected_space', space.id);
    localStorage.removeItem('netdata_selected_room');

    // Fetch rooms for new space
    await fetchRoomsForSpace(space.id);
  }, [selectedSpace]);

  // Change selected room
  const changeRoom = useCallback((room) => {
    if (!room || room.id === selectedRoom?.id) return;

    setSelectedRoom(room);

    // Save to localStorage
    localStorage.setItem('netdata_selected_room', room.id);
  }, [selectedRoom]);

  // Initialize on mount
  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const value = {
    spaces,
    selectedSpace,
    selectedRoom,
    rooms,
    loading,
    error,
    changeSpace,
    changeRoom,
    refetch: fetchSpaces
  };

  return (
    <SpaceRoomContext.Provider value={value}>
      {children}
    </SpaceRoomContext.Provider>
  );
};

