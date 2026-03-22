import React from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useAssistantStore } from '../../assistant';
import AgentChat from '../AgentChat/AgentChat';
import AssistantChat from '../AssistantChat/AssistantChat';
import styles from './DesktopChatPanel.module.css';

/**
 * DesktopChatPanel - Chat panel container
 *
 * This component provides a full-height, fixed-position panel
 * that appears on the right side of the screen.
 *
 * Renders AssistantChat when an assistant session is active for the tab,
 * otherwise falls back to AgentChat (legacy agent path).
 */
const DesktopChatPanel = ({ userInfo }) => {
  const { isCurrentChatOpen } = useChatManager();
  const { activeTabId } = useTabManager();
  const assistantSessionId = useAssistantStore(
    (state) => state.activeSessionByTab[activeTabId]
  );

  const isOpen = isCurrentChatOpen();

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ''}`}
      role="complementary"
      aria-label="Chat panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        {assistantSessionId ? (
          <AssistantChat tabId={activeTabId} userInfo={userInfo} />
        ) : (
          <AgentChat tabId={activeTabId} userInfo={userInfo} />
        )}
      </div>
    </div>
  );
};

export default DesktopChatPanel;

