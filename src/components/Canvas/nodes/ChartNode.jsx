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

import React, { memo, useContext } from 'react';
import { Handle, Position, useStore } from '@xyflow/react';
import TabContext from '../../../contexts/TabContext';
import ContextChart from '../../ChartsView/ContextChart';
import styles from './ChartNode.module.css';

const ChartNode = ({ id, data, selected }) => {
  const { selectedSpace, selectedRoom } = useContext(TabContext);

  // Get zoom level from React Flow store for crisp rendering
  const zoom = useStore((state) => state.transform[2]);

  const {
    context,
    title,
    groupBy = [],
    filterBy = {},
    timeRange = '15m',
    width = 400,
    height = 300,
  } = data;

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
      className={`${styles.chartNode} ${selected ? styles.selected : ''}`}
      style={{ width, minHeight: height }}
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
