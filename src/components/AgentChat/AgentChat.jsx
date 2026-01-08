import React, { useEffect } from 'react';
import { useAgentActivity } from '../../contexts/AgentActivityContext';
import ToolCallBlock from './ToolCallBlock';
import styles from './AgentChat.module.css';

/**
 * AgentChat Component
 *
 * Displays agent activity for a specific tab. Shows:
 * - User's query (if triggered by on-demand agent)
 * - Tool calls with their status, params, and results
 * - Overall execution status
 *
 * This component subscribes to agent activity via AgentActivityContext
 * and updates in real-time as tools are executed.
 */
const AgentChat = ({ tabId, onClose }) => {
  const { getActivity, ensureTabTracked } = useAgentActivity();

  // Ensure we're tracking this tab
  useEffect(() => {
    if (tabId) {
      ensureTabTracked(tabId);
    }
  }, [tabId, ensureTabTracked]);

  const activity = getActivity(tabId);

  // Empty state
  if (activity.status === 'idle' && activity.toolCalls.length === 0) {
    return (
      <div className={styles.agentChat}>
        <Header status={activity.status} onClose={onClose} />
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
      <Header status={activity.status} onClose={onClose} />

      <div className={styles.activityList}>
        {/* User Query */}
        {activity.query && <UserMessage text={activity.query} />}

        {/* Tool Calls */}
        {activity.toolCalls.map((toolCall) => (
          <ToolCallBlock key={toolCall.id} toolCall={toolCall} />
        ))}

        {/* Running Indicator - only show when starting with no tool calls yet */}
        {activity.status === 'running' && activity.toolCalls.length === 0 && (
          <div className={styles.runningState}>
            <span className={styles.spinner}></span>
            <span>Starting...</span>
          </div>
        )}

        {/* Error Status */}
        {activity.status === 'error' && (
          <ErrorMessage error={activity.error} />
        )}
      </div>
    </div>
  );
};

/**
 * Header component for AgentChat
 */
const Header = ({ status, onClose }) => {
  const isRunning = status === 'running';

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <img
          src="/icon.svg"
          alt="Clai"
          className={`${styles.claiIcon} ${isRunning ? styles.spinning : ''}`}
        />
        <span className={styles.headerTitle}>Tab Chat</span>
      </div>
      <div className={styles.headerRight}>
        {onClose && (
          <button className={styles.closeButton} onClick={onClose} title="Close">
            ×
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * UserMessage component - displays the user's query
 */
const UserMessage = ({ text }) => {
  return (
    <div className={styles.userMessage}>
      <div className={styles.messageRole}>You</div>
      <div className={styles.messageContent}>{text}</div>
    </div>
  );
};

/**
 * ErrorMessage component - shows when agent encountered an error
 */
const ErrorMessage = ({ error }) => {
  return (
    <div className={styles.errorMessage}>
      <span className={styles.errorIcon}>⚠</span>
      <div className={styles.errorContent}>
        <div className={styles.errorTitle}>Agent error</div>
        {error && <div className={styles.errorText}>{error}</div>}
      </div>
    </div>
  );
};

export default AgentChat;
