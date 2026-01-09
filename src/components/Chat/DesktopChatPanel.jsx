import React from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import AgentChat from '../AgentChat/AgentChat';
import styles from './DesktopChatPanel.module.css';

/**
 * DesktopChatPanel - Agent activity panel container
 *
 * This component provides a full-height, fixed-position panel
 * that appears on the right side of the screen.
 * It shows agent activity for the current tab.
 *
 * Features:
 * - Full viewport height (0 to 100vh)
 * - Fixed positioning on right side
 * - Smooth expand/collapse animations
 * - Shows AgentChat for the active tab
 * - Integrates with ChatManagerContext for open/close state
 */
const DesktopChatPanel = ({ userInfo }) => {
  const { isCurrentChatOpen } = useChatManager();
  const { activeTabId } = useTabManager();

  // Determine if panel should be visible
  const isOpen = isCurrentChatOpen();

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ''}`}
      role="complementary"
      aria-label="Agent activity panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        <AgentChat tabId={activeTabId} userInfo={userInfo} />
      </div>
    </div>
  );
};

export default DesktopChatPanel;

