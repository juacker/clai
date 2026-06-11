import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * ChatManagerContext
 *
 * Manages chat panel visibility per tab, so each tab keeps its own
 * open/close state across tab switches.
 *
 * Note: Message state and streaming is handled by AgentActivityContext.
 * This context only handles the UI visibility of the chat panel.
 */

interface ChatManagerValue {
  setActiveTab: (tabId: string | null | undefined) => void;
  toggleChat: () => void;
  openChat: () => void;
  isCurrentChatOpen: () => boolean;
}

const ChatManagerContext = createContext<ChatManagerValue | null>(null);

export const useChatManager = (): ChatManagerValue => {
  const context = useContext(ChatManagerContext);
  if (!context) {
    throw new Error('useChatManager must be used within a ChatManagerProvider');
  }
  return context;
};

export const ChatManagerProvider = ({ children }: { children: React.ReactNode }) => {
  // Panel open state per tab id; a missing entry means closed.
  const [openByTab, setOpenByTab] = useState<Record<string, boolean>>({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const setActiveTab = useCallback((tabId: string | null | undefined) => {
    setActiveTabId(tabId ?? null);
  }, []);

  const toggleChat = useCallback(() => {
    if (!activeTabId) return;
    setOpenByTab(prev => ({ ...prev, [activeTabId]: !prev[activeTabId] }));
  }, [activeTabId]);

  const openChat = useCallback(() => {
    if (!activeTabId) return;
    setOpenByTab(prev => ({ ...prev, [activeTabId]: true }));
  }, [activeTabId]);

  const isCurrentChatOpen = useCallback(() => {
    if (!activeTabId) return false;
    return openByTab[activeTabId] || false;
  }, [activeTabId, openByTab]);

  const value = useMemo<ChatManagerValue>(
    () => ({
      setActiveTab,
      toggleChat,
      openChat,
      isCurrentChatOpen,
    }),
    [setActiveTab, toggleChat, openChat, isCurrentChatOpen]
  );

  return (
    <ChatManagerContext.Provider value={value}>
      {children}
    </ChatManagerContext.Provider>
  );
};

export default ChatManagerContext;
