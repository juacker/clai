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
import ChartsView from '../ChartsView/ChartsView';
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
 * Group metrics using multi-level deterministic grouping
 *
 * Determinism guarantees:
 * - Metrics are always sorted alphabetically before processing
 * - Prefixes are grouped starting from deepest level first
 * - At each level, prefixes are processed alphabetically
 * - Same input metrics always produce same output grouping
 *
 * @param {string[]} metrics - Array of metric names
 * @param {number} targetCount - Target number of groups to achieve
 * @returns {Map} Map of groupName -> [originalMetrics]
 */
function groupMetricsMultiLevel(metrics, targetCount) {
  console.time('groupMetricsMultiLevel');
  console.log(`groupMetricsMultiLevel: input=${metrics.length}, target=${targetCount}`);

  if (metrics.length <= targetCount) {
    console.timeEnd('groupMetricsMultiLevel');
    // Sort for determinism
    const sorted = [...metrics].sort();
    return new Map(sorted.map(m => [m, [m]]));
  }

  // Sort metrics alphabetically for determinism
  const sortedMetrics = [...metrics].sort();

  // Current state: map of displayName -> [originalMetrics]
  let currentGroups = new Map(sortedMetrics.map(m => [m, [m]]));

  // Find max depth in metrics
  const maxDepth = Math.max(...sortedMetrics.map(m => m.split('.').length));

  // Group level by level, starting from deepest (most specific)
  // This ensures we group "system.cpu.idle" + "system.cpu.user" -> "system.cpu"
  // before we'd ever group "system.cpu" + "system.memory" -> "system"
  for (let depth = maxDepth - 1; depth >= 1; depth--) {
    if (currentGroups.size <= targetCount) {
      console.log(`Reached target at depth ${depth}, stopping`);
      break;
    }

    console.log(`Grouping at depth ${depth}, current groups: ${currentGroups.size}`);

    // Build prefix map for current depth
    const prefixMap = new Map(); // prefix -> [currentGroupNames]

    for (const [groupName] of currentGroups) {
      const parts = groupName.split('.');
      if (parts.length > depth) {
        const prefix = parts.slice(0, depth).join('.');
        if (!prefixMap.has(prefix)) {
          prefixMap.set(prefix, []);
        }
        prefixMap.get(prefix).push(groupName);
      }
    }

    // Sort prefixes alphabetically for determinism
    const sortedPrefixes = Array.from(prefixMap.entries())
      .filter(([, items]) => items.length >= 2) // Only group if 2+ items share prefix
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (sortedPrefixes.length === 0) {
      console.log(`No groupable prefixes at depth ${depth}`);
      continue;
    }

    // Calculate how many groups we can reduce by
    let reductionNeeded = currentGroups.size - targetCount;

    // Group prefixes until we reach target or run out
    for (const [prefix, groupNames] of sortedPrefixes) {
      if (reductionNeeded <= 0) break;

      // Merge all groups under this prefix
      const mergedOriginals = [];
      for (const name of groupNames) {
        const originals = currentGroups.get(name);
        if (originals) {
          mergedOriginals.push(...originals);
          currentGroups.delete(name);
        }
      }

      // Sort merged originals for determinism
      mergedOriginals.sort();
      currentGroups.set(prefix, mergedOriginals);

      const reduction = groupNames.length - 1;
      reductionNeeded -= reduction;

      console.log(`Grouped ${groupNames.length} items into '${prefix}', reduction: ${reduction}`);
    }
  }

  console.log(`Final grouped count: ${currentGroups.size}`);
  console.timeEnd('groupMetricsMultiLevel');
  return currentGroups;
}

/**
 * Calculate proportional cell allocation for groups
 *
 * Distributes grid cells proportionally based on each group's weight (original metric count).
 * Uses largest remainder method to ensure exact cell count.
 *
 * @param {Map} groupedMetrics - Map of groupName -> [originalMetrics]
 * @param {number} totalCells - Total cells available in grid
 * @returns {Map} Map of groupName -> cellCount
 */
function calculateProportionalCells(groupedMetrics, totalCells) {
  const totalOriginals = Array.from(groupedMetrics.values())
    .reduce((sum, arr) => sum + arr.length, 0);

  // Calculate initial allocation and remainders
  const allocations = [];
  let allocatedCells = 0;

  for (const [name, originals] of groupedMetrics) {
    const exactShare = (originals.length / totalOriginals) * totalCells;
    const floorShare = Math.floor(exactShare);
    const remainder = exactShare - floorShare;

    allocations.push({ name, cells: floorShare, remainder, originals: originals.length });
    allocatedCells += floorShare;
  }

  // Distribute remaining cells using largest remainder method
  const remainingCells = totalCells - allocatedCells;
  allocations.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remainingCells && i < allocations.length; i++) {
    allocations[i].cells++;
  }

  // Ensure every group gets at least 1 cell
  for (const alloc of allocations) {
    if (alloc.cells === 0) {
      alloc.cells = 1;
    }
  }

  // Sort back to alphabetical order for determinism
  allocations.sort((a, b) => a.name.localeCompare(b.name));

  return new Map(allocations.map(a => [a.name, a.cells]));
}

/**
 * Calculate optimal Hilbert configuration with proportional cell allocation
 *
 * Strategy:
 * 1. Find the smallest order where grid >= metrics (no grouping needed)
 * 2. If waste > threshold, try progressively smaller orders with grouping
 * 3. Allocate cells proportionally based on group sizes
 *
 * Waste threshold: 20% - allows some empty space but avoids half-empty grids
 */
function calculateHilbertConfig(metrics) {
  console.time('calculateHilbertConfig');

  if (metrics.length === 0) {
    console.timeEnd('calculateHilbertConfig');
    return {
      order: 0,
      gridSize: 1,
      totalCells: 1,
      processedMetrics: [],
      groupedMetrics: new Map(),
      cellAllocations: new Map()
    };
  }

  // Sort metrics alphabetically for determinism
  const sortedMetrics = [...metrics].sort();

  // Find smallest order that fits all metrics without grouping
  let maxOrder = 0;
  while (Math.pow(2, maxOrder) * Math.pow(2, maxOrder) < sortedMetrics.length) {
    maxOrder++;
  }

  const maxGridSize = Math.pow(2, maxOrder);
  const maxTotalCells = maxGridSize * maxGridSize;
  const initialWaste = ((maxTotalCells - sortedMetrics.length) / maxTotalCells) * 100;

  console.log(`Initial: order=${maxOrder}, grid=${maxGridSize}x${maxGridSize}, cells=${maxTotalCells}, metrics=${sortedMetrics.length}, waste=${initialWaste.toFixed(1)}%`);

  // If waste is acceptable (< 20%), use individual metrics (1 cell each)
  const WASTE_THRESHOLD = 20;
  if (initialWaste <= WASTE_THRESHOLD) {
    console.log(`Waste ${initialWaste.toFixed(1)}% <= ${WASTE_THRESHOLD}%, using individual metrics`);
    const groupedMetrics = new Map(sortedMetrics.map(m => [m, [m]]));
    const cellAllocations = new Map(sortedMetrics.map(m => [m, 1]));
    console.timeEnd('calculateHilbertConfig');
    return {
      order: maxOrder,
      gridSize: maxGridSize,
      totalCells: maxTotalCells,
      processedMetrics: sortedMetrics,
      groupedMetrics,
      cellAllocations
    };
  }

  // Try progressively smaller orders with grouping
  let bestConfig = null;
  let bestWaste = initialWaste;

  // Minimum order to try (order 3 = 8x8 = 64 cells minimum)
  const minOrder = 3;

  for (let tryOrder = maxOrder - 1; tryOrder >= minOrder; tryOrder--) {
    const tryGridSize = Math.pow(2, tryOrder);
    const tryCells = tryGridSize * tryGridSize;

    console.log(`Trying order=${tryOrder}, grid=${tryGridSize}x${tryGridSize}, cells=${tryCells}`);

    // Try to group metrics to fit this grid
    const grouped = groupMetricsMultiLevel(sortedMetrics, tryCells);
    const groupedCount = grouped.size;

    if (groupedCount <= tryCells) {
      // Calculate proportional cell allocation
      const cellAllocations = calculateProportionalCells(grouped, tryCells);
      const allocatedCells = Array.from(cellAllocations.values()).reduce((a, b) => a + b, 0);
      const waste = ((tryCells - allocatedCells) / tryCells) * 100;

      console.log(`Order ${tryOrder}: ${groupedCount} groups, ${allocatedCells} cells allocated, waste=${waste.toFixed(1)}%`);

      if (waste < bestWaste) {
        bestWaste = waste;
        bestConfig = {
          order: tryOrder,
          gridSize: tryGridSize,
          totalCells: tryCells,
          processedMetrics: Array.from(grouped.keys()).sort(),
          groupedMetrics: grouped,
          cellAllocations
        };
        console.log(`New best config: order=${tryOrder}, waste=${waste.toFixed(1)}%`);
      }

      if (waste <= 5) {
        console.log(`Achieved ${waste.toFixed(1)}% waste, stopping search`);
        break;
      }
    } else {
      console.log(`Order ${tryOrder}: could not fit (${groupedCount} > ${tryCells}), stopping`);
      break;
    }
  }

  if (bestConfig) {
    console.log(`Selected: order=${bestConfig.order}, waste=${bestWaste.toFixed(1)}%`);
    console.timeEnd('calculateHilbertConfig');
    return bestConfig;
  }

  // Fallback to original (no grouping)
  console.log('No better configuration found, using original');
  const groupedMetrics = new Map(sortedMetrics.map(m => [m, [m]]));
  const cellAllocations = new Map(sortedMetrics.map(m => [m, 1]));
  console.timeEnd('calculateHilbertConfig');
  return {
    order: maxOrder,
    gridSize: maxGridSize,
    totalCells: maxTotalCells,
    processedMetrics: sortedMetrics,
    groupedMetrics,
    cellAllocations
  };
}

// ============================================================================
// VISUAL GROUPING ALGORITHM
// ============================================================================

/**
 * Create visual groups from grouped metrics
 *
 * Groups metrics by their common prefix at a reasonable depth.
 * Uses adaptive depth based on cell count - larger groups get subdivided more.
 *
 * @param {Map} groupedMetrics - Map of displayName -> [originalMetrics]
 * @param {Map} cellAllocations - Map of displayName -> cellCount
 * @returns {Map} Map of visualGroupKey -> [displayNames]
 */
function createVisualGroups(groupedMetrics, cellAllocations) {
  console.time('createVisualGroups');
  const groups = new Map();

  // Target: visual groups should have roughly 8-24 cells for good visual clarity
  const TARGET_MIN_CELLS = 8;
  const TARGET_MAX_CELLS = 24;

  // Get all display names sorted for determinism
  const displayNames = Array.from(groupedMetrics.keys()).sort();

  // Build prefix tree to find natural groupings
  const prefixCells = new Map(); // "depth:prefix" -> total cells

  for (const name of displayNames) {
    const cells = cellAllocations.get(name) || 1;
    const parts = name.split('.');

    for (let depth = 1; depth <= parts.length; depth++) {
      const prefix = parts.slice(0, depth).join('.');
      const key = `${depth}:${prefix}`;
      prefixCells.set(key, (prefixCells.get(key) || 0) + cells);
    }
  }

  // For each metric, find the best visual group
  for (const name of displayNames) {
    const parts = name.split('.');
    let bestGroup = parts[0]; // Default to top-level
    let bestDepth = 1;

    // Find the deepest prefix that stays within target range
    // or the shallowest prefix that's not too large
    for (let depth = 1; depth <= parts.length; depth++) {
      const prefix = parts.slice(0, depth).join('.');
      const key = `${depth}:${prefix}`;
      const cellCount = prefixCells.get(key) || 0;

      if (cellCount >= TARGET_MIN_CELLS && cellCount <= TARGET_MAX_CELLS) {
        // Perfect size - use this
        bestGroup = prefix;
        bestDepth = depth;
        break;
      } else if (cellCount < TARGET_MIN_CELLS) {
        // Too small - use parent (previous depth) if it exists
        if (depth > 1) {
          bestGroup = parts.slice(0, depth - 1).join('.');
        } else {
          bestGroup = prefix;
        }
        break;
      } else if (cellCount > TARGET_MAX_CELLS && depth < parts.length) {
        // Too large - go deeper
        continue;
      } else {
        // At max depth or no better option
        bestGroup = prefix;
      }
    }

    if (!groups.has(bestGroup)) {
      groups.set(bestGroup, []);
    }
    groups.get(bestGroup).push(name);
  }

  console.log(`Created ${groups.size} visual groups from ${displayNames.length} metrics`);
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

/**
 * Get severity level for sorting (higher = more critical)
 * - 4: Critical (>= 100%)
 * - 3: High (50-100%)
 * - 2: Moderate (10-50%)
 * - 1: Low (< 10%)
 * - 0: No data
 *
 * @param {number} anomalyRate - Anomaly rate percentage (0-100+)
 * @returns {number} Severity level for sorting
 */
function getSeverityLevel(anomalyRate) {
  if (anomalyRate === null || anomalyRate === undefined) {
    return 0; // No data - lowest priority
  } else if (anomalyRate >= 100) {
    return 4; // Critical
  } else if (anomalyRate >= 50) {
    return 3; // High
  } else if (anomalyRate >= 10) {
    return 2; // Moderate
  } else {
    return 1; // Low
  }
}

// ============================================================================
// METRICS COMPONENT
// ============================================================================

const Metrics = ({ command }) => {
  const { selectedSpace, selectedRoom } = useTabContext();

  // DEBUG: Track mounts and unmounts
  useEffect(() => {
    console.log('🔵 Metrics MOUNTED');
    return () => console.log('🔴 Metrics UNMOUNTED');
  }, []);

  // DEBUG: Track re-renders
  useEffect(() => {
    console.log('🔄 Metrics RE-RENDERED', { selectedSpace, selectedRoom, command });
  });

  const [contexts, setContexts] = useState([]);
  const [anomalyRates, setAnomalyRates] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [debouncedFilterText, setDebouncedFilterText] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState(new Set());
  const [viewMode, setViewMode] = useState('canvas'); // 'canvas' or 'charts'

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const filterTimeoutRef = useRef(null);
  const filterInputRef = useRef(null);

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

    const { order, gridSize, processedMetrics, groupedMetrics, cellAllocations } = hilbertConfig;
    const hilbertPoints = generateHilbertPoints(order);

    const cellWidth = dimensions.width / gridSize;
    const cellHeight = dimensions.height / gridSize;

    const cells = [];
    let hilbertIndex = 0;

    // For each processed metric, allocate its proportional number of cells
    for (const metricName of processedMetrics) {
      const originalMetrics = groupedMetrics.get(metricName) || [metricName];
      const cellCount = cellAllocations.get(metricName) || 1;

      // Create multiple cells for this metric based on its allocation
      for (let c = 0; c < cellCount && hilbertIndex < hilbertPoints.length; c++) {
        const [hx, hy] = hilbertPoints[hilbertIndex];

        cells.push({
          name: metricName,
          originalMetrics,
          isGrouped: originalMetrics.length > 1,
          x: hx * cellWidth,
          y: hy * cellHeight,
          width: cellWidth,
          height: cellHeight,
        });

        hilbertIndex++;
      }
    }

    console.log(`Generated ${cells.length} cells for ${processedMetrics.length} metrics`);
    console.timeEnd('Generate cells');
    return cells;
  }, [dimensions, hilbertConfig]);

  const { groupBorders, visualGroups } = useMemo(() => {
    console.time('visualGroups and borders useMemo');
    if (allCells.length === 0) {
      console.timeEnd('visualGroups and borders useMemo');
      return { groupBorders: [], visualGroups: new Map() };
    }

    const { groupedMetrics, cellAllocations } = hilbertConfig;
    const visualGroups = createVisualGroups(groupedMetrics, cellAllocations);
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

    // Build map of metric name -> ALL cells (since each metric can have multiple cells)
    const metricToCells = new Map();
    allCells.forEach(cell => {
      if (!metricToCells.has(cell.name)) {
        metricToCells.set(cell.name, []);
      }
      metricToCells.get(cell.name).push(cell);
    });

    const labels = [];
    visualGroups.forEach((metrics, groupKey) => {
      // Collect ALL cells for all metrics in this visual group
      const groupCells = [];
      for (const metric of metrics) {
        const cells = metricToCells.get(metric);
        if (cells) {
          groupCells.push(...cells);
        }
      }

      if (groupCells.length === 0) return;

      // Calculate bounding box center (more stable than centroid for irregular shapes)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const cell of groupCells) {
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x + cell.width);
        maxY = Math.max(maxY, cell.y + cell.height);
      }

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      labels.push({
        text: groupKey,
        x: cx,
        y: cy,
        count: groupCells.length
      });
    });

    console.timeEnd('groupLabels useMemo');
    return labels;
  }, [allCells, visualGroups]);

  // Filter contexts based on debounced filter text
  // Searches through original metrics (expanding grouped ones)
  const filteredContexts = useMemo(() => {
    if (!debouncedFilterText.trim()) {
      return null; // No filter applied
    }

    console.time('Filter contexts');
    const lowerFilter = debouncedFilterText.toLowerCase();
    const matchingContexts = [];
    const { groupedMetrics } = hilbertConfig;

    // Search through all visual groups, expanding grouped metrics
    visualGroups.forEach((processedMetrics) => {
      processedMetrics.forEach(metric => {
        // Get original metrics (expand if grouped)
        const originals = groupedMetrics.get(metric);
        const metricsToSearch = (originals && originals.length > 0) ? originals : [metric];

        metricsToSearch.forEach(original => {
          if (original.toLowerCase().includes(lowerFilter)) {
            matchingContexts.push(original);
          }
        });
      });
    });

    // Sort by severity (most critical first) then alphabetically
    matchingContexts.sort((a, b) => {
      const severityA = getSeverityLevel(anomalyRates.get(a));
      const severityB = getSeverityLevel(anomalyRates.get(b));

      if (severityB !== severityA) {
        return severityB - severityA;
      }

      return a.localeCompare(b);
    });

    console.timeEnd('Filter contexts');
    console.log(`Filtered ${matchingContexts.length} contexts from ${debouncedFilterText}`);
    return matchingContexts;
  }, [debouncedFilterText, visualGroups, anomalyRates, hilbertConfig]);

  // Sort metrics for selected group by severity then alphabetically
  // Expands grouped metrics to show original individual metrics
  const sortedGroupMetrics = useMemo(() => {
    if (!selectedGroup || selectedGroup === 'filter-results') {
      return null;
    }

    const processedMetrics = visualGroups.get(selectedGroup);
    if (!processedMetrics) {
      return null;
    }

    console.time('Sort group metrics');

    // Expand grouped metrics to get original individual metrics
    const { groupedMetrics } = hilbertConfig;
    const expandedMetrics = [];

    for (const metric of processedMetrics) {
      const originals = groupedMetrics.get(metric);
      if (originals && originals.length > 0) {
        // This metric was grouped - add all originals
        expandedMetrics.push(...originals);
      } else {
        // Not grouped - add as-is
        expandedMetrics.push(metric);
      }
    }

    // Sort by severity then alphabetically
    const sorted = expandedMetrics.sort((a, b) => {
      const severityA = getSeverityLevel(anomalyRates.get(a));
      const severityB = getSeverityLevel(anomalyRates.get(b));

      if (severityB !== severityA) {
        return severityB - severityA;
      }

      return a.localeCompare(b);
    });

    console.timeEnd('Sort group metrics');
    console.log(`Sorted ${sorted.length} metrics (expanded from ${processedMetrics.length}) for group '${selectedGroup}'`);
    return sorted;
  }, [selectedGroup, visualGroups, anomalyRates, hilbertConfig]);

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
  }, [allCells, groupBorders, groupLabels, dimensions, visualGroups, hoveredGroup, anomalyRates]);

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

  // Handle click - select group and show context list
  const handleCanvasClick = (e) => {
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
      setSelectedGroup(groupKey);
    }
  };

  // Handle click on backdrop to close panel
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      setSelectedGroup(null);
    }
  };

  // Handle filter input change
  const handleFilterChange = (e) => {
    const value = e.target.value;
    setFilterText(value);

    // Clear existing timeout
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    // Debounce the filter - wait 500ms after user stops typing
    filterTimeoutRef.current = setTimeout(() => {
      // Only search if input has 3 or more characters
      if (value.trim().length >= 3) {
        setDebouncedFilterText(value);
        setSelectedGroup('filter-results');
      } else {
        // Clear search if less than 3 characters
        setDebouncedFilterText('');
        setSelectedGroup(null);
      }
    }, 500);
  };

  // Clear filter
  const handleClearFilter = () => {
    setFilterText('');
    setDebouncedFilterText('');
    setSelectedGroup(null);
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
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

  // Cleanup filter timeout on unmount
  useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard shortcuts (Escape and Ctrl/Cmd+F)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape key: close panel and clear filter
      if (e.key === 'Escape' && selectedGroup) {
        setSelectedGroup(null);
        setFilterText('');
        setDebouncedFilterText('');
        if (filterTimeoutRef.current) {
          clearTimeout(filterTimeoutRef.current);
        }
      }

      // Ctrl+F (Windows/Linux) or Cmd+F (Mac): focus filter input
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewMode === 'canvas') {
        e.preventDefault(); // Prevent browser's default find
        if (filterInputRef.current) {
          filterInputRef.current.focus();
          filterInputRef.current.select(); // Select existing text for easy replacement
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedGroup, viewMode]);

  // Toggle metric selection
  const toggleMetric = (context) => {
    setSelectedMetrics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(context)) {
        newSet.delete(context);
      } else {
        newSet.add(context);
      }
      return newSet;
    });
  };

  // Remove metric from selection
  const removeMetric = (context) => {
    setSelectedMetrics(prev => {
      const newSet = new Set(prev);
      newSet.delete(context);
      return newSet;
    });
  };

  // Switch to charts view
  const switchToChartsView = () => {
    setViewMode('charts');
    setSelectedGroup(null);
  };

  // Switch to canvas view
  const switchToCanvasView = () => {
    setViewMode('canvas');
  };

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
  const cellsUsed = allCells.length;
  const waste = ((totalCells - cellsUsed) / totalCells) * 100;
  const totalOriginalMetrics = Array.from(groupedMetrics.values()).reduce((sum, arr) => sum + arr.length, 0);

  console.log('Final render stats:', {
    order,
    gridSize,
    totalCells,
    groups: processedMetrics.length,
    cellsUsed,
    waste: waste.toFixed(1) + '%',
    totalOriginalMetrics,
    borderSegments: groupBorders.length
  });

  return (
    <div className={styles.metricsContainer} ref={containerRef}>
      {/* Header toolbar */}
      <div className={styles.headerBar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleButton} ${viewMode === 'canvas' ? styles.active : ''}`}
              onClick={switchToCanvasView}
            >
              Canvas
            </button>
            <button
              className={`${styles.viewToggleButton} ${viewMode === 'charts' ? styles.active : ''}`}
              onClick={switchToChartsView}
              disabled={selectedMetrics.size === 0}
            >
              Charts ({selectedMetrics.size})
            </button>
          </div>
          {viewMode === 'canvas' && (
            <>
              <input
                ref={filterInputRef}
                type="text"
                placeholder="Find metrics..."
                className={styles.filterInput}
                value={filterText}
                onChange={handleFilterChange}
              />
              {filterText && (
                <button className={styles.clearButton} onClick={handleClearFilter}>
                  ×
                </button>
              )}
            </>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {viewMode === 'charts' && (
            <button className={styles.clearAllButton} onClick={() => setSelectedMetrics(new Set())}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Canvas View - Hidden with CSS when not active */}
      <div style={{ display: viewMode === 'canvas' ? 'block' : 'none', height: '100%' }}>
        {/* Info banner */}
        <div className={`${styles.infoBanner} ${waste <= 5 ? styles.infoBannerSuccess : styles.infoBannerInfo}`}>
          Grid: {gridSize}×{gridSize} •
          Cells: {cellsUsed}/{totalCells} •
          Groups: {processedMetrics.length} •
          Metrics: {totalOriginalMetrics}
        </div>

        {dimensions.width > 0 && dimensions.height > 0 && (
          <canvas
            ref={canvasRef}
            className={styles.metricsCanvas}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
          />
        )}

        {/* Context list panel with backdrop */}
        {selectedGroup && (
          <>
            <div className={styles.backdrop} onClick={handleBackdropClick} />
            <div className={styles.contextPanel}>
              <div className={styles.contextPanelHeader}>
                <h3 className={styles.contextPanelTitle}>
                  {selectedGroup === 'filter-results'
                    ? `Filter: "${debouncedFilterText}" (${filteredContexts?.length || 0} results)`
                    : selectedGroup
                  }
                </h3>
              </div>
              <div className={styles.contextList}>
                {selectedGroup === 'filter-results' ? (
                  filteredContexts && filteredContexts.length > 0 ? (
                    filteredContexts.map((context) => {
                      const anomalyRate = anomalyRates.get(context);
                      const color = getColorForAnomalyRate(anomalyRate);
                      const isSelected = selectedMetrics.has(context);
                      return (
                        <div key={context} className={styles.contextItem}>
                          <div className={styles.contextBand} style={{ backgroundColor: color }} />
                          <div className={styles.contextName}>{context}</div>
                          <button
                            className={`${styles.addButton} ${isSelected ? styles.selected : ''}`}
                            onClick={() => toggleMetric(context)}
                            title={isSelected ? 'Remove from charts' : 'Add to charts'}
                          >
                            {isSelected ? '✓' : '+'}
                          </button>
                        </div>
                      );
                    })
                  ) : debouncedFilterText ? (
                    <div className={styles.noResults}>No matching contexts found</div>
                  ) : (
                    <div className={styles.noResults}>Searching...</div>
                  )
                ) : (
                  sortedGroupMetrics?.map((context) => {
                    const anomalyRate = anomalyRates.get(context);
                    const color = getColorForAnomalyRate(anomalyRate);
                    const isSelected = selectedMetrics.has(context);
                    return (
                      <div key={context} className={styles.contextItem}>
                        <div className={styles.contextBand} style={{ backgroundColor: color }} />
                        <div className={styles.contextName}>{context}</div>
                        <button
                          className={`${styles.addButton} ${isSelected ? styles.selected : ''}`}
                          onClick={() => toggleMetric(context)}
                          title={isSelected ? 'Remove from charts' : 'Add to charts'}
                        >
                          {isSelected ? '✓' : '+'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts View - Hidden with CSS when not active */}
      <div style={{ display: viewMode === 'charts' ? 'block' : 'none', height: '100%', background: '#fafafa' }}>
        <ChartsView
          selectedContexts={selectedMetrics}
          onRemoveContext={removeMetric}
          onClearAll={() => setSelectedMetrics(new Set())}
        />
      </div>
    </div>
  );
};

export default Metrics;
