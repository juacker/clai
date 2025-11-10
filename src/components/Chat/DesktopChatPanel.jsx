import React from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import Chat from './Chat';
import styles from './DesktopChatPanel.module.css';

/**
 * DesktopChatPanel - Desktop-specific chat panel container
 *
 * This component provides a full-height, fixed-position chat panel
 * that appears on the right side of the screen on desktop devices.
 * It expands from right to left when opened.
 *
 * Features:
 * - Full viewport height (0 to 100vh)
 * - Fixed positioning on right side
 * - Smooth expand/collapse animations
 * - Hidden on mobile (mobile uses MobileTerminalSheet)
 * - Integrates with ChatManagerContext for state management
 */
const DesktopChatPanel = () => {
  const { isCurrentChatOpen, getCurrentChatInstance } = useChatManager();

  // Get the current chat instance (if any)
  const chatInstance = getCurrentChatInstance();

  // Determine if panel should be visible
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
        {chatInstance && (
          <Chat
            space={chatInstance.space}
            room={chatInstance.room}
            isOpen={isOpen}
          />
        )}
      </div>
    </div>
  );
};

export default DesktopChatPanel;

