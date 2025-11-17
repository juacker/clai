import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

/**
 * ChatManagerContext
 *
 * Manages multiple chat instances based on space/room combinations.
 * Each chat instance is stored in memory and persists across tab switches.
 * When switching tabs with different space/room contexts, the appropriate
 * chat instance is shown/hidden without being destroyed.
 */

const ChatManagerContext = createContext(null);

export const useChatManager = () => {
  const context = useContext(ChatManagerContext);
  if (!context) {
    throw new Error('useChatManager must be used within a ChatManagerProvider');
  }
  return context;
};

export const ChatManagerProvider = ({ children }) => {
  // Store all chat instances by space-room key
  // Format: { 'space-room': { isOpen: boolean, messages: [], ...otherState } }
  const [chatInstances, setChatInstances] = useState({});

  // Track the currently active space-room
  const [activeSpaceRoom, setActiveSpaceRoom] = useState(null);

  // Reference to prevent unnecessary re-renders
  const chatInstancesRef = useRef(chatInstances);
  chatInstancesRef.current = chatInstances;

  /**
   * Generate a unique key for space-room combination
   */
  const generateKey = useCallback((space, room) => {
    // Handle null/undefined values
    const spaceKey = space || 'no-space';
    const roomKey = room || 'no-room';
    return `${spaceKey}--${roomKey}`;
  }, []);

  /**
   * Get or create a chat instance for a specific space-room
   */
  const getChatInstance = useCallback((space, room) => {
    const key = generateKey(space, room);
    return chatInstancesRef.current[key] || null;
  }, [generateKey]);

  /**
   * Initialize a chat instance if it doesn't exist
   */
  const initializeChatInstance = useCallback((space, room) => {
    const key = generateKey(space, room);

    if (!chatInstancesRef.current[key]) {
      setChatInstances(prev => ({
        ...prev,
        [key]: {
          space,
          room,
          isOpen: false,
          messages: [],
          createdAt: new Date(),
          lastAccessedAt: new Date()
        }
      }));
    }

    return key;
  }, [generateKey]);

  /**
   * Set the active space-room context
   * This is called when switching tabs or when context changes
   */
  const setActiveContext = useCallback((space, room) => {
    const key = generateKey(space, room);

    // Initialize the chat instance if it doesn't exist
    initializeChatInstance(space, room);

    // Update last accessed time for the active chat
    setChatInstances(prev => {
      if (prev[key]) {
        return {
          ...prev,
          [key]: {
            ...prev[key],
            lastAccessedAt: new Date()
          }
        };
      }
      return prev;
    });

    setActiveSpaceRoom(key);
  }, [generateKey, initializeChatInstance]);

  /**
   * Toggle the chat open/closed state for the active space-room
   */
  const toggleChat = useCallback(() => {
    if (!activeSpaceRoom) return;

    setChatInstances(prev => ({
      ...prev,
      [activeSpaceRoom]: {
        ...prev[activeSpaceRoom],
        isOpen: !prev[activeSpaceRoom]?.isOpen
      }
    }));
  }, [activeSpaceRoom]);

  /**
   * Open the chat for the active space-room
   */
  const openChat = useCallback(() => {
    if (!activeSpaceRoom) return;

    setChatInstances(prev => ({
      ...prev,
      [activeSpaceRoom]: {
        ...prev[activeSpaceRoom],
        isOpen: true
      }
    }));
  }, [activeSpaceRoom]);

  /**
   * Close the chat for the active space-room
   */
  const closeChat = useCallback(() => {
    if (!activeSpaceRoom) return;

    setChatInstances(prev => ({
      ...prev,
      [activeSpaceRoom]: {
        ...prev[activeSpaceRoom],
        isOpen: false
      }
    }));
  }, [activeSpaceRoom]);

  /**
   * Check if the current chat is open
   */
  const isCurrentChatOpen = useCallback(() => {
    if (!activeSpaceRoom) return false;
    return chatInstancesRef.current[activeSpaceRoom]?.isOpen || false;
  }, [activeSpaceRoom]);

  /**
   * Get the current active chat instance
   */
  const getCurrentChatInstance = useCallback(() => {
    if (!activeSpaceRoom) return null;
    return chatInstancesRef.current[activeSpaceRoom] || null;
  }, [activeSpaceRoom]);

  /**
   * Add a message to a specific chat instance
   * (Placeholder for future implementation)
   */
  const addMessage = useCallback((space, room, message) => {
    const key = generateKey(space, room);

    setChatInstances(prev => {
      if (!prev[key]) return prev;

      return {
        ...prev,
        [key]: {
          ...prev[key],
          messages: [...prev[key].messages, {
            id: Date.now() + Math.random(),
            ...message,
            timestamp: new Date()
          }]
        }
      };
    });
  }, [generateKey]);

  /**
   * Clear all chat instances (useful for logout/reset)
   */
  const clearAllChats = useCallback(() => {
    setChatInstances({});
    setActiveSpaceRoom(null);
  }, []);

  const value = useMemo(() => {
    return {
      chatInstances,
      activeSpaceRoom,
      setActiveContext,
      toggleChat,
      openChat,
      closeChat,
      isCurrentChatOpen,
      getCurrentChatInstance,
      getChatInstance,
      addMessage,
      clearAllChats
    };
  }, [
    chatInstances,
    activeSpaceRoom,
    setActiveContext,
    toggleChat,
    openChat,
    closeChat,
    isCurrentChatOpen,
    getCurrentChatInstance,
    getChatInstance,
    addMessage,
    clearAllChats
  ]);

  return (
    <ChatManagerContext.Provider value={value}>
      {children}
    </ChatManagerContext.Provider>
  );
};

export default ChatManagerContext;

