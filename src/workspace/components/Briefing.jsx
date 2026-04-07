import React, { memo } from 'react';
import styles from './Briefing.module.css';

const STATUS_CLASS = {
  completed: 'statusCompleted',
  completed_with_warnings: 'statusWarning',
  failed: 'statusFailed',
  running: 'statusRunning',
};

const STATUS_ICON = {
  completed: '\u2705',
  completed_with_warnings: '\u26A0\uFE0F',
  failed: '\u274C',
  running: '\u23F3',
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

const Briefing = memo(({ focus, progress, lastRun, highlights, openQuestions }) => {
  const hasProgress = progress && typeof progress.total === 'number' && progress.total > 0;
  const progressPct = hasProgress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className={styles.briefing}>
      {focus && (
        <div className={styles.focusBlock}>
          <span className={styles.focusLabel}>Current Focus</span>
          <p className={styles.focusText}>{focus}</p>
        </div>
      )}

      {hasProgress && (
        <div className={styles.progressBlock}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>
              {progress.label || 'Progress'}
            </span>
            <span className={styles.progressCount}>
              {progress.completed}/{progress.total} ({progressPct}%)
            </span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {highlights && highlights.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Key Highlights</span>
          <ul className={styles.list}>
            {highlights.map((item, i) => (
              <li key={i} className={styles.listItem}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {openQuestions && openQuestions.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Open Questions</span>
          <ul className={styles.list}>
            {openQuestions.map((q, i) => (
              <li key={i} className={styles.listItemQuestion}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {lastRun && (
        <div className={`${styles.lastRun} ${styles[STATUS_CLASS[lastRun.status]] || ''}`}>
          <span className={styles.lastRunIcon}>
            {STATUS_ICON[lastRun.status] || '\u2022'}
          </span>
          <div className={styles.lastRunContent}>
            {lastRun.summary && (
              <span className={styles.lastRunSummary}>{lastRun.summary}</span>
            )}
            {lastRun.timestamp && (
              <span className={styles.lastRunTime}>
                {formatTimestamp(lastRun.timestamp)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

Briefing.displayName = 'Briefing';

export default Briefing;
