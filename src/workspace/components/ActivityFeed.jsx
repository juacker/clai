import React, { memo, useMemo, useState, useCallback } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import styles from './ActivityFeed.module.css';

const STATUS_CONFIG = {
  completed: { label: 'Completed', icon: '\u2705', className: 'runCompleted' },
  completed_with_warnings: { label: 'Warnings', icon: '\u26A0\uFE0F', className: 'runWarning' },
  failed: { label: 'Failed', icon: '\u274C', className: 'runFailed' },
  cancelled: { label: 'Cancelled', icon: '\u23F9\uFE0F', className: 'runCancelled' },
  running: { label: 'Running', icon: '\u23F3', className: 'runRunning' },
};

const formatTimestamp = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (startedAt, completedAt) => {
  if (!startedAt || !completedAt) return '';
  const ms = completedAt - startedAt;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

const getTextContent = (message) => {
  if (!message?.content || !Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
};

const getToolUseCount = (message) => {
  if (!message?.content || !Array.isArray(message.content)) return 0;
  return message.content.filter((part) => part.type === 'tool_use').length;
};

const ActivityFeed = memo(({ maxSessions = 10 }) => {
  const { snapshot } = useWorkspace();
  const [expandedRun, setExpandedRun] = useState(null);

  const runs = useMemo(() => {
    const allRuns = snapshot?.runs || [];
    // Sort newest first
    return [...allRuns]
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, maxSessions);
  }, [snapshot, maxSessions]);

  const messages = snapshot?.messages || [];

  const getRunMessages = useCallback(
    (run) => {
      if (!run.startedAt) return [];
      const start = run.startedAt;
      const end = run.completedAt || Date.now();
      return messages.filter((msg) => {
        const ts = msg.createdAt || 0;
        return ts >= start && ts <= end;
      });
    },
    [messages]
  );

  const toggleExpand = useCallback((runId) => {
    setExpandedRun((current) => (current === runId ? null : runId));
  }, []);

  if (runs.length === 0 && messages.length === 0) {
    return (
      <div className={styles.empty}>No activity recorded yet.</div>
    );
  }

  if (runs.length === 0) {
    // No runs but there are messages — show a generic session
    const msgCount = messages.filter((m) => m.role !== 'tool').length;
    return (
      <div className={styles.feed}>
        <div className={styles.session}>
          <div className={styles.sessionHeader}>
            <span className={styles.sessionIcon}>{'\uD83D\uDCAC'}</span>
            <div className={styles.sessionInfo}>
              <span className={styles.sessionTitle}>Conversation</span>
              <span className={styles.sessionMeta}>
                {msgCount} messages
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {runs.map((run) => {
        const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
        const isExpanded = expandedRun === run.id;
        const runMessages = isExpanded ? getRunMessages(run) : [];
        const duration = formatDuration(run.startedAt, run.completedAt);
        const msgCount = getRunMessages(run).length;

        return (
          <div key={run.id} className={`${styles.session} ${styles[config.className]}`}>
            <button
              type="button"
              className={styles.sessionHeader}
              onClick={() => toggleExpand(run.id)}
            >
              <span className={styles.sessionIcon}>{config.icon}</span>
              <div className={styles.sessionInfo}>
                <div className={styles.sessionTitleRow}>
                  <span className={styles.sessionTitle}>
                    {run.error ? `Failed: ${run.error.slice(0, 80)}` : config.label}
                  </span>
                  <span className={styles.expandIcon} data-expanded={isExpanded}>
                    {'\u25B8'}
                  </span>
                </div>
                <div className={styles.sessionMeta}>
                  {formatTimestamp(run.startedAt)}
                  {duration && <span className={styles.metaSeparator}>{'\u00B7'}</span>}
                  {duration && <span>{duration}</span>}
                  {msgCount > 0 && <span className={styles.metaSeparator}>{'\u00B7'}</span>}
                  {msgCount > 0 && <span>{msgCount} msgs</span>}
                  {run.notices?.length > 0 && (
                    <>
                      <span className={styles.metaSeparator}>{'\u00B7'}</span>
                      <span className={styles.warningCount}>{run.notices.length} warnings</span>
                    </>
                  )}
                </div>
              </div>
            </button>

            {isExpanded && runMessages.length > 0 && (
              <div className={styles.sessionBody}>
                {runMessages
                  .filter((msg) => msg.role !== 'tool')
                  .map((msg) => {
                    const text = getTextContent(msg);
                    const toolCount = getToolUseCount(msg);
                    if (!text && toolCount === 0) return null;

                    return (
                      <div
                        key={msg.id}
                        className={`${styles.msgRow} ${styles[`msg_${msg.role}`]}`}
                      >
                        <span className={styles.msgRole}>
                          {msg.role === 'user' ? 'You' : 'Agent'}
                        </span>
                        <span className={styles.msgText}>
                          {text
                            ? text.length > 200
                              ? text.slice(0, 200) + '\u2026'
                              : text
                            : `${toolCount} tool call${toolCount > 1 ? 's' : ''}`}
                        </span>
                        <span className={styles.msgTime}>
                          {formatTimestamp(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

ActivityFeed.displayName = 'ActivityFeed';

export default ActivityFeed;
