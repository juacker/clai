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

  // Calculate duration if execution has started
  const getDuration = () => {
    if (!activity.startedAt) return null;
    const endTime = activity.completedAt || Date.now();
    const durationMs = endTime - activity.startedAt;
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Empty state
  if (activity.status === 'idle' && activity.toolCalls.length === 0) {
    return (
      <div className={styles.agentChat}>
        <Header status={activity.status} onClose={onClose} />
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🤖</div>
          <div className={styles.emptyTitle}>No agent activity</div>
          <div className={styles.emptyDescription}>
            Type a message in the terminal to start an agent, or wait for a scheduled agent to run.
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

        {/* Running Indicator */}
        {activity.status === 'running' && activity.toolCalls.length === 0 && (
          <div className={styles.runningState}>
            <span className={styles.spinner}></span>
            <span>Agent is starting...</span>
          </div>
        )}

        {/* Completion Status */}
        {activity.status === 'completed' && (
          <CompletionStatus duration={getDuration()} />
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
  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return (
          <span className={`${styles.statusBadge} ${styles.statusRunning}`}>
            <span className={styles.statusDot}></span>
            Running
          </span>
        );
      case 'completed':
        return (
          <span className={`${styles.statusBadge} ${styles.statusCompleted}`}>
            Completed
          </span>
        );
      case 'error':
        return (
          <span className={`${styles.statusBadge} ${styles.statusError}`}>
            Error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.headerIcon}>🤖</span>
        <span className={styles.headerTitle}>Agent Activity</span>
        {getStatusBadge()}
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
 * CompletionStatus component - shows when agent has finished
 */
const CompletionStatus = ({ duration }) => {
  return (
    <div className={styles.completionStatus}>
      <span className={styles.completionIcon}>✓</span>
      <span className={styles.completionText}>Agent completed</span>
      {duration && <span className={styles.completionDuration}>{duration}</span>}
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
