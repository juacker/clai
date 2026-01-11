/**
 * MarkdownNode - React Flow custom node for rich markdown content
 *
 * Renders markdown content (tables, code blocks, lists, headings, etc.)
 * in a canvas node using the same renderer as chat messages.
 * Auto-sizes to fit content via CSS (no fixed dimensions).
 */

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import MarkdownMessage from '../../Chat/MarkdownMessage';
import styles from './MarkdownNode.module.css';

const MarkdownNode = ({ data, selected }) => {
  const {
    content = '',
    showHandles = true,
  } = data;

  return (
    <div className={`${styles.markdownNode} ${selected ? styles.selected : ''}`}>
      {showHandles && (
        <Handle type="target" position={Position.Left} className={styles.handle} />
      )}

      <div className={styles.content}>
        <MarkdownMessage content={content} isStreaming={false} />
      </div>

      {showHandles && (
        <Handle type="source" position={Position.Right} className={styles.handle} />
      )}
    </div>
  );
};

export default memo(MarkdownNode);
