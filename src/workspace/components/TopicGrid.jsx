import React, { memo, useCallback } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import styles from './TopicGrid.module.css';

const STATUS_CONFIG = {
  complete: { label: 'Complete', className: 'statusComplete' },
  'in-progress': { label: 'In Progress', className: 'statusInProgress' },
  queued: { label: 'Queued', className: 'statusQueued' },
};

const TopicGrid = memo(({ topics }) => {
  const { browseFolder } = useWorkspace();

  const handleClick = useCallback(
    (topic) => {
      if (!topic.path) return;
      browseFolder(topic.path);
    },
    [browseFolder]
  );

  if (!topics || topics.length === 0) {
    return (
      <div className={styles.empty}>No topics defined yet.</div>
    );
  }

  return (
    <div className={styles.grid}>
      {topics.map((topic, i) => {
        const config = STATUS_CONFIG[topic.status] || STATUS_CONFIG.queued;
        const isClickable = !!topic.path;

        return (
          <button
            key={topic.name || i}
            type="button"
            className={`${styles.card} ${styles[config.className]} ${isClickable ? styles.cardClickable : ''}`}
            onClick={() => handleClick(topic)}
            disabled={!isClickable}
          >
            <div className={styles.cardHeader}>
              <h4 className={styles.cardTitle}>{topic.name}</h4>
              <span className={`${styles.statusBadge} ${styles[config.className]}`}>
                {config.label}
              </span>
            </div>

            {topic.summary && (
              <p className={styles.cardSummary}>{topic.summary}</p>
            )}

            <div className={styles.cardFooter}>
              {topic.artifactCount != null && (
                <span className={styles.artifactCount}>
                  {topic.artifactCount} {topic.artifactCount === 1 ? 'file' : 'files'}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});

TopicGrid.displayName = 'TopicGrid';

export default TopicGrid;
