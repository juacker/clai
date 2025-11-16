/**
 * Metrics Component with Single Hilbert Curve
 *
 * Uses a single Hilbert square that fills the viewport
 * Groups metrics if waste > 5%
 * CANVAS VERSION - High performance rendering
 * NO ZOOM - Static overview only
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import { getContexts, getData } from '../../api/client';
import NetdataSpinner from '../common/NetdataSpinner';
import styles from './Metrics.module.css';

// ============================================================================
// HILBERT CURVE ALGORITHM
// ============================================================================

function generateHilbertPoints(order) {
  console.time('generateHilbertPoints');
  const n = Math.pow(2, order);
  const points = [];

  function hilbertD2XY(n, d) {
    let x = 0, y = 0;
    let s = 1;

    while (s < n) {
      const rx = 1 & (d / 2);
      const ry = 1 & (d ^ rx);

      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        [x, y] = [y, x];
      }

      x += s * rx;
      y += s * ry;
      d = Math.floor(d / 4);
      s *= 2;
    }

    return [x, y];
  }

  const total = n * n;
  for (let i = 0; i < total; i++) {
    points.push(hilbertD2XY(n, i));
  }

  console.timeEnd('generateHilbertPoints');
  return points;
}

// ============================================================================
// METRIC GROUPING ALGORITHM
// ============================================================================

/**
 * Group metrics incrementally - only group enough to reach target
 * Groups siblings with the same prefix one at a time
 */
function groupMetricsIncremental(metrics, targetCount) {
  console.time('groupMetricsIncremental');
  console.log(`groupMetricsIncremental: input=${metrics.length}, target=${targetCount}`);

  if (metrics.length <= targetCount) {
    console.timeEnd('groupMetricsIncremental');
    return new Map(metrics.map(m => [m, [m]]));
  }

  // Build a map of potential group candidates (metrics that share prefix)
  const prefixMap = new Map(); // prefix -> [metrics]

  metrics.forEach(metric => {
    const parts = metric.split('.');
    if (parts.length >= 3) {
      const prefix = parts.slice(0, -1).join('.');
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      prefixMap.get(prefix).push(metric);
    }
  });

  // Sort by prefix to have consistent grouping
  const sortedPrefixes = Array.from(prefixMap.entries())
    .filter(([prefix, items]) => items.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${sortedPrefixes.length} groupable prefixes`);

  // Start with all metrics ungrouped
  const currentMetrics = new Set(metrics);
  const grouped = new Map();
  let reductionNeeded = metrics.length - targetCount;

  // Group incrementally until we reach target
  for (const [prefix, siblings] of sortedPrefixes) {
    if (reductionNeeded <= 0) break;

    const availableSiblings = siblings.filter(m => currentMetrics.has(m));

    if (availableSiblings.length >= 2) {
      grouped.set(prefix, availableSiblings);
      availableSiblings.forEach(m => currentMetrics.delete(m));
      currentMetrics.add(prefix);

      const reduction = availableSiblings.length - 1;
      reductionNeeded -= reduction;

      console.log(`Grouped ${availableSiblings.length} metrics into '${prefix}', reduction: ${reduction}, remaining needed: ${reductionNeeded}`);
    }
  }

  // Add remaining ungrouped metrics
  currentMetrics.forEach(m => {
    if (!grouped.has(m)) {
      grouped.set(m, [m]);
    }
  });

  console.log(`Final grouped count: ${grouped.size}`);
  console.timeEnd('groupMetricsIncremental');
  return grouped;
}

/**
 * Calculate optimal Hilbert configuration
 */
function calculateHilbertConfig(metrics) {
  console.time('calculateHilbertConfig');
  if (metrics.length === 0) {
    console.timeEnd('calculateHilbertConfig');
    return { order: 0, gridSize: 1, totalCells: 1, processedMetrics: [], groupedMetrics: new Map() };
  }

  let order = 0;
  while (Math.pow(2, order) * Math.pow(2, order) < metrics.length) {
    order++;
  }

  const gridSize = Math.pow(2, order);
  let totalCells = gridSize * gridSize;
  let waste = ((totalCells - metrics.length) / totalCells) * 100;

  console.log(`Initial: order=${order}, gridSize=${gridSize}, totalCells=${totalCells}, metrics=${metrics.length}, waste=${waste.toFixed(2)}%`);

  if (waste > 5 && order > 0) {
    const targetOrder = order - 1;
    const targetGridSize = Math.pow(2, targetOrder);
    const targetCells = targetGridSize * targetGridSize;

    console.log(`Waste > 5%, trying to fit into order=${targetOrder}, targetCells=${targetCells}`);

    const grouped = groupMetricsIncremental(metrics, targetCells);
    const currentMetrics = Array.from(grouped.keys()).sort();

    console.log(`After incremental grouping: ${currentMetrics.length} metrics (target was ${targetCells})`);

    const groupedMetrics = new Map();
    grouped.forEach((originals, groupName) => {
      groupedMetrics.set(groupName, originals);
    });

    if (currentMetrics.length <= targetCells) {
      console.log(`Fits in target dimension! Using order=${targetOrder}`);
      console.timeEnd('calculateHilbertConfig');
      return {
        order: targetOrder,
        gridSize: targetGridSize,
        totalCells: targetCells,
        processedMetrics: currentMetrics,
        groupedMetrics
      };
    }

    console.log('Could not fit in smaller dimension, using original');
  }

  console.timeEnd('calculateHilbertConfig');
  return {
    order,
    gridSize,
    totalCells,
    processedMetrics: metrics,
    groupedMetrics: new Map(metrics.map(m => [m, [m]]))
  };
}

// ============================================================================
// VISUAL GROUPING ALGORITHM
// ============================================================================

function createVisualGroups(metrics) {
  console.time('createVisualGroups');
  const groups = new Map();

  // Pre-calculate all prefix counts at all depths - do this ONCE
  const maxDepth = Math.max(...metrics.map(m => m.split('.').length));
  const prefixCounts = new Map(); // "depth:prefix" -> count

  metrics.forEach(metric => {
    const parts = metric.split('.');
    for (let depth = 1; depth <= parts.length; depth++) {
      const prefix = parts.slice(0, depth).join('.');
      const key = `${depth}:${prefix}`;
      prefixCounts.set(key, (prefixCounts.get(key) || 0) + 1);
    }
  });

  // Now assign each metric to a visual group using pre-calculated counts
  metrics.forEach(metric => {
    const parts = metric.split('.');
    let groupKey = parts[0];
    let depth = 1;

    while (depth < parts.length) {
      const currentPrefix = parts.slice(0, depth).join('.');
      const key = `${depth}:${currentPrefix}`;
      const count = prefixCounts.get(key) || 0;

      if (count <= 32) {
        groupKey = currentPrefix;
        break;
      }

      depth++;
      if (depth < parts.length) {
        groupKey = parts.slice(0, depth).join('.');
      }
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(metric);
  });

  console.log(`Created ${groups.size} visual groups`);
  console.timeEnd('createVisualGroups');
  return groups;
}

/**
 * Calculate group borders for canvas rendering
 */
function calculateGroupBorders(cells, visualGroups) {
  console.time('calculateGroupBorders');

  const metricToGroup = new Map();
  visualGroups.forEach((metrics, groupKey) => {
    metrics.forEach(metric => metricToGroup.set(metric, groupKey));
  });

  const gridMap = new Map();
  cells.forEach(cell => {
    const gridX = Math.round(cell.x / cell.width);
    const gridY = Math.round(cell.y / cell.height);
    gridMap.set(`${gridX},${gridY}`, cell);
    cell.gridX = gridX;
    cell.gridY = gridY;
  });

  const borders = [];

  cells.forEach(cell => {
    const myGroup = metricToGroup.get(cell.name);

    const top = gridMap.get(`${cell.gridX},${cell.gridY - 1}`);
    const right = gridMap.get(`${cell.gridX + 1},${cell.gridY}`);
    const bottom = gridMap.get(`${cell.gridX},${cell.gridY + 1}`);
    const left = gridMap.get(`${cell.gridX - 1},${cell.gridY}`);

    if (!top || metricToGroup.get(top.name) !== myGroup) {
      borders.push({ x1: cell.x, y1: cell.y, x2: cell.x + cell.width, y2: cell.y });
    }
    if (!right || metricToGroup.get(right.name) !== myGroup) {
      borders.push({ x1: cell.x + cell.width, y1: cell.y, x2: cell.x + cell.width, y2: cell.y + cell.height });
    }
    if (!bottom || metricToGroup.get(bottom.name) !== myGroup) {
      borders.push({ x1: cell.x, y1: cell.y + cell.height, x2: cell.x + cell.width, y2: cell.y + cell.height });
    }
    if (!left || metricToGroup.get(left.name) !== myGroup) {
      borders.push({ x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y + cell.height });
    }
  });

  console.timeEnd('calculateGroupBorders');
  console.log(`Created ${borders.length} border segments`);
  return borders;
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

/**
 * Get color for a cell based on anomaly rate
 * Uses theme colors for semantic indication:
 * - Success (green): No/low anomaly (< 10%)
 * - Info (teal): Moderate anomaly (10-50%)
 * - Warning (orange): High anomaly (50-100%)
 * - Error (red): Critical anomaly (> 100%)
 *
 * @param {number} anomalyRate - Anomaly rate percentage (0-100+)
 * @returns {string} CSS color from theme
 */
function getColorForAnomalyRate(anomalyRate) {
  // No data or low anomaly - Success (Netdata Green)
  if (anomalyRate === null || anomalyRate === undefined || anomalyRate < 10) {
    return '#E6F9EE'; // --color-success-lighter
  }
  // Moderate anomaly - Info (Netdata Teal)
  else if (anomalyRate >= 10 && anomalyRate < 50) {
    return '#E6F7FB'; // --color-info-lighter
  }
  // High anomaly - Warning (Orange)
  else if (anomalyRate >= 50 && anomalyRate < 100) {
    return '#FEF5E7'; // --color-warning-lighter
  }
  // Critical anomaly - Error (Red)
  else {
    return '#FCE8E6'; // --color-error-lighter
  }
}

// ============================================================================
// METRICS COMPONENT
// ============================================================================

const Metrics = ({ command }) => {
  const { selectedSpace, selectedRoom } = useTabContext();

  const [contexts, setContexts] = useState([]);
  const [anomalyRates, setAnomalyRates] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const sortedContexts = useMemo(() => {
    console.time('sortContexts');
    const sorted = [...contexts].sort((a, b) => a.name.localeCompare(b.name));
    console.timeEnd('sortContexts');
    return sorted;
  }, [contexts]);

  const hilbertConfig = useMemo(() => {
    console.time('hilbertConfig useMemo');
    const metricNames = sortedContexts.map(c => c.name);
    const config = calculateHilbertConfig(metricNames);
    console.timeEnd('hilbertConfig useMemo');
    return config;
  }, [sortedContexts]);

  const allCells = useMemo(() => {
    console.time('Generate cells');
    if (dimensions.width === 0 || dimensions.height === 0) return [];

    const { order, gridSize, processedMetrics, groupedMetrics } = hilbertConfig;
    const hilbertPoints = generateHilbertPoints(order);

    const cellWidth = dimensions.width / gridSize;
    const cellHeight = dimensions.height / gridSize;

    const cells = [];

    for (let i = 0; i < processedMetrics.length; i++) {
      const [hx, hy] = hilbertPoints[i];
      const metricName = processedMetrics[i];
      const originalMetrics = groupedMetrics.get(metricName) || [metricName];

      cells.push({
        name: metricName,
        originalMetrics,
        isGrouped: originalMetrics.length > 1,
        x: hx * cellWidth,
        y: hy * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
    }

    console.timeEnd('Generate cells');
    return cells;
  }, [dimensions, hilbertConfig]);

  const { groupBorders, visualGroups } = useMemo(() => {
    console.time('visualGroups and borders useMemo');
    if (allCells.length === 0) {
      console.timeEnd('visualGroups and borders useMemo');
      return { groupBorders: [], visualGroups: new Map() };
    }

    const { processedMetrics } = hilbertConfig;
    const visualGroups = createVisualGroups(processedMetrics);
    const groupBorders = calculateGroupBorders(allCells, visualGroups);

    console.timeEnd('visualGroups and borders useMemo');
    return { groupBorders, visualGroups };
  }, [allCells, hilbertConfig]);

  const groupLabels = useMemo(() => {
    console.time('groupLabels useMemo');
    if (allCells.length === 0 || visualGroups.size === 0) {
      console.timeEnd('groupLabels useMemo');
      return [];
    }

    const metricToCell = new Map();
    allCells.forEach(cell => {
      metricToCell.set(cell.name, cell);
    });

    const labels = [];
    visualGroups.forEach((metrics, groupKey) => {
      const cells = metrics.map(m => metricToCell.get(m)).filter(Boolean);

      if (cells.length === 0) return;

      const cx = cells.reduce((sum, c) => sum + c.x + c.width / 2, 0) / cells.length;
      const cy = cells.reduce((sum, c) => sum + c.y + c.height / 2, 0) / cells.length;

      labels.push({
        text: groupKey,
        x: cx,
        y: cy,
        count: cells.length
      });
    });

    console.timeEnd('groupLabels useMemo');
    return labels;
  }, [allCells, visualGroups]);

  // Canvas rendering effect
  useEffect(() => {
    console.time('Canvas render');
    const canvas = canvasRef.current;
    if (!canvas || allCells.length === 0) {
      console.timeEnd('Canvas render');
      return;
    }

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size with device pixel ratio for sharp rendering
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw cells with color based on anomaly rates
    const hoveredGroupMetrics = hoveredGroup ? visualGroups.get(hoveredGroup) : null;

    allCells.forEach(cell => {
      // Get anomaly rate for this cell
      // For grouped cells, calculate average anomaly rate
      let anomalyRate = null;

      if (cell.isGrouped) {
        // Calculate average anomaly rate for grouped metrics
        const rates = cell.originalMetrics
          .map(metric => anomalyRates.get(metric))
          .filter(rate => rate !== undefined && rate !== null);

        if (rates.length > 0) {
          anomalyRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
        }
      } else {
        // Single metric - get its anomaly rate
        anomalyRate = anomalyRates.get(cell.name);
      }

      // Apply color based on anomaly rate
      ctx.fillStyle = getColorForAnomalyRate(anomalyRate);
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    });

    // Draw group borders (always visible)
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    groupBorders.forEach(border => {
      ctx.moveTo(border.x1, border.y1);
      ctx.lineTo(border.x2, border.y2);
    });
    ctx.stroke();

    // Draw highlighted group border if hovering
    if (hoveredGroupMetrics) {
      ctx.strokeStyle = '#00AB44';
      ctx.lineWidth = 1.0;
      ctx.beginPath();

      // Create a map for quick lookup of cells by grid position
      const gridMap = new Map();
      allCells.forEach(cell => {
        const gridX = Math.round(cell.x / cell.width);
        const gridY = Math.round(cell.y / cell.height);
        gridMap.set(`${gridX},${gridY}`, cell);
      });

      // Draw border for each cell in the hovered group
      allCells.forEach(cell => {
        if (!hoveredGroupMetrics.includes(cell.name)) return;

        const gridX = Math.round(cell.x / cell.width);
        const gridY = Math.round(cell.y / cell.height);

        // Check each neighbor
        const top = gridMap.get(`${gridX},${gridY - 1}`);
        const right = gridMap.get(`${gridX + 1},${gridY}`);
        const bottom = gridMap.get(`${gridX},${gridY + 1}`);
        const left = gridMap.get(`${gridX - 1},${gridY}`);

        // Draw border if neighbor is not in the same group
        if (!top || !hoveredGroupMetrics.includes(top.name)) {
          ctx.moveTo(cell.x, cell.y);
          ctx.lineTo(cell.x + cell.width, cell.y);
        }
        if (!right || !hoveredGroupMetrics.includes(right.name)) {
          ctx.moveTo(cell.x + cell.width, cell.y);
          ctx.lineTo(cell.x + cell.width, cell.y + cell.height);
        }
        if (!bottom || !hoveredGroupMetrics.includes(bottom.name)) {
          ctx.moveTo(cell.x, cell.y + cell.height);
          ctx.lineTo(cell.x + cell.width, cell.y + cell.height);
        }
        if (!left || !hoveredGroupMetrics.includes(left.name)) {
          ctx.moveTo(cell.x, cell.y);
          ctx.lineTo(cell.x, cell.y + cell.height);
        }
      });

      ctx.stroke();
    }

    // Draw labels (group names)
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = 12;

    groupLabels.forEach(label => {
      // Make text bold if this group is hovered
      const isBold = hoveredGroup === label.text;
      ctx.font = `${isBold ? '700' : '500'} ${fontSize}px sans-serif`;
      ctx.fillText(label.text, label.x, label.y);
    });

    console.timeEnd('Canvas render');
  }, [allCells, groupBorders, groupLabels, dimensions, visualGroups, hoveredGroup]);

  // Handle mouse move - update hover state for group
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cell = allCells.find(c =>
      x >= c.x && x <= c.x + c.width &&
      y >= c.y && y <= c.y + c.height
    );

    if (cell) {
      const groupKey = getGroupForCell(cell);
      setHoveredGroup(groupKey);
      canvas.style.cursor = 'pointer';
    } else {
      setHoveredGroup(null);
      canvas.style.cursor = 'default';
    }
  };

  const handleMouseLeave = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
    setHoveredGroup(null);
  };

  // Get group for a cell
  const getGroupForCell = (cell) => {
    for (const [groupKey, metrics] of visualGroups.entries()) {
      if (metrics.includes(cell.name)) {
        return groupKey;
      }
    }
    return null;
  };

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current || contexts.length === 0) return;

    const updateDimensions = () => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    const timer = setTimeout(updateDimensions, 100);

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [contexts]);

  // Fetch contexts and anomaly data
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedSpace || !selectedRoom) {
        setError('Please select a space and room');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('netdata_token');
        if (!token) {
          setError('Authentication token not found');
          setLoading(false);
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        const fifteenMinutesAgo = now - (15 * 60);

        // Fetch contexts and anomaly data in parallel
        const [contextsResponse, anomalyResponse] = await Promise.all([
          getContexts(token, selectedSpace.id, selectedRoom.id, {
            window: {
              after: fifteenMinutesAgo,
              before: now,
            },
          }),
          getData(token, selectedSpace.id, selectedRoom.id, {
            scope: {
              contexts: ['anomaly_detection.context_anomaly_rate'],
              nodes: [],
            },
            aggregations: {
              metrics: [
                {
                  group_by: ['dimension'],
                  aggregation: 'sum',
                },
              ],
              time: {
                time_group: 'average',
                time_resampling: 0,
              },
            },
            window: {
              after: fifteenMinutesAgo,
              before: now,
              points: 2,
            },
          }).catch(err => {
            console.warn('Failed to fetch anomaly data:', err);
            return null;
          }),
        ]);

        // Process contexts
        if (contextsResponse && contextsResponse.contexts) {
          const contextList = Object.entries(contextsResponse.contexts).map(([name, data]) => ({
            name,
            ...data,
          }));
          setContexts(contextList);
        } else {
          setContexts([]);
        }

        // Process anomaly rates
        if (anomalyResponse && anomalyResponse.result) {
          const { labels, data } = anomalyResponse.result;
          const rates = new Map();

          if (data && data.length > 0 && labels && labels.length > 0) {
            const firstRow = data[0];

            // Skip the first label (time) and process the rest
            for (let i = 1; i < labels.length; i++) {
              const contextName = labels[i];
              const valueArray = firstRow[i];

              // Extract the first value from the array [value, arp, pa]
              if (Array.isArray(valueArray) && valueArray.length > 0) {
                const anomalyRate = valueArray[0];
                rates.set(contextName, anomalyRate);
              }
            }
          }

          console.log(`Loaded anomaly rates for ${rates.size} contexts`);
          setAnomalyRates(rates);
        } else {
          setAnomalyRates(new Map());
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedSpace, selectedRoom]);

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

  if (error) {
    return (
      <div className={styles.metricsContainer}>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (contexts.length === 0) {
    return (
      <div className={styles.metricsContainer}>
        <div className={styles.emptyContainer}>
          <p className={styles.emptyText}>No metrics found for this space/room</p>
        </div>
      </div>
    );
  }

  const { order, gridSize, totalCells, processedMetrics, groupedMetrics } = hilbertConfig;
  const waste = ((totalCells - processedMetrics.length) / totalCells) * 100;
  const totalGrouped = Array.from(groupedMetrics.values()).reduce((sum, arr) => sum + arr.length, 0);

  console.log('Final render stats:', {
    order,
    gridSize,
    totalCells,
    processedMetrics: processedMetrics.length,
    waste: waste.toFixed(1) + '%',
    totalGrouped,
    cellsRendered: allCells.length,
    borderSegments: groupBorders.length
  });

  return (
    <div className={styles.metricsContainer} ref={containerRef}>
      {/* Info banner */}
      <div className={`${styles.infoBanner} ${waste <= 5 ? styles.infoBannerSuccess : styles.infoBannerInfo}`}>
        Order: {order} • Grid: {gridSize}×{gridSize} •
        Cells: {processedMetrics.length}/{totalCells} •
        Waste: {waste.toFixed(1)}% •
        Original: {totalGrouped} metrics
      </div>

      {dimensions.width > 0 && dimensions.height > 0 && (
        <canvas
          ref={canvasRef}
          className={styles.metricsCanvas}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </div>
  );
};

export default Metrics;
