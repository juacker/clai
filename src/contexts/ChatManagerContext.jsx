import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * ChatManagerContext
 *
 * Manages the chat panel state for the core chat feature.
 * Since chat is now a core feature (not a plugin), this context
 * simply manages the open/closed state of the chat panel.
 *
 * Note: Chat conversations and messages are managed by the chat service
 * (via Tauri backend), not by this context.
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
  // Simple state to track if chat panel is open
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Toggle the chat panel open/closed state
   */
  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  /**
   * Open the chat panel
   */
  const openChat = useCallback(() => {
    setIsOpen(true);
  }, []);

  /**
   * Close the chat panel
   */
  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  /**
   * Check if the chat panel is open
   */
  const isChatOpen = useCallback(() => {
    return isOpen;
  }, [isOpen]);

  const value = useMemo(() => {
    return {
      isOpen,
      toggleChat,
      openChat,
      closeChat,
      isChatOpen
    };
  }, [
    isOpen,
    toggleChat,
    openChat,
    closeChat,
    isChatOpen
  ]);

  return (
    <ChatManagerContext.Provider value={value}>
      {children}
    </ChatManagerContext.Provider>
  );
};

export default ChatManagerContext;
