import React, { useEffect, useRef, useCallback, memo } from 'react';
import { useAssistantSession } from '../../assistant';
import MarkdownMessage from '../Chat/MarkdownMessage';
import UserAvatar from '../UserAvatar';
import styles from '../AgentChat/AgentChat.module.css';

/**
 * AssistantChat Component
 *
 * Displays assistant session messages for a specific tab.
 * Sources data from the assistant Zustand store (not AgentActivityContext).
 * Coexists with AgentChat during migration.
 */
const AssistantChat = ({ tabId, userInfo }) => {
  const { messages, streamingText, isStreaming } = useAssistantSession(tabId);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  const checkIfNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    const threshold = 150;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
  }, [checkIfNearBottom]);

  // Auto-scroll behavior
  useEffect(() => {
    const currentCount = messages.length;
    const isNewMessage = currentCount > prevMessageCountRef.current;
    prevMessageCountRef.current = currentCount;

    if (isNewMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      isNearBottomRef.current = true;
      return;
    }

    if (isStreaming && isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming, streamingText]);

  // Empty state
  if (messages.length === 0) {
    return (
      <div className={styles.agentChat}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No activity yet</div>
          <div className={styles.emptyDescription}>
            Type a message in the terminal to start a conversation.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.agentChat}>
      <div
        ref={containerRef}
        className={styles.activityList}
        onScroll={handleScroll}
      >
        {messages.map((message) => (
          <MessageBlock
            key={message.id}
            message={message}
            userInfo={userInfo}
            streamingText={streamingText[message.id]}
          />
        ))}

        {isStreaming && (
          <div className={styles.runningIndicator}>
            <img
              src="/icon.svg"
              alt="Clai"
              className={styles.runningIcon}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Get text content from a message's content parts.
 */
const getTextContent = (message) => {
  if (!message.content || !Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

const MessageBlock = memo(({ message, userInfo, streamingText }) => {
  const { role, createdAt } = message;

  if (role === 'user') {
    const textContent = getTextContent(message);
    if (!textContent) return null;

    return (
      <div className={styles.userMessage}>
        <div className={styles.messageHeader}>
          <UserAvatar
            avatarUrl={userInfo?.avatarURL}
            userName={userInfo?.name || userInfo?.email}
            size="small"
          />
          <span className={styles.messageRoleText}>{userInfo?.name || 'You'}</span>
          {createdAt && <span className={styles.messageTimestamp}>{formatTimestamp(createdAt)}</span>}
        </div>
        <div className={styles.messageContent}>{textContent}</div>
      </div>
    );
  }

  if (role === 'assistant') {
    // Use streaming text if available, otherwise use persisted content
    const textContent = streamingText || getTextContent(message);
    const isCurrentlyStreaming = !!streamingText;

    return (
      <div className={styles.assistantMessage}>
        <div className={styles.messageHeader}>
          <img
            src="/icon.svg"
            alt="Clai"
            className={styles.providerIcon}
          />
          <span className={styles.messageRoleText}>Assistant</span>
          {createdAt && <span className={styles.messageTimestamp}>{formatTimestamp(createdAt)}</span>}
        </div>
        <div className={styles.messageContent}>
          <MarkdownMessage
            content={textContent || ''}
            isStreaming={isCurrentlyStreaming}
          />
        </div>
      </div>
    );
  }

  return null;
});

export default AssistantChat;
