/**
 * TextNode - React Flow custom node for text/labels
 *
 * Simple text node for annotations, labels, and descriptions.
 * Supports different sizes and styles.
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import styles from './TextNode.module.css';

const SIZE_CONFIG = {
  small: {
    fontSize: 12,
    padding: '6px 10px',
  },
  medium: {
    fontSize: 14,
    padding: '8px 12px',
  },
  large: {
    fontSize: 18,
    padding: '10px 16px',
  },
  heading: {
    fontSize: 24,
    padding: '12px 20px',
    fontWeight: 600,
  },
};

const TextNode = ({ data, selected }) => {
  const {
    text = '',
    size = 'medium',
    color,
    backgroundColor,
    align = 'left',
    showHandles = true,
  } = data;

  const config = SIZE_CONFIG[size] || SIZE_CONFIG.medium;

  const nodeStyle = {
    fontSize: config.fontSize,
    padding: config.padding,
    fontWeight: config.fontWeight || 400,
    color: color || 'var(--color-text-primary, #333)',
    backgroundColor: backgroundColor || 'transparent',
    textAlign: align,
  };

  return (
    <div
      className={`${styles.textNode} ${selected ? styles.selected : ''} ${backgroundColor ? styles.withBackground : ''}`}
      style={nodeStyle}
    >
      {showHandles && (
        <Handle type="target" position={Position.Left} className={styles.handle} />
      )}

      <span className={styles.text}>{text}</span>

      {showHandles && (
        <Handle type="source" position={Position.Right} className={styles.handle} />
      )}
    </div>
  );
};

export default memo(TextNode);
