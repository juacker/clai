/**
 * ChatMessageList Component
 *
 * Shared message rendering used by both AssistantChat (workspace) and Fleet (detail pane).
 * Handles markdown rendering, tool call display, and auto-scrolling.
 */

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import MarkdownMessage from '../Chat/MarkdownMessage';
import styles from '../AgentChat/AgentChat.module.css';

const EMPTY_STREAMING = {};
const EMPTY_TOOL_CALLS = [];

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getTextContent = (message) => {
  if (!message.content || !Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

const getToolUses = (message) => {
  if (!message.content || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === 'tool_use');
};

/**
 * ChatMessageList - Renders a list of assistant messages with markdown and tool calls
 *
 * @param {Object} props
 * @param {Array} props.messages - Message objects with id, role, content, createdAt
 * @param {Object} [props.streamingText] - Map of messageId → current streaming text
 * @param {boolean} [props.isStreaming] - Whether a message is currently streaming
 * @param {Array} [props.toolCalls] - Tool call objects with id, status, result, error
 */
const ChatMessageList = ({
  messages,
  streamingText = EMPTY_STREAMING,
  isStreaming = false,
  toolCalls = EMPTY_TOOL_CALLS,
}) => {
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
  }, [messages, isStreaming, streamingText, toolCalls]);

  return (
    <div
      ref={containerRef}
      className={styles.activityList}
      onScroll={handleScroll}
    >
      {messages.map((message) => (
        <MessageBlock
          key={message.id}
          message={message}
          streamingText={streamingText[message.id]}
          toolCalls={toolCalls}
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
  );
};

const MessageBlock = memo(({ message, streamingText, toolCalls }) => {
  const { role, createdAt } = message;

  if (role === 'user') {
    const textContent = getTextContent(message);
    if (!textContent) return null;

    return (
      <div className={styles.userMessage}>
        <div className={styles.messageHeader}>
          <span className={styles.messageRoleText}>You</span>
          {createdAt && <span className={styles.messageTimestamp}>{formatTimestamp(createdAt)}</span>}
        </div>
        <div className={styles.messageContent}>{textContent}</div>
      </div>
    );
  }

  if (role === 'assistant') {
    const textContent = streamingText || getTextContent(message);
    const isCurrentlyStreaming = !!streamingText;
    const toolUses = getToolUses(message);

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
          {textContent && (
            <MarkdownMessage
              content={textContent}
              isStreaming={isCurrentlyStreaming}
            />
          )}
          {toolUses.map((tu) => {
            const toolCallId = tu.tool_call_id;
            const toolName = tu.tool_name;
            const tc = toolCalls.find((t) => t.id === toolCallId);
            return (
              <ToolCallBlock
                key={toolCallId}
                toolName={toolName}
                status={tc?.status || 'running'}
                result={tc?.result}
                error={tc?.error}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Skip tool result messages — shown inline with tool calls
  return null;
});

const ToolCallBlock = memo(({ toolName, status, result, error }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const statusDisplay = status === 'completed' ? 'complete' : status === 'failed' ? 'error' : 'pending';

  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolHeader} onClick={handleToggle}>
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIconEmoji}>
            {status === 'completed' ? '✓' : status === 'failed' ? '✗' : '⚙'}
          </span>
          <span className={styles.toolName}>{toolName}</span>
          <StatusIndicator status={statusDisplay} />
        </div>
        <div className={styles.toolHeaderRight}>
          <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.toolContent}>
          {result && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Result</div>
              <div className={styles.toolResult}>
                <MarkdownMessage
                  content={typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                  isStreaming={false}
                />
              </div>
            </div>
          )}
          {error && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Error</div>
              <div className={styles.toolResult}>
                <span style={{ color: 'var(--color-critical)' }}>{error}</span>
              </div>
            </div>
          )}
          {!result && !error && status === 'running' && (
            <div className={styles.loadingState}>
              <span className={styles.spinner}></span>
              <span>Executing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const StatusIndicator = memo(({ status }) => {
  switch (status) {
    case 'pending':
      return (
        <span className={styles.statusPending}>
          <span className={styles.spinner}></span>
          Running...
        </span>
      );
    case 'complete':
      return (
        <span className={styles.statusSuccess}>
          <span className={styles.successIcon}>✓</span>
          Complete
        </span>
      );
    case 'error':
      return (
        <span className={styles.statusError}>
          <span className={styles.errorIcon}>✗</span>
          Failed
        </span>
      );
    default:
      return null;
  }
});

export default ChatMessageList;
