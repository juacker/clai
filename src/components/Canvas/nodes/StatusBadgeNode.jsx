/**
 * StatusBadgeNode - React Flow custom node for status indicators
 *
 * Displays status badges with color-coded severity levels.
 * Useful for showing health status of systems, services, etc.
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import styles from './StatusBadgeNode.module.css';

const STATUS_CONFIG = {
  healthy: {
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: '✓',
    label: 'Healthy',
  },
  warning: {
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: '⚠',
    label: 'Warning',
  },
  critical: {
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: '✕',
    label: 'Critical',
  },
  unknown: {
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: '?',
    label: 'Unknown',
  },
};

const StatusBadgeNode = ({ data, selected }) => {
  const {
    status = 'unknown',
    message,
    title,
    showTimestamp = false,
    timestamp,
  } = data;

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;

  return (
    <div
      className={`${styles.badgeNode} ${selected ? styles.selected : ''}`}
      style={{
        borderColor: config.color,
        backgroundColor: config.bgColor,
      }}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.header}>
        <span
          className={styles.statusIcon}
          style={{ color: config.color }}
        >
          {config.icon}
        </span>
        <span
          className={styles.statusLabel}
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>

      {title && <div className={styles.title}>{title}</div>}

      {message && <div className={styles.message}>{message}</div>}

      {showTimestamp && timestamp && (
        <div className={styles.timestamp}>
          {new Date(timestamp).toLocaleString()}
        </div>
      )}

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
};

export default memo(StatusBadgeNode);
