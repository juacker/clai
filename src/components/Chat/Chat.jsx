import React from 'react';
import styles from './Chat.module.css';

/**
 * Chat Component
 *
 * A chat component that displays space and room information with mock messages.
 * This component is designed to be shown/hidden based on the active space-room context.
 * Multiple instances are kept in memory to preserve state when switching between contexts.
 *
 * Props:
 * - space: The space identifier
 * - room: The room identifier
 * - isOpen: Whether the chat is currently open/visible
 */

// Mock messages data
const MOCK_MESSAGES = [
  {
    id: 1,
    sender: 'Alice',
    text: 'Hey team, have you checked the latest metrics?',
    timestamp: '10:30 AM',
    isOwn: false
  },
  {
    id: 2,
    sender: 'You',
    text: 'Yes, I\'m looking at them now. CPU usage seems high.',
    timestamp: '10:32 AM',
    isOwn: true
  },
  {
    id: 3,
    sender: 'Bob',
    text: 'I noticed that too. Let me investigate the backend service.',
    timestamp: '10:33 AM',
    isOwn: false
  },
  {
    id: 4,
    sender: 'You',
    text: 'Thanks! Keep me posted.',
    timestamp: '10:34 AM',
    isOwn: true
  },
  {
    id: 5,
    sender: 'Alice',
    text: 'The dashboard looks great btw! 🎉',
    timestamp: '10:35 AM',
    isOwn: false
  }
];

const Chat = ({ space, room, isOpen }) => {
  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div className={styles.chatTitle}>
          <span className={styles.chatIcon}>💬</span>
          <span className={styles.chatTitleText}>Chat</span>
        </div>
        <div className={styles.chatContext}>
          <span className={styles.contextLabel}>Space:</span>
          <span className={styles.contextValue}>{space || 'No Space'}</span>
          <span className={styles.contextSeparator}>•</span>
          <span className={styles.contextLabel}>Room:</span>
          <span className={styles.contextValue}>{room || 'No Room'}</span>
        </div>
      </div>

      <div className={styles.chatBody}>
        {MOCK_MESSAGES.map((message) => (
          <div
            key={message.id}
            className={`${styles.messageWrapper} ${message.isOwn ? styles.messageWrapperOwn : ''
              }`}
          >
            <div
              className={`${styles.messageBubble} ${message.isOwn ? styles.messageBubbleOwn : ''
                }`}
            >
              {!message.isOwn && (
                <div className={styles.messageSender}>{message.sender}</div>
              )}
              <div className={styles.messageText}>{message.text}</div>
              <div className={styles.messageTimestamp}>{message.timestamp}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default Chat;

