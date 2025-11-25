import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

/**
 * ChatManagerContext
 *
 * Manages multiple chat instances based on plugin instances.
 * Each chat instance is stored in memory and persists across tab switches.
 * When switching tabs with different plugin contexts, the appropriate
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
  // Store all chat instances by plugin instance ID
  // Format: { 'plugin_id': { isOpen: boolean, messages: [], ...otherState } }
  const [chatInstances, setChatInstances] = useState({});

  // Track the currently active plugin instance ID
  const [activePluginId, setActivePluginId] = useState(null);

  // Reference to prevent unnecessary re-renders
  const chatInstancesRef = useRef(chatInstances);
  chatInstancesRef.current = chatInstances;

  /**
   * Get or create a chat instance for a specific plugin
   */
  const getChatInstance = useCallback((pluginId) => {
    if (!pluginId) return null;
    return chatInstancesRef.current[pluginId] || null;
  }, []);

  /**
   * Initialize a chat instance if it doesn't exist
   */
  const initializeChatInstance = useCallback((pluginId) => {
    if (!pluginId) return null;

    if (!chatInstancesRef.current[pluginId]) {
      setChatInstances(prev => ({
        ...prev,
        [pluginId]: {
          pluginId,
          isOpen: false,
          messages: [],
          createdAt: new Date(),
          lastAccessedAt: new Date()
        }
      }));
    }

    return pluginId;
  }, []);

  /**
   * Set the active plugin context
   * This is called when switching tabs or when context changes
   */
  const setActiveContext = useCallback((pluginId) => {
    if (!pluginId) {
      setActivePluginId(null);
      return;
    }

    // Initialize the chat instance if it doesn't exist
    initializeChatInstance(pluginId);

    // Update last accessed time for the active chat
    setChatInstances(prev => {
      if (prev[pluginId]) {
        return {
          ...prev,
          [pluginId]: {
            ...prev[pluginId],
            lastAccessedAt: new Date()
          }
        };
      }
      return prev;
    });

    setActivePluginId(pluginId);
  }, [initializeChatInstance]);

  /**
   * Toggle the chat open/closed state for the active plugin
   */
  const toggleChat = useCallback(() => {
    if (!activePluginId) return;

    setChatInstances(prev => ({
      ...prev,
      [activePluginId]: {
        ...prev[activePluginId],
        isOpen: !prev[activePluginId]?.isOpen
      }
    }));
  }, [activePluginId]);

  /**
   * Open the chat for the active plugin
   */
  const openChat = useCallback(() => {
    if (!activePluginId) return;

    setChatInstances(prev => ({
      ...prev,
      [activePluginId]: {
        ...prev[activePluginId],
        isOpen: true
      }
    }));
  }, [activePluginId]);

  /**
   * Close the chat for the active plugin
   */
  const closeChat = useCallback(() => {
    if (!activePluginId) return;

    setChatInstances(prev => ({
      ...prev,
      [activePluginId]: {
        ...prev[activePluginId],
        isOpen: false
      }
    }));
  }, [activePluginId]);

  /**
   * Check if the current chat is open
   */
  const isCurrentChatOpen = useCallback(() => {
    if (!activePluginId) return false;
    return chatInstancesRef.current[activePluginId]?.isOpen || false;
  }, [activePluginId]);

  /**
   * Get the current active chat instance
   */
  const getCurrentChatInstance = useCallback(() => {
    if (!activePluginId) return null;
    return chatInstancesRef.current[activePluginId] || null;
  }, [activePluginId]);

  /**
   * Add a message to a specific chat instance
   * (Placeholder for future implementation)
   */
  const addMessage = useCallback((pluginId, message) => {
    if (!pluginId) return;

    setChatInstances(prev => {
      if (!prev[pluginId]) return prev;

      return {
        ...prev,
        [pluginId]: {
          ...prev[pluginId],
          messages: [...prev[pluginId].messages, {
            id: Date.now() + Math.random(),
            ...message,
            timestamp: new Date()
          }]
        }
      };
    });
  }, []);

  /**
   * Clear all chat instances (useful for logout/reset)
   */
  const clearAllChats = useCallback(() => {
    setChatInstances({});
    setActivePluginId(null);
  }, []);

  /**
   * Get the active plugin ID
   */
  const getActivePluginId = useCallback(() => {
    return activePluginId;
  }, [activePluginId]);

  const value = useMemo(() => {
    return {
      chatInstances,
      activePluginId,
      setActiveContext,
      toggleChat,
      openChat,
      closeChat,
      isCurrentChatOpen,
      getCurrentChatInstance,
      getChatInstance,
      addMessage,
      clearAllChats,
      getActivePluginId
    };
  }, [
    chatInstances,
    activePluginId,
    setActiveContext,
    toggleChat,
    openChat,
    closeChat,
    isCurrentChatOpen,
    getCurrentChatInstance,
    getChatInstance,
    addMessage,
    clearAllChats,
    getActivePluginId
  ]);

  return (
    <ChatManagerContext.Provider value={value}>
      {children}
    </ChatManagerContext.Provider>
  );
};

export default ChatManagerContext;
