/**
 * Metrics Component
 *
 * Displays metrics overview for the current space and room context
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import { getContexts } from '../../api/client';
import NetdataSpinner from '../common/NetdataSpinner';
import styles from './Metrics.module.css';

const Metrics = ({ command }) => {
  // Access space and room from tab context
  const { selectedSpace, selectedRoom } = useTabContext();

  // State management
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [gridDimensions, setGridDimensions] = useState({ cols: 0, rows: 0, cellSize: 0 });

  const containerRef = useRef(null);

  // Calculate optimal grid layout based on container size and number of metrics
  const calculateGridLayout = useCallback((containerWidth, containerHeight, itemCount) => {
    if (itemCount === 0) return { cols: 0, rows: 0, cellSize: 0 };

    // Calculate aspect ratio of the container
    const aspectRatio = containerWidth / containerHeight;

    // Try different column counts to find the best fit
    let bestLayout = { cols: 1, rows: itemCount, cellSize: 0 };
    let maxCellSize = 0;

    for (let cols = 1; cols <= itemCount; cols++) {
      const rows = Math.ceil(itemCount / cols);

      // Calculate cell size based on available space with gap
      const gap = 4; // Small margin between cells
      const cellWidth = (containerWidth - (cols - 1) * gap) / cols;
      const cellHeight = (containerHeight - (rows - 1) * gap) / rows;

      // Use the smaller dimension to keep cells square
      const cellSize = Math.min(cellWidth, cellHeight);

      // Keep track of the layout that gives the largest cell size
      if (cellSize > maxCellSize) {
        maxCellSize = cellSize;
        bestLayout = { cols, rows, cellSize };
      }
    }

    return bestLayout;
  }, []);

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current || contexts.length === 0) return;

    const updateLayout = () => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      const layout = calculateGridLayout(width, height, contexts.length);
      setGridDimensions(layout);
    };

    // Initial calculation
    updateLayout();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [contexts.length, calculateGridLayout]);

  // Fetch contexts when component mounts or context changes
  useEffect(() => {
    const fetchContexts = async () => {
      if (!selectedSpace || !selectedRoom) {
        setError('Please select a space and room');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Get authentication token
        const token = localStorage.getItem('netdata_token');
        if (!token) {
          setError('Authentication token not found');
          setLoading(false);
          return;
        }

        // Calculate time window (last 15 minutes by default)
        const now = Math.floor(Date.now() / 1000);
        const fifteenMinutesAgo = now - (15 * 60);

        // Fetch contexts from API
        const response = await getContexts(token, selectedSpace.id, selectedRoom.id, {
          window: {
            after: fifteenMinutesAgo,
            before: now,
          },
        });

        // Extract contexts from response
        if (response && response.contexts) {
          const contextList = Object.entries(response.contexts).map(([name, data]) => ({
            name,
            ...data,
          }));
          setContexts(contextList);
        } else {
          setContexts([]);
        }
      } catch (err) {
        console.error('Error fetching contexts:', err);
        setError(err.message || 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchContexts();
  }, [selectedSpace, selectedRoom]);

  // Render loading state
  if (loading) {
    return (
      <div className={styles.metricsContainer}>
        <div className={styles.loadingContainer}>
          <NetdataSpinner />
          <p className={styles.loadingText}>Loading metrics...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className={styles.metricsContainer}>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  // Render empty state
  if (contexts.length === 0) {
    return (
      <div className={styles.metricsContainer}>
        <div className={styles.emptyContainer}>
          <p className={styles.emptyText}>No metrics found for this space/room</p>
        </div>
      </div>
    );
  }

  // Render metrics mosaic as chess board
  return (
    <div className={styles.metricsContainer} ref={containerRef}>
      <div
        className={styles.metricsGrid}
        style={{
          gridTemplateColumns: `repeat(${gridDimensions.cols}, ${gridDimensions.cellSize}px)`,
          gridTemplateRows: `repeat(${gridDimensions.rows}, ${gridDimensions.cellSize}px)`,
        }}
      >
        {contexts.map((context) => (
          <div
            key={context.name}
            className={styles.metricCell}
            title={context.name}
          />
        ))}
      </div>
    </div>
  );
};

export default Metrics;

