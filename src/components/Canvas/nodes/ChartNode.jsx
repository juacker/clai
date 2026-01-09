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

import React, { memo, useContext, useRef, useEffect } from 'react';
import { Handle, Position, useStore, NodeResizer, useReactFlow } from '@xyflow/react';
import TabContext from '../../../contexts/TabContext';
import ContextChart from '../../ChartsView/ContextChart';
import styles from './ChartNode.module.css';

const ChartNode = ({ id, data, selected }) => {
  const { selectedSpace, selectedRoom } = useContext(TabContext);
  const { setNodes } = useReactFlow();
  const contentRef = useRef(null);

  // Get zoom level from React Flow store for crisp rendering
  const zoom = useStore((state) => state.transform[2]);

  // Track content size and update node dimensions when it changes
  useEffect(() => {
    if (!contentRef.current) return;

    const updateNodeSize = () => {
      const element = contentRef.current;
      if (!element) return;

      // Use scrollHeight/scrollWidth to get full content size including overflow
      const width = element.scrollWidth;
      const height = element.scrollHeight;

      if (width > 0 && height > 0) {
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id === id) {
              const currentWidth = node.style?.width || 0;
              const currentHeight = node.style?.height || 0;
              // Only update if size actually changed significantly
              if (Math.abs(currentHeight - height) > 5 || Math.abs(currentWidth - width) > 5) {
                // Use content size but respect minimum dimensions from NodeResizer
                const minWidth = 300;
                const minHeight = 250;
                return {
                  ...node,
                  style: {
                    ...node.style,
                    width: Math.max(minWidth, width),
                    height: Math.max(minHeight, height),
                  },
                };
              }
            }
            return node;
          })
        );
      }
    };

    // Debounced update to ensure we measure after layout
    const debouncedUpdate = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateNodeSize);
      });
    };

    // ResizeObserver for direct size changes
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(contentRef.current);

    // MutationObserver for DOM changes (filter panel expand/collapse)
    const mutationObserver = new MutationObserver(debouncedUpdate);
    mutationObserver.observe(contentRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [id, setNodes]);

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
      <div className={`${styles.chartNode} ${selected ? styles.selected : ''}`}>
        <NodeResizer
          minWidth={300}
          minHeight={200}
          isVisible={selected}
          lineClassName={styles.resizerLine}
          handleClassName={styles.resizerHandle}
        />
        <Handle type="target" position={Position.Left} className={styles.handle} />
        <div ref={contentRef} className={styles.contentInner}>
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}>📊</span>
            <span className={styles.placeholderText}>No context specified</span>
          </div>
        </div>
        <Handle type="source" position={Position.Right} className={styles.handle} />
      </div>
    );
  }

  return (
    <div className={`${styles.chartNode} ${selected ? styles.selected : ''}`}>
      <NodeResizer
        minWidth={300}
        minHeight={250}
        isVisible={selected}
        lineClassName={styles.resizerLine}
        handleClassName={styles.resizerHandle}
      />
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div ref={contentRef} className={styles.contentInner}>
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
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
};

export default memo(ChartNode);
