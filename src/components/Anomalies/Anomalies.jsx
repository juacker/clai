/**
 * Anomalies Component - Hilbert Curve Visualization
 *
 * Displays metrics using a Hilbert curve layout with anomaly rate coloring.
 * Clicking on a metric sends it to the Canvas component for charting.
 *
 * This component is focused on anomaly visualization only.
 * Charts are handled by the separate Canvas command.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import { useCommandMessaging } from '../../contexts/CommandMessagingContext';
import { getContexts, getData } from '../../api/client';
import NetdataSpinner from '../common/NetdataSpinner';
import styles from './Anomalies.module.css';

// ============================================================================
// HILBERT CURVE ALGORITHM
// ============================================================================

function generateHilbertPoints(order) {
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

  return points;
}

// ============================================================================
// METRIC GROUPING ALGORITHM
// ============================================================================

function groupMetricsMultiLevel(metrics, targetCount) {
  if (metrics.length <= targetCount) {
    const sorted = [...metrics].sort();
    return new Map(sorted.map(m => [m, [m]]));
  }

  const sortedMetrics = [...metrics].sort();
  let currentGroups = new Map(sortedMetrics.map(m => [m, [m]]));
  const maxDepth = Math.max(...sortedMetrics.map(m => m.split('.').length));

  for (let depth = maxDepth - 1; depth >= 1; depth--) {
    if (currentGroups.size <= targetCount) break;

    const prefixMap = new Map();

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

    const sortedPrefixes = Array.from(prefixMap.entries())
      .filter(([, items]) => items.length >= 2)
      .sort((a, b) => a[0].localeCompare(b[0]));

    if (sortedPrefixes.length === 0) continue;

    let reductionNeeded = currentGroups.size - targetCount;

    for (const [prefix, groupNames] of sortedPrefixes) {
      if (reductionNeeded <= 0) break;

      const mergedOriginals = [];
      for (const name of groupNames) {
        const originals = currentGroups.get(name);
        if (originals) {
          mergedOriginals.push(...originals);
          currentGroups.delete(name);
        }
      }

      mergedOriginals.sort();
      currentGroups.set(prefix, mergedOriginals);

      const reduction = groupNames.length - 1;
      reductionNeeded -= reduction;
    }
  }

  return currentGroups;
}

function calculateProportionalCells(groupedMetrics, totalCells) {
  const totalOriginals = Array.from(groupedMetrics.values())
    .reduce((sum, arr) => sum + arr.length, 0);

  const groupCount = groupedMetrics.size;

  // If we have more groups than cells, each group gets exactly 1 cell
  if (groupCount >= totalCells) {
    const allocations = Array.from(groupedMetrics.keys())
      .sort()
      .map(name => ({ name, cells: 1 }));
    return new Map(allocations.map(a => [a.name, a.cells]));
  }

  const allocations = [];
  let allocatedCells = 0;

  // First pass: calculate proportional shares (floor values)
  for (const [name, originals] of groupedMetrics) {
    const exactShare = (originals.length / totalOriginals) * totalCells;
    const floorShare = Math.floor(exactShare);
    const remainder = exactShare - floorShare;

    allocations.push({ name, cells: floorShare, remainder, originals: originals.length });
    allocatedCells += floorShare;
  }

  // Ensure every group gets at least 1 cell
  for (const alloc of allocations) {
    if (alloc.cells === 0) {
      alloc.cells = 1;
      allocatedCells++;
    }
  }

  // Distribute remaining cells by remainder (highest first)
  const remainingCells = totalCells - allocatedCells;
  if (remainingCells > 0) {
    allocations.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remainingCells && i < allocations.length; i++) {
      allocations[i].cells++;
    }
  } else if (remainingCells < 0) {
    // We over-allocated! Need to reduce some allocations
    // Sort by cells descending, reduce the largest ones first
    allocations.sort((a, b) => b.cells - a.cells);
    let toReduce = -remainingCells;
    for (const alloc of allocations) {
      if (toReduce <= 0) break;
      // Only reduce if group has more than 1 cell
      while (alloc.cells > 1 && toReduce > 0) {
        alloc.cells--;
        toReduce--;
      }
    }
  }

  allocations.sort((a, b) => a.name.localeCompare(b.name));

  return new Map(allocations.map(a => [a.name, a.cells]));
}

function calculateHilbertConfig(metrics) {
  if (metrics.length === 0) {
    return {
      order: 0,
      gridSize: 1,
      totalCells: 1,
      processedMetrics: [],
      groupedMetrics: new Map(),
      cellAllocations: new Map()
    };
  }

  const sortedMetrics = [...metrics].sort();

  let maxOrder = 0;
  while (Math.pow(2, maxOrder) * Math.pow(2, maxOrder) < sortedMetrics.length) {
    maxOrder++;
  }

  const maxGridSize = Math.pow(2, maxOrder);
  const maxTotalCells = maxGridSize * maxGridSize;
  const initialWaste = ((maxTotalCells - sortedMetrics.length) / maxTotalCells) * 100;

  const WASTE_THRESHOLD = 20;
  if (initialWaste <= WASTE_THRESHOLD) {
    const groupedMetrics = new Map(sortedMetrics.map(m => [m, [m]]));
    const cellAllocations = new Map(sortedMetrics.map(m => [m, 1]));
    return {
      order: maxOrder,
      gridSize: maxGridSize,
      totalCells: maxTotalCells,
      processedMetrics: sortedMetrics,
      groupedMetrics,
      cellAllocations
    };
  }

  let bestConfig = null;
  let bestWaste = initialWaste;
  const minOrder = 3;

  for (let tryOrder = maxOrder - 1; tryOrder >= minOrder; tryOrder--) {
    const tryGridSize = Math.pow(2, tryOrder);
    const tryCells = tryGridSize * tryGridSize;

    const grouped = groupMetricsMultiLevel(sortedMetrics, tryCells);
    const groupedCount = grouped.size;

    if (groupedCount <= tryCells) {
      const cellAllocations = calculateProportionalCells(grouped, tryCells);
      const allocatedCells = Array.from(cellAllocations.values()).reduce((a, b) => a + b, 0);
      const waste = ((tryCells - allocatedCells) / tryCells) * 100;

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
      }

      if (waste <= 5) break;
    } else {
      break;
    }
  }

  if (bestConfig) {
    return bestConfig;
  }

  const groupedMetrics = new Map(sortedMetrics.map(m => [m, [m]]));
  const cellAllocations = new Map(sortedMetrics.map(m => [m, 1]));
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

function createVisualGroups(groupedMetrics, cellAllocations) {
  // For large groups, extract more subgroups to reduce fragmentation
  // More extracted subgroups = smaller remaining parent = less scattered

  const MAX_VISUAL_GROUPS = 60;
  const MIN_SUBGROUP_CELLS = 20; // Lower threshold = more subgroups extracted
  const displayNames = Array.from(groupedMetrics.keys()).sort();

  // Step 1: Calculate cell counts for each first-level and second-level prefix
  const firstLevelCounts = new Map();
  const firstLevelMetrics = new Map();
  const secondLevelCounts = new Map();

  for (const name of displayNames) {
    const parts = name.split('.');
    const firstLevel = parts[0];
    const secondLevel = parts.length > 1 ? `${parts[0]}.${parts[1]}` : null;
    const cells = cellAllocations.get(name) || 1;

    firstLevelCounts.set(firstLevel, (firstLevelCounts.get(firstLevel) || 0) + cells);
    if (!firstLevelMetrics.has(firstLevel)) {
      firstLevelMetrics.set(firstLevel, []);
    }
    firstLevelMetrics.get(firstLevel).push(name);

    if (secondLevel) {
      const key = `${firstLevel}|${secondLevel}`;
      if (!secondLevelCounts.has(key)) {
        secondLevelCounts.set(key, { secondLevel, cells: 0, metrics: [] });
      }
      const entry = secondLevelCounts.get(key);
      entry.cells += cells;
      entry.metrics.push(name);
    }
  }

  // Step 2: Calculate threshold for large groups
  const totalCells = Array.from(firstLevelCounts.values()).reduce((a, b) => a + b, 0);
  const largeGroupThreshold = totalCells * 0.10; // 10% of total (lower = more groups split)

  // Step 3: Build visual groups
  const groups = new Map();

  for (const [firstLevel, metrics] of firstLevelMetrics) {
    const cellCount = firstLevelCounts.get(firstLevel);

    if (cellCount < largeGroupThreshold) {
      groups.set(firstLevel, metrics);
      continue;
    }

    // Large group - extract subgroups
    const subgroups = [];
    for (const [key, entry] of secondLevelCounts) {
      if (key.startsWith(`${firstLevel}|`)) {
        subgroups.push(entry);
      }
    }

    subgroups.sort((a, b) => b.cells - a.cells);

    const extractedMetrics = new Set();

    for (const subgroup of subgroups) {
      if (groups.size >= MAX_VISUAL_GROUPS - 1) break;

      // Extract if subgroup has enough cells
      if (subgroup.cells >= MIN_SUBGROUP_CELLS) {
        groups.set(subgroup.secondLevel, subgroup.metrics);
        subgroup.metrics.forEach(m => extractedMetrics.add(m));
      }
    }

    // Keep remaining under parent (only if there are remaining metrics)
    const remainingMetrics = metrics.filter(m => !extractedMetrics.has(m));
    if (remainingMetrics.length > 0) {
      groups.set(firstLevel, remainingMetrics);
    }
  }

  return groups;
}

function calculateGroupBorders(cells, visualGroups) {
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

  return borders;
}

// ============================================================================
// COLOR MAPPING
// ============================================================================

function getColorForAnomalyRate(anomalyRate) {
  if (anomalyRate === null || anomalyRate === undefined || anomalyRate < 10) {
    return '#E6F9EE';
  } else if (anomalyRate >= 10 && anomalyRate < 50) {
    return '#E6F7FB';
  } else if (anomalyRate >= 50 && anomalyRate < 100) {
    return '#FEF5E7';
  } else {
    return '#FCE8E6';
  }
}

function getSeverityLevel(anomalyRate) {
  if (anomalyRate === null || anomalyRate === undefined) {
    return 0;
  } else if (anomalyRate >= 100) {
    return 4;
  } else if (anomalyRate >= 50) {
    return 3;
  } else if (anomalyRate >= 10) {
    return 2;
  } else {
    return 1;
  }
}

// ============================================================================
// ANOMALIES COMPONENT
// ============================================================================

const Anomalies = ({ command }) => {
  const { selectedSpace, selectedRoom } = useTabContext();
  const { sendToCanvas, isElementInCanvas } = useCommandMessaging();

  // Create space/room key for canvas storage
  const spaceRoomKey = useMemo(() => {
    if (!selectedSpace?.id || !selectedRoom?.id) return null;
    return `${selectedSpace.id}_${selectedRoom.id}`;
  }, [selectedSpace?.id, selectedRoom?.id]);

  const [contexts, setContexts] = useState([]);
  const [anomalyRates, setAnomalyRates] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [debouncedFilterText, setDebouncedFilterText] = useState('');
  const [sentFeedback, setSentFeedback] = useState(null); // Track recently sent metric for feedback

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const filterTimeoutRef = useRef(null);
  const filterInputRef = useRef(null);

  const sortedContexts = useMemo(() => {
    return [...contexts].sort((a, b) => a.name.localeCompare(b.name));
  }, [contexts]);

  const hilbertConfig = useMemo(() => {
    const metricNames = sortedContexts.map(c => c.name);
    return calculateHilbertConfig(metricNames);
  }, [sortedContexts]);

  const allCells = useMemo(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return [];

    const { order, gridSize, processedMetrics, groupedMetrics, cellAllocations } = hilbertConfig;
    const hilbertPoints = generateHilbertPoints(order);

    const cellWidth = dimensions.width / gridSize;
    const cellHeight = dimensions.height / gridSize;

    const cells = [];
    let hilbertIndex = 0;

    for (const metricName of processedMetrics) {
      const originalMetrics = groupedMetrics.get(metricName) || [metricName];
      const cellCount = cellAllocations.get(metricName) || 1;

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

    return cells;
  }, [dimensions, hilbertConfig]);

  const { groupBorders, visualGroups } = useMemo(() => {
    if (allCells.length === 0) {
      return { groupBorders: [], visualGroups: new Map() };
    }

    const { groupedMetrics, cellAllocations } = hilbertConfig;
    const visualGroups = createVisualGroups(groupedMetrics, cellAllocations);
    const groupBorders = calculateGroupBorders(allCells, visualGroups);

    return { groupBorders, visualGroups };
  }, [allCells, hilbertConfig]);

  const groupLabels = useMemo(() => {
    if (allCells.length === 0 || visualGroups.size === 0) {
      return [];
    }

    const metricToCells = new Map();
    allCells.forEach(cell => {
      if (!metricToCells.has(cell.name)) {
        metricToCells.set(cell.name, []);
      }
      metricToCells.get(cell.name).push(cell);
    });

    const labels = [];
    visualGroups.forEach((metrics, groupKey) => {
      const groupCells = [];
      for (const metric of metrics) {
        const cells = metricToCells.get(metric);
        if (cells) {
          groupCells.push(...cells);
        }
      }

      if (groupCells.length === 0) return;

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

    return labels;
  }, [allCells, visualGroups]);

  const filteredContexts = useMemo(() => {
    if (!debouncedFilterText.trim()) {
      return null;
    }

    const lowerFilter = debouncedFilterText.toLowerCase();
    const matchingContexts = [];
    const { groupedMetrics } = hilbertConfig;

    visualGroups.forEach((processedMetrics) => {
      processedMetrics.forEach(metric => {
        const originals = groupedMetrics.get(metric);
        const metricsToSearch = (originals && originals.length > 0) ? originals : [metric];

        metricsToSearch.forEach(original => {
          if (original.toLowerCase().includes(lowerFilter)) {
            matchingContexts.push(original);
          }
        });
      });
    });

    matchingContexts.sort((a, b) => {
      const severityA = getSeverityLevel(anomalyRates.get(a));
      const severityB = getSeverityLevel(anomalyRates.get(b));

      if (severityB !== severityA) {
        return severityB - severityA;
      }

      return a.localeCompare(b);
    });

    return matchingContexts;
  }, [debouncedFilterText, visualGroups, anomalyRates, hilbertConfig]);

  const sortedGroupMetrics = useMemo(() => {
    if (!selectedGroup || selectedGroup === 'filter-results') {
      return null;
    }

    const processedMetrics = visualGroups.get(selectedGroup);
    if (!processedMetrics) {
      return null;
    }

    const { groupedMetrics } = hilbertConfig;
    const expandedMetrics = [];

    for (const metric of processedMetrics) {
      const originals = groupedMetrics.get(metric);
      if (originals && originals.length > 0) {
        expandedMetrics.push(...originals);
      } else {
        expandedMetrics.push(metric);
      }
    }

    const sorted = expandedMetrics.sort((a, b) => {
      const severityA = getSeverityLevel(anomalyRates.get(a));
      const severityB = getSeverityLevel(anomalyRates.get(b));

      if (severityB !== severityA) {
        return severityB - severityA;
      }

      return a.localeCompare(b);
    });

    return sorted;
  }, [selectedGroup, visualGroups, anomalyRates, hilbertConfig]);

  // Canvas rendering effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allCells.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const hoveredGroupMetrics = hoveredGroup ? visualGroups.get(hoveredGroup) : null;

    allCells.forEach(cell => {
      let anomalyRate = null;

      if (cell.isGrouped) {
        const rates = cell.originalMetrics
          .map(metric => anomalyRates.get(metric))
          .filter(rate => rate !== undefined && rate !== null);

        if (rates.length > 0) {
          anomalyRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
        }
      } else {
        anomalyRate = anomalyRates.get(cell.name);
      }

      ctx.fillStyle = getColorForAnomalyRate(anomalyRate);
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    });

    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    groupBorders.forEach(border => {
      ctx.moveTo(border.x1, border.y1);
      ctx.lineTo(border.x2, border.y2);
    });
    ctx.stroke();

    if (hoveredGroupMetrics) {
      ctx.strokeStyle = '#00AB44';
      ctx.lineWidth = 1.0;
      ctx.beginPath();

      const gridMap = new Map();
      allCells.forEach(cell => {
        const gridX = Math.round(cell.x / cell.width);
        const gridY = Math.round(cell.y / cell.height);
        gridMap.set(`${gridX},${gridY}`, cell);
      });

      allCells.forEach(cell => {
        if (!hoveredGroupMetrics.includes(cell.name)) return;

        const gridX = Math.round(cell.x / cell.width);
        const gridY = Math.round(cell.y / cell.height);

        const top = gridMap.get(`${gridX},${gridY - 1}`);
        const right = gridMap.get(`${gridX + 1},${gridY}`);
        const bottom = gridMap.get(`${gridX},${gridY + 1}`);
        const left = gridMap.get(`${gridX - 1},${gridY}`);

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

    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = 12;

    groupLabels.forEach(label => {
      const isBold = hoveredGroup === label.text;
      ctx.font = `${isBold ? '700' : '500'} ${fontSize}px sans-serif`;
      ctx.fillText(label.text, label.x, label.y);
    });
  }, [allCells, groupBorders, groupLabels, dimensions, visualGroups, hoveredGroup, anomalyRates]);

  const handleMouseMove = useCallback((e) => {
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
  }, [allCells]);

  const handleMouseLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
    setHoveredGroup(null);
  }, []);

  const handleCanvasClick = useCallback((e) => {
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
  }, [allCells]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      setSelectedGroup(null);
    }
  }, []);

  const handleFilterChange = useCallback((e) => {
    const value = e.target.value;
    setFilterText(value);

    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    filterTimeoutRef.current = setTimeout(() => {
      if (value.trim().length >= 3) {
        setDebouncedFilterText(value);
        setSelectedGroup('filter-results');
      } else {
        setDebouncedFilterText('');
        setSelectedGroup(null);
      }
    }, 500);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilterText('');
    setDebouncedFilterText('');
    setSelectedGroup(null);
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
  }, []);

  const getGroupForCell = useCallback((cell) => {
    for (const [groupKey, metrics] of visualGroups.entries()) {
      if (metrics.includes(cell.name)) {
        return groupKey;
      }
    }
    return null;
  }, [visualGroups]);

  // Send metric to canvas
  const handleMetricClick = useCallback((context) => {
    if (!spaceRoomKey) return; // Need space/room context

    // Use context as element ID (it's unique)
    const elementId = `context-chart-${context}`;

    if (isElementInCanvas(elementId, spaceRoomKey)) {
      return; // Already in canvas
    }

    // Create element config
    const element = {
      id: elementId,
      type: 'context-chart',
      config: {
        context: context,
      },
    };

    const result = sendToCanvas(element, spaceRoomKey);
    if (result.success) {
      setSentFeedback(context);
      setTimeout(() => setSentFeedback(null), 1500);
    }
  }, [sendToCanvas, isElementInCanvas, spaceRoomKey]);

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

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedGroup) {
        setSelectedGroup(null);
        setFilterText('');
        setDebouncedFilterText('');
        if (filterTimeoutRef.current) {
          clearTimeout(filterTimeoutRef.current);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (filterInputRef.current) {
          filterInputRef.current.focus();
          filterInputRef.current.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedGroup]);

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

        if (contextsResponse && contextsResponse.contexts) {
          const contextList = Object.entries(contextsResponse.contexts).map(([name, data]) => ({
            name,
            ...data,
          }));
          setContexts(contextList);
        } else {
          setContexts([]);
        }

        if (anomalyResponse && anomalyResponse.result) {
          const { labels, data } = anomalyResponse.result;
          const rates = new Map();

          if (data && data.length > 0 && labels && labels.length > 0) {
            const firstRow = data[0];

            for (let i = 1; i < labels.length; i++) {
              const contextName = labels[i];
              const valueArray = firstRow[i];

              if (Array.isArray(valueArray) && valueArray.length > 0) {
                const anomalyRate = valueArray[0];
                rates.set(contextName, anomalyRate);
              }
            }
          }

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
          <p className={styles.loadingText}>Loading anomalies...</p>
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

  const { gridSize, totalCells, processedMetrics, groupedMetrics } = hilbertConfig;
  const cellsUsed = allCells.length;
  const waste = ((totalCells - cellsUsed) / totalCells) * 100;
  const totalOriginalMetrics = Array.from(groupedMetrics.values()).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className={styles.metricsContainer} ref={containerRef}>
      {/* Header toolbar */}
      <div className={styles.headerBar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.headerTitle}>Anomalies</span>
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
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.hint}>Click metric to add to canvas</span>
        </div>
      </div>

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
                    const inCanvas = spaceRoomKey && isElementInCanvas(`context-chart-${context}`, spaceRoomKey);
                    const justSent = sentFeedback === context;
                    return (
                      <div
                        key={context}
                        className={`${styles.contextItem} ${inCanvas ? styles.inCanvas : ''}`}
                        onClick={() => handleMetricClick(context)}
                      >
                        <div className={styles.contextBand} style={{ backgroundColor: color }} />
                        <div className={styles.contextName}>{context}</div>
                        <div className={styles.statusIndicator}>
                          {justSent ? (
                            <span className={styles.sentBadge}>Sent!</span>
                          ) : inCanvas ? (
                            <span className={styles.inCanvasBadge}>In Canvas</span>
                          ) : (
                            <span className={styles.addHint}>+ Add</span>
                          )}
                        </div>
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
                  const inCanvas = spaceRoomKey && isElementInCanvas(`context-chart-${context}`, spaceRoomKey);
                  const justSent = sentFeedback === context;
                  return (
                    <div
                      key={context}
                      className={`${styles.contextItem} ${inCanvas ? styles.inCanvas : ''}`}
                      onClick={() => handleMetricClick(context)}
                    >
                      <div className={styles.contextBand} style={{ backgroundColor: color }} />
                      <div className={styles.contextName}>{context}</div>
                      <div className={styles.statusIndicator}>
                        {justSent ? (
                          <span className={styles.sentBadge}>Sent!</span>
                        ) : inCanvas ? (
                          <span className={styles.inCanvasBadge}>In Canvas</span>
                        ) : (
                          <span className={styles.addHint}>+ Add</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Anomalies;
