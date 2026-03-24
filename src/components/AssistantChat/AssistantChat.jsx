import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { assistantClient, useAssistantSession } from '../../assistant';
import useAssistantStore from '../../assistant/sessionStore';
import MarkdownMessage from '../Chat/MarkdownMessage';
import UserAvatar from '../UserAvatar';
import styles from '../AgentChat/AgentChat.module.css';

const EMPTY_TOOL_CALLS = [];

/**
 * AssistantChat Component
 *
 * Displays assistant session messages for a specific tab.
 * Sources data from the assistant Zustand store.
 */
const AssistantChat = ({ tabId, userInfo }) => {
  const {
    messages,
    streamingText,
    isStreaming,
    sessionId,
    clearSessions,
  } = useAssistantSession(tabId);
  const toolCalls = useAssistantStore((state) =>
    sessionId
      ? (state.sessions[sessionId]?.toolCalls || EMPTY_TOOL_CALLS)
      : EMPTY_TOOL_CALLS
  );
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
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
  }, [messages, isStreaming, streamingText, toolCalls]);

  useEffect(() => {
    let cancelled = false;

    const loadProviderStatus = async () => {
      try {
        const sessions = await assistantClient.listProviderSessions();
        if (!cancelled) {
          setProviderConfigured(sessions.length > 0);
        }
      } catch {
        if (!cancelled) {
          setProviderConfigured(false);
        }
      }
    };

    loadProviderStatus();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleClearChat = useCallback(async () => {
    if (!tabId || isClearing) return;

    const confirmed = window.confirm(
      'Clear the assistant chat history for this tab? This will remove all saved assistant sessions for the tab.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await clearSessions();
    } catch (error) {
      console.error('[AssistantChat] Failed to clear chat:', error);
    } finally {
      setIsClearing(false);
    }
  }, [tabId, isClearing, clearSessions]);

  // Empty state
  if (messages.length === 0) {
    return (
      <div className={styles.agentChat}>
        <div className={styles.chatToolbar}>
          <div className={styles.toolbarTitle}>Assistant</div>
          <button
            type="button"
            className={styles.chatActionButton}
            onClick={handleClearChat}
            disabled={isClearing}
          >
            {isClearing ? 'Clearing…' : 'Clear Chat'}
          </button>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No activity yet</div>
          <div className={styles.emptyDescription}>
            {providerConfigured
              ? 'Type a message in the terminal to start a conversation.'
              : 'Connect an assistant provider in Settings, then send a message from the terminal.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.agentChat}>
      <div className={styles.chatToolbar}>
        <div className={styles.toolbarTitle}>Assistant</div>
        <button
          type="button"
          className={styles.chatActionButton}
          onClick={handleClearChat}
          disabled={isClearing}
        >
          {isClearing ? 'Clearing…' : 'Clear Chat'}
        </button>
      </div>
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

/**
 * Get tool_use content parts from a message.
 */
const getToolUses = (message) => {
  if (!message.content || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === 'tool_use');
};

const MessageBlock = memo(({ message, userInfo, streamingText, toolCalls }) => {
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
            // ContentPart::ToolUse fields are snake_case (from Rust serde)
            const toolCallId = tu.tool_call_id;
            const toolName = tu.tool_name;
            // ToolInvocation fields are camelCase (from Rust serde)
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

  // Skip tool result messages — they're shown inline with tool calls
  if (role === 'tool') {
    return null;
  }

  return null;
});

/**
 * ToolCallBlock — renders a tool call with status and result
 */
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

export default AssistantChat;
