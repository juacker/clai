import React, { useEffect } from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useAssistantStore, assistantClient } from '../../assistant';
import AssistantChat from '../AssistantChat/AssistantChat';
import styles from './DesktopChatPanel.module.css';

/**
 * DesktopChatPanel - Chat panel container
 *
 * This component provides a full-height, fixed-position panel
 * that appears on the right side of the screen.
 *
 * Renders the assistant chat for the active tab and restores session state
 * from the assistant runtime on mount/tab change.
 */
const DesktopChatPanel = ({ userInfo }) => {
  const { isCurrentChatOpen } = useChatManager();
  const { activeTabId } = useTabManager();
  const assistantSessionId = useAssistantStore(
    (state) => state.activeSessionByTab[activeTabId]
  );
  const isOpen = isCurrentChatOpen();

  // Restore existing assistant session from DB on tab change or when the
  // panel is opened after a background run attached a session later.
  useEffect(() => {
    if (!activeTabId || assistantSessionId || !isOpen) return;

    const restore = async () => {
      try {
        const sessions = await assistantClient.listSessions(activeTabId);
        if (sessions.length > 0) {
          const session = sessions[0];
          const [messages, runs, toolCalls] = await Promise.all([
            assistantClient.loadSessionMessages(session.id),
            assistantClient.listRuns(session.id),
            assistantClient.listToolCalls(session.id),
          ]);
          const store = useAssistantStore.getState();
          store.loadSessionData(session.id, session, messages, runs, toolCalls);
          store.setActiveSessionForTab(activeTabId, session.id);
        }
      } catch {
        // No session exists yet — that's fine
      }
    };
    restore();
  }, [activeTabId, assistantSessionId, isOpen]);

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ''}`}
      role="complementary"
      aria-label="Chat panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        <AssistantChat tabId={activeTabId} userInfo={userInfo} />
      </div>
    </div>
  );
};

export default DesktopChatPanel;
