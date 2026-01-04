/**
 * ChartNode - React Flow custom node for Netdata charts
 *
 * Renders a ContextChart inside a draggable React Flow node.
 * Agents create these nodes via canvas tools with chart configuration.
 *
 * Features:
 * - Zoom-aware rendering: Chart re-renders at higher resolution when zoomed
 * - Dynamic resize: Node height adjusts when filter panel expands/collapses
 */

import React, { memo, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { Handle, Position, useStore, useReactFlow } from '@xyflow/react';
import TabContext from '../../../contexts/TabContext';
import ContextChart from '../../ChartsView/ContextChart';
import styles from './ChartNode.module.css';

const ChartNode = ({ id, data, selected }) => {
  const { selectedSpace, selectedRoom } = useContext(TabContext);
  const { setNodes } = useReactFlow();

  // Get zoom level from React Flow store for crisp rendering
  const zoom = useStore((state) => state.transform[2]);

  // Track content height for dynamic resize
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(null);

  const {
    context,
    title,
    groupBy = [],
    filterBy = {},
    timeRange = '15m',
    width = 400,
    height = 300,
  } = data;

  // Calculate effective height (use content height if larger than default)
  const effectiveHeight = contentHeight && contentHeight > height ? contentHeight : height;

  // Calculate time range
  const getTimeRange = () => {
    const now = new Date();
    const before = now.toISOString();

    const timeMap = {
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '6h': 360,
      '24h': 1440,
      '7d': 10080,
    };

    const minutes = timeMap[timeRange] || 15;
    const after = new Date(now.getTime() - minutes * 60 * 1000).toISOString();

    return { after, before };
  };

  const { after, before } = getTimeRange();

  // Observe content height changes for dynamic resize
  useEffect(() => {
    if (!contentRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.target.scrollHeight;
        // Only update if height changed significantly (>10px) to avoid loops
        if (Math.abs(newHeight - (contentHeight || height)) > 10) {
          setContentHeight(newHeight);
        }
      }
    });

    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [contentHeight, height]);

  // Update React Flow node dimensions when content height changes
  useEffect(() => {
    if (contentHeight && contentHeight > height) {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                height: contentHeight,
              },
            };
          }
          return node;
        })
      );
    }
  }, [contentHeight, height, id, setNodes]);

  if (!context) {
    return (
      <div
        className={`${styles.chartNode} ${selected ? styles.selected : ''}`}
        style={{ width, height }}
      >
        <Handle type="target" position={Position.Left} className={styles.handle} />
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>📊</span>
          <span className={styles.placeholderText}>No context specified</span>
        </div>
        <Handle type="source" position={Position.Right} className={styles.handle} />
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      className={`${styles.chartNode} ${selected ? styles.selected : ''}`}
      style={{ width, height: effectiveHeight }}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} />

      {title && <div className={styles.nodeTitle}>{title}</div>}

      <div className={styles.chartContainer}>
        <ContextChart
          context={context}
          groupBy={groupBy}
          filterBy={filterBy}
          after={after}
          before={before}
          intervalCount={Math.floor(width / 10)}
          space={selectedSpace}
          room={selectedRoom}
          showRefreshIndicator={false}
          zoom={zoom}
        />
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
};

export default memo(ChartNode);
