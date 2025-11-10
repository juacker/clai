import React, { useMemo } from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useSharedSpaceRoomData } from '../../contexts/SharedSpaceRoomDataContext';
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
 * - Supports forwarding messages from terminal when chat is visible
 *
 * @param {Object} props - Component props
 * @param {string} props.message - Message to forward to chat (from terminal)
 * @param {function} props.onMessageProcessed - Callback when message is processed
 */
const DesktopChatPanel = ({ message, onMessageProcessed }) => {
  const { isCurrentChatOpen, getCurrentChatInstance } = useChatManager();
  const { getSpaceById, getRoomById } = useSharedSpaceRoomData();

  // Get the current chat instance (if any)
  const chatInstance = getCurrentChatInstance();

  // Determine if panel should be visible
  const isOpen = isCurrentChatOpen();

  // Resolve space and room IDs to full objects
  const space = useMemo(() => {
    if (!chatInstance?.space) return null;
    return getSpaceById(chatInstance.space);
  }, [chatInstance?.space, getSpaceById]);

  const room = useMemo(() => {
    if (!chatInstance?.space || !chatInstance?.room) return null;
    return getRoomById(chatInstance.space, chatInstance.room);
  }, [chatInstance?.space, chatInstance?.room, getRoomById]);

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
            space={space}
            room={room}
            isOpen={isOpen}
            message={message}
            onMessageProcessed={onMessageProcessed}
          />
        )}
      </div>
    </div>
  );
};

export default DesktopChatPanel;

