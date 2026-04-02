import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3';
import { getData } from '../../api/client';
import { useCommandMessaging } from '../../contexts/CommandMessagingContext';
import NetdataSpinner from '../common/NetdataSpinner';
import DashboardPicker from '../common/DashboardPicker';
import styles from './LoadChartBlock.module.css';

const normalizeFilterMap = (filterMap) => {
  if (!filterMap || typeof filterMap !== 'object') return {};

  return Object.fromEntries(
    Object.entries(filterMap)
      .filter(([key]) => !!key)
      .map(([key, value]) => [key, Array.isArray(value) ? value : [value].filter(Boolean)])
  );
};

/**
 * LoadChartBlock Component
 *
 * Renders a time-series chart by fetching data from the Netdata API using the getData function.
 * Similar to TimeSeriesChartBlock but loads data dynamically instead of receiving it as input.
 *
 * @param {Object} props - Component props
 * @param {Object} props.toolInput - Chart configuration
 * @param {string} props.toolInput.context - The name of the metric to show data for
 * @param {Array} props.toolInput.group_by - Labels to group metrics by (e.g., 'node', 'dimension', 'instance')
 * @param {Array} props.toolInput.filter_by - Filter data by specific label values
 * @param {string} props.toolInput.value_agg - Aggregation method for grouping series
 * @param {string} props.toolInput.time_agg - Aggregation method for downsampling
 * @param {string} props.toolInput.after - Start timestamp (RFC 3339 format)
 * @param {string} props.toolInput.before - End timestamp (RFC 3339 format)
 * @param {number} props.toolInput.interval_count - Number of intervals in the time-range
 * @param {Object} props.toolResult - Tool execution result
 * @param {Object} props.space - Space object with id and name
 * @param {Object} props.room - Room object with id and name
 */
const LoadChartBlock = ({ toolInput, toolResult, space, room }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  });
  const [selectedSeries, setSelectedSeries] = useState(null);

  // Filter and grouping state
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeGroupBy, setActiveGroupBy] = useState([]);
  const [activeFilters, setActiveFilters] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Dashboard integration
  const { sendToDashboard, sendToDashboardById, highlightDashboard } = useCommandMessaging();
  const [sentToDashboard, setSentToDashboard] = useState(false);
  const [dashboardPicker, setDashboardPicker] = useState(null); // { dashboards, config, position }

  // Handle send to dashboard
  const handleSendToDashboard = useCallback((event) => {
    if (!toolInput?.context) return;

    // Convert activeFilters to filterBy format
    const filterBy = {};
    Object.entries(activeFilters).forEach(([label, values]) => {
      filterBy[label] = Array.isArray(values) ? values : [values].filter(Boolean);
    });

    const config = {
      context: toolInput.context,
      groupBy: activeGroupBy,
      filterBy: filterBy,
      valueAgg: toolInput.value_agg || 'avg',
      timeAgg: toolInput.time_agg || 'average',
    };

    const result = sendToDashboard(config);
    if (result.success) {
      setSentToDashboard(true);
      setTimeout(() => setSentToDashboard(false), 2000);
    } else if (result.needsSelection) {
      // Multiple dashboards - show picker at click position
      setDashboardPicker({
        dashboards: result.dashboards,
        config: result.config,
        position: event ? { top: event.clientY, left: event.clientX } : null,
      });
    }
  }, [sendToDashboard, toolInput, activeGroupBy, activeFilters]);

  // Handle dashboard selection from picker
  const handleDashboardSelect = useCallback((dashboardId) => {
    if (!dashboardPicker) return;

    const result = sendToDashboardById(dashboardId, dashboardPicker.config);
    if (result.success) {
      setSentToDashboard(true);
      setTimeout(() => setSentToDashboard(false), 2000);
    }
    setDashboardPicker(null);
  }, [dashboardPicker, sendToDashboardById]);

  // Cancel dashboard picker
  const handleDashboardPickerCancel = useCallback(() => {
    setDashboardPicker(null);
  }, []);

  // Netdata chart color palette
  const DEFAULT_COLORS = useMemo(() => [
    '#00AB44',  // Netdata Green
    '#00B5D8',  // Netdata Teal
    '#3498DB',  // Sky Blue
    '#9B59B6',  // Purple
    '#F39C12',  // Orange
    '#E74C3C',  // Red
    '#1ABC9C',  // Turquoise
    '#34495E',  // Dark Gray
  ], []);

  // Initialize active filters and groups from toolInput
  useEffect(() => {
    if (!toolInput) return;

    // Initialize groupBy from toolInput
    if (toolInput.group_by && Array.isArray(toolInput.group_by)) {
      setActiveGroupBy(toolInput.group_by);
    }

    // Initialize filters from toolInput
    if (toolInput.filter_by && Array.isArray(toolInput.filter_by)) {
      const filters = {};
      toolInput.filter_by.forEach(filter => {
        if (!filters[filter.label]) {
          filters[filter.label] = [];
        }
        filters[filter.label].push(filter.value);
      });
      setActiveFilters(normalizeFilterMap(filters));
    } else if (toolInput.filter_by && typeof toolInput.filter_by === 'object') {
      setActiveFilters(normalizeFilterMap(toolInput.filter_by));
    }

    // Mark initialization as complete
    setIsInitialized(true);
  }, [toolInput]);

  // Handle container resizing with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.target.clientWidth;
        const height = Math.min(400, Math.max(250, width * 0.5));
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    const width = containerRef.current.clientWidth;
    if (width > 0) {
      const height = Math.min(400, Math.max(250, width * 0.5));
      setDimensions({ width, height });
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Build getData request params from current state
  const buildGetDataParams = useCallback((groupBy, filters) => {
    const nodeIDs = [];
    const dimensions = [];
    const instances = [];
    const labels = [];
    const normalizedFilters = normalizeFilterMap(filters);

    // Build filters from activeFilters state
    Object.keys(normalizedFilters).forEach(label => {
      const values = normalizedFilters[label];
      values.forEach(value => {
        switch (label) {
          case 'node':
            nodeIDs.push(value);
            break;
          case 'dimension':
            dimensions.push(value);
            break;
          case 'instance':
            instances.push(value);
            break;
          default:
            labels.push(`${label}:${value}`);
            break;
        }
      });
    });

    const systemLabels = ['node', 'dimension', 'instance'];
    const groupedBy = [];
    const groupedByLabel = [];

    // Build groupBy from activeGroupBy state
    groupBy.forEach(label => {
      if (systemLabels.includes(label)) {
        groupedBy.push(label);
      } else {
        if (!groupedBy.includes('label')) {
          groupedBy.push('label');
        }
        groupedByLabel.push(label);
      }
    });

    if (groupedBy.length === 0) {
      groupedBy.push('dimension');
    }

    const afterTimestamp = Math.floor(new Date(toolInput.after).getTime() / 1000);
    const beforeTimestamp = Math.floor(new Date(toolInput.before).getTime() / 1000);

    return {
      scope: {
        contexts: [toolInput.context],
        nodes: nodeIDs.length > 0 ? nodeIDs : []
      },
      selectors: {
        dimensions: dimensions.length > 0 ? dimensions : ['*'],
        instances: instances.length > 0 ? instances : ['*'],
        labels: labels.length > 0 ? labels : ['*']
      },
      aggregations: {
        metrics: [
          {
            group_by: groupedBy,
            group_by_label: groupedByLabel,
            aggregation: toolInput.value_agg || 'avg'
          }
        ],
        time: {
          time_group: toolInput.time_agg || 'average',
          time_resampling: 0
        }
      },
      window: {
        after: afterTimestamp,
        before: beforeTimestamp,
        points: toolInput.interval_count || 15
      }
    };
  }, [toolInput]);

  const buildNodeMapping = (summary) => {
    const nodeMap = new Map();
    if (summary?.nodes && Array.isArray(summary.nodes)) {
      summary.nodes.forEach(node => {
        if (node.mg && node.nm) {
          nodeMap.set(node.mg, node.nm);
        }
      });
    }
    return nodeMap;
  };

  const replaceNodeIdsInLabel = (label, nodeMap, isGroupedByNode) => {
    if (!isGroupedByNode || nodeMap.size === 0) {
      return label;
    }

    let updatedLabel = label;
    nodeMap.forEach((nodeName, nodeId) => {
      const nodeIdRegex = new RegExp(nodeId, 'g');
      updatedLabel = updatedLabel.replace(nodeIdRegex, nodeName);
    });

    return updatedLabel;
  };

  const transformResponseToChartData = useCallback((response) => {
    if (!response.result || !response.result.labels || !response.result.data) {
      throw new Error('Invalid response format');
    }

    const { labels, data } = response.result;
    const { view, summary } = response;

    // Store summary for filter/group UI
    setSummary(summary);

    const nodeMap = buildNodeMapping(summary);
    const isGroupedByNode = activeGroupBy.includes('node');

    const metricLabels = labels.slice(1);

    const datasets = metricLabels.map((label, labelIndex) => {
      const seriesData = data.map(row => {
        const timestamp = row[0];
        const valueArray = row[labelIndex + 1];
        const value = Array.isArray(valueArray) ? valueArray[0] : valueArray;

        return {
          dt: new Date(timestamp).toISOString(),
          v: value || 0
        };
      });

      const displayLabel = replaceNodeIdsInLabel(label, nodeMap, isGroupedByNode);

      return {
        label: displayLabel,
        data: seriesData,
        color: DEFAULT_COLORS[labelIndex % DEFAULT_COLORS.length]
      };
    });

    let unit = view?.units || '';
    if (unit.toLowerCase() === 'percentage') {
      unit = '%';
    }

    return {
      datasets,
      title: view?.title || toolInput?.context || 'Chart',
      context: toolInput?.context || "context not set",
      unit: unit
    };
  }, [toolInput, DEFAULT_COLORS, activeGroupBy]);

  // Fetch data from API
  const fetchData = useCallback(async (groupBy, filters) => {
    setLoading(true);
    setError(null);

    try {
      if (!space?.id || !room?.id) {
        throw new Error('Space ID or Room ID not found. Please select a space and room.');
      }

      const params = buildGetDataParams(groupBy, filters);
      // Token is handled by Rust backend
      const response = await getData(space.id, room.id, params);
      const transformedData = transformResponseToChartData(response);

      setChartData(transformedData);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
      setError(err.message || 'Failed to load chart data');
      setLoading(false);
    }
  }, [space?.id, room?.id, buildGetDataParams, transformResponseToChartData]);

  // Fetch data when initialized and when filters/grouping changes
  useEffect(() => {
    if (!toolResult || !toolResult.text) return;
    if (!isInitialized) return; // Wait for initialization to complete

    fetchData(activeGroupBy, activeFilters);
  }, [isInitialized, activeGroupBy, activeFilters, toolResult?.text, fetchData]);

  // Parse available options from summary
  const getAvailableOptions = useCallback(() => {
    if (!summary) return { groupByOptions: [], filterOptions: {} };

    const groupByOptions = [];
    const filterOptions = {};

    // Nodes
    if (summary.nodes && summary.nodes.length > 1) {
      groupByOptions.push({ label: 'node', displayName: 'Node' });
      filterOptions.node = summary.nodes
        .map(n => ({
          value: n.mg,
          displayName: n.nm || n.mg
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    // Dimensions
    if (summary.dimensions && summary.dimensions.length > 1) {
      groupByOptions.push({ label: 'dimension', displayName: 'Dimension' });
      filterOptions.dimension = summary.dimensions
        .map(d => ({
          value: d.id,
          displayName: d.id
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    // Instances
    if (summary.instances && summary.instances.length > 1) {
      groupByOptions.push({ label: 'instance', displayName: 'Instance' });
      filterOptions.instance = summary.instances
        .map(i => ({
          value: i.id,
          displayName: i.id
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    // Custom labels
    if (summary.labels && Array.isArray(summary.labels)) {
      summary.labels.forEach(labelObj => {
        if (labelObj.vl && labelObj.vl.length > 1) {
          groupByOptions.push({ label: labelObj.id, displayName: labelObj.id });
          filterOptions[labelObj.id] = labelObj.vl
            .map(v => ({
              value: v.id,
              displayName: v.id
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
        }
      });
    }

    return { groupByOptions, filterOptions };
  }, [summary]);

  // Handle group by change
  const handleGroupByChange = useCallback((label, isChecked) => {
    setActiveGroupBy(prev => {
      if (isChecked) {
        return [...prev, label];
      } else {
        return prev.filter(l => l !== label);
      }
    });
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((filterLabel, value, isChecked) => {
    setActiveFilters(prev => {
      const updated = { ...prev };
      if (isChecked) {
        if (!updated[filterLabel]) {
          updated[filterLabel] = [];
        }
        updated[filterLabel] = [...updated[filterLabel], value];
      } else {
        if (updated[filterLabel]) {
          updated[filterLabel] = updated[filterLabel].filter(v => v !== value);
          if (updated[filterLabel].length === 0) {
            delete updated[filterLabel];
          }
        }
      }
      return updated;
    });
  }, []);

  // Remove a specific group by
  const handleRemoveGroupBy = useCallback((label) => {
    setActiveGroupBy(prev => prev.filter(l => l !== label));
  }, []);

  // Remove a specific filter
  const handleRemoveFilter = useCallback((filterLabel, value) => {
    setActiveFilters(prev => {
      const updated = { ...prev };
      if (updated[filterLabel]) {
        updated[filterLabel] = updated[filterLabel].filter(v => v !== value);
        if (updated[filterLabel].length === 0) {
          delete updated[filterLabel];
        }
      }
      return updated;
    });
  }, []);

  // Reset to original toolInput configuration
  const handleReset = useCallback(() => {
    const initialGroupBy = toolInput?.group_by || [];
    const initialFilters = {};

    if (toolInput?.filter_by && Array.isArray(toolInput.filter_by)) {
      toolInput.filter_by.forEach(filter => {
        if (!initialFilters[filter.label]) {
          initialFilters[filter.label] = [];
        }
        initialFilters[filter.label].push(filter.value);
      });
    }

    setActiveGroupBy(initialGroupBy);
    setActiveFilters(initialFilters);
  }, [toolInput]);

  // Check if current state differs from initial toolInput
  const hasChanges = useMemo(() => {
    const initialGroupBy = toolInput?.group_by || [];
    const initialFilters = {};

    if (toolInput?.filter_by && Array.isArray(toolInput.filter_by)) {
      toolInput.filter_by.forEach(filter => {
        if (!initialFilters[filter.label]) {
          initialFilters[filter.label] = [];
        }
        initialFilters[filter.label].push(filter.value);
      });
    }

    // Check groupBy changes
    if (activeGroupBy.length !== initialGroupBy.length) return true;
    if (!activeGroupBy.every(g => initialGroupBy.includes(g))) return true;

    // Check filter changes
    const normalizedActiveFilters = normalizeFilterMap(activeFilters);
    const normalizedInitialFilters = normalizeFilterMap(initialFilters);
    const activeFilterKeys = Object.keys(normalizedActiveFilters);
    const initialFilterKeys = Object.keys(normalizedInitialFilters);

    if (activeFilterKeys.length !== initialFilterKeys.length) return true;

    for (const key of activeFilterKeys) {
      if (!normalizedInitialFilters[key]) return true;
      if (normalizedActiveFilters[key].length !== normalizedInitialFilters[key].length) return true;
      if (!normalizedActiveFilters[key].every(v => normalizedInitialFilters[key].includes(v))) return true;
    }

    return false;
  }, [activeGroupBy, activeFilters, toolInput]);

  // Get display name for a filter value
  const getFilterDisplayName = useCallback((filterLabel, value) => {
    const { filterOptions } = getAvailableOptions();
    const options = filterOptions[filterLabel];
    if (!options) return value;

    const option = options.find(opt => opt.value === value);
    return option ? option.displayName : value;
  }, [getAvailableOptions]);

  // Render line chart
  const renderLine = useCallback((g, datasets, xScale, yScale) => {
    const line = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    datasets.forEach((dataset) => {
      g.append('path')
        .datum(dataset.data)
        .attr('class', styles.line)
        .attr('fill', 'none')
        .attr('stroke', dataset.color)
        .attr('stroke-width', 2)
        .attr('d', line);
    });
  }, []);

  // Show tooltip with data values and smart positioning
  const showTooltip = useCallback((event, nearestPoints) => {
    if (!nearestPoints || nearestPoints.length === 0) return;

    const validPoints = nearestPoints.filter(np => np && np.point);
    if (validPoints.length === 0) return;

    const timestamp = d3.timeFormat('%Y-%m-%d %H:%M:%S %z')(validPoints[0].point.date);

    // Sort by value in descending order before limiting
    const sortedPoints = validPoints.sort((a, b) => b.point.value - a.point.value);
    const limitedPoints = sortedPoints.slice(0, 10);
    const hasMore = sortedPoints.length > 10;

    const dataRows = limitedPoints.map(({ dataset, point }) => ({
      color: dataset.color,
      label: dataset.label,
      value: point.value.toFixed(2),
    }));

    const offset = 15;
    const padding = 10;

    let left = event.clientX + offset;
    let top = event.clientY - offset;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const tooltipWidth = 280;
    const baseHeight = 80 + (dataRows.length * 30);
    const tooltipHeight = hasMore ? baseHeight + 25 : baseHeight;

    if (left + tooltipWidth + padding > windowWidth) {
      left = event.clientX - tooltipWidth - offset;
    }

    if (left < padding) {
      left = padding;
    }

    if (top + tooltipHeight + padding > windowHeight) {
      top = event.clientY - tooltipHeight - offset;
    }

    if (top < padding) {
      top = padding;
    }

    setTooltip({
      visible: true,
      x: left,
      y: top,
      content: { timestamp, dataRows, hasMore, moreCount: validPoints.length - 10 },
    });
  }, [chartData?.unit]);

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    setTooltip({
      visible: false,
      x: 0,
      y: 0,
      content: null,
    });
  }, []);

  // Handle legend item click for series filtering
  const handleLegendClick = useCallback((seriesLabel, event) => {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    setSelectedSeries((prevSelected) => {
      if (!prevSelected) {
        return new Set([seriesLabel]);
      }

      if (isCtrlOrCmd) {
        const newSelected = new Set(prevSelected);
        if (newSelected.has(seriesLabel)) {
          newSelected.delete(seriesLabel);
          return newSelected.size === 0 ? null : newSelected;
        } else {
          newSelected.add(seriesLabel);
          return newSelected;
        }
      }

      if (prevSelected.size === 1 && prevSelected.has(seriesLabel)) {
        return null;
      }

      return new Set([seriesLabel]);
    });
  }, []);

  // Check if a series is selected
  const isSeriesSelected = useCallback((seriesLabel) => {
    if (!selectedSeries) return true;
    return selectedSeries.has(seriesLabel);
  }, [selectedSeries]);

  // Add interactive features (tooltip, crosshair, hover circles)
  const addInteractivity = useCallback((g, datasets, xScale, yScale, width, height) => {
    const crosshair = g
      .append('line')
      .attr('class', styles.crosshair)
      .attr('y1', 0)
      .attr('y2', height)
      .style('display', 'none')
      .style('opacity', 0);

    const overlay = g
      .append('rect')
      .attr('class', styles.overlay)
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .style('cursor', 'crosshair');

    const hoverCirclesGroup = g.append('g').attr('class', 'hover-circles');

    const hoverCircles = datasets.map((dataset) => {
      return hoverCirclesGroup
        .append('circle')
        .attr('class', 'hover-circle')
        .attr('r', 5)
        .attr('fill', dataset.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('display', 'none')
        .style('opacity', 0)
        .style('pointer-events', 'none');
    });

    let hideTimeout = null;
    let isOverCircle = false;

    const hideAllElements = () => {
      crosshair
        .transition()
        .duration(150)
        .style('opacity', 0)
        .on('end', function () {
          d3.select(this).style('display', 'none');
        });

      hoverCircles.forEach((circle) => {
        circle
          .transition()
          .duration(150)
          .style('opacity', 0)
          .on('end', function () {
            d3.select(this).style('display', 'none');
          });
      });

      clickCircles.forEach((circle) => {
        circle.style('display', 'none');
      });

      hideTooltip();
    };

    const clickCircles = datasets.map((dataset, index) => {
      return hoverCirclesGroup
        .append('circle')
        .attr('class', 'click-circle')
        .attr('r', 12)
        .attr('fill', 'transparent')
        .style('display', 'none')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('click', function (event) {
          event.stopPropagation();

          const seriesLabel = dataset.label;
          const syntheticEvent = {
            ctrlKey: event.ctrlKey || event.metaKey,
            metaKey: event.metaKey,
            stopPropagation: () => { }
          };

          handleLegendClick(seriesLabel, syntheticEvent);

          d3.select(hoverCircles[index].node())
            .transition()
            .duration(200)
            .attr('r', 8)
            .transition()
            .duration(200)
            .attr('r', 5);
        })
        .on('mouseenter', function (event) {
          event.stopPropagation();

          isOverCircle = true;

          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }

          d3.select(hoverCircles[index].node())
            .transition()
            .duration(100)
            .attr('r', 7)
            .attr('stroke-width', 3);
        })
        .on('mouseleave', function (event) {
          event.stopPropagation();

          isOverCircle = false;

          d3.select(hoverCircles[index].node())
            .transition()
            .duration(100)
            .attr('r', 5)
            .attr('stroke-width', 2);

          hideTimeout = setTimeout(() => {
            if (!isOverCircle) {
              hideAllElements();
            }
          }, 150);
        });
    });

    overlay
      .on('mousemove', function (event) {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }

        const [mouseX] = d3.pointer(event);
        const date = xScale.invert(mouseX);

        crosshair
          .attr('x1', mouseX)
          .attr('x2', mouseX)
          .style('display', null)
          .transition()
          .duration(100)
          .style('opacity', 1);

        const nearestPoints = datasets.map((dataset) => {
          const bisect = d3.bisector((d) => d.date).left;
          const index = bisect(dataset.data, date, 1);
          const d0 = dataset.data[index - 1];
          const d1 = dataset.data[index];
          if (!d0) return { dataset, point: d1 };
          if (!d1) return { dataset, point: d0 };
          const point = date - d0.date > d1.date - date ? d1 : d0;
          return { dataset, point };
        });

        nearestPoints.forEach(({ point }, index) => {
          if (point) {
            const cx = xScale(point.date);
            const cy = yScale(point.value);

            hoverCircles[index]
              .attr('cx', cx)
              .attr('cy', cy)
              .style('display', null)
              .transition()
              .duration(100)
              .style('opacity', 1);

            clickCircles[index]
              .attr('cx', cx)
              .attr('cy', cy)
              .style('display', null);
          }
        });

        showTooltip(event, nearestPoints);
      })
      .on('mouseleave', function () {
        hideTimeout = setTimeout(() => {
          if (!isOverCircle) {
            hideAllElements();
          }
        }, 200);
      });
  }, [showTooltip, hideTooltip, handleLegendClick]);

  // Main D3 rendering logic
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0 || !chartData) return;

    try {
      if (!chartData?.datasets || chartData.datasets.length === 0) {
        throw new Error('No data available');
      }

      const datasets = chartData.datasets.map((dataset, index) => {
        if (!dataset.data || dataset.data.length === 0) {
          throw new Error(`Dataset "${dataset.label}" has no data`);
        }

        const parsedData = dataset.data.map((point) => {
          try {
            return {
              date: new Date(point.dt),
              value: parseFloat(point.v),
            };
          } catch (err) {
            throw new Error(`Invalid data point in dataset "${dataset.label}"`);
          }
        });

        parsedData.sort((a, b) => a.date - b.date);

        return {
          label: dataset.label || `Series ${index + 1}`,
          color: dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
          data: parsedData,
        };
      });

      setError(null);

      const filteredDatasets = selectedSeries
        ? datasets.filter(d => selectedSeries.has(d.label))
        : datasets;

      d3.select(svgRef.current).selectAll('*').remove();

      const margin = { top: 30, right: 80, bottom: 70, left: 70 };
      const width = dimensions.width - margin.left - margin.right;
      const height = dimensions.height - margin.top - margin.bottom;

      const svg = d3
        .select(svgRef.current)
        .attr('width', dimensions.width)
        .attr('height', dimensions.height);

      const g = svg
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      const allDates = datasets.flatMap((d) => d.data.map((p) => p.date));
      const xDomain = d3.extent(allDates);

      const allValues = datasets.flatMap((d) => d.data.map((p) => p.value));
      const minValue = Math.min(...allValues);
      const maxValue = Math.max(...allValues);
      const padding = (maxValue - minValue) * 0.1;
      const yDomain = [
        Math.max(0, minValue - padding),
        maxValue + padding,
      ];

      const xScale = d3.scaleTime().domain(xDomain).range([0, width]);
      const yScale = d3.scaleLinear().domain(yDomain).range([height, 0]);

      const xAxis = d3.axisBottom(xScale).ticks(6).tickSizeOuter(0);
      const yAxis = d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => `${d}`)
        .tickSizeOuter(0);

      g.append('g')
        .attr('class', styles.grid)
        .attr('opacity', 0.1)
        .call(
          d3
            .axisLeft(yScale)
            .ticks(5)
            .tickSize(-width)
            .tickFormat('')
        );

      g.append('g')
        .attr('class', styles.xAxis)
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

      g.append('text')
        .attr('class', styles.axisLabel)
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + 50)
        .text('Time');

      g.append('g')
        .attr('class', styles.yAxis)
        .call(yAxis);

      // Add Y-axis label with unit
      if (chartData.unit) {
        g.append('text')
          .attr('class', styles.yAxisLabel)
          .attr('x', 0)
          .attr('y', -15)
          .text(chartData.unit);
      }

      renderLine(g, filteredDatasets, xScale, yScale);
      addInteractivity(g, filteredDatasets, xScale, yScale, width, height);

    } catch (err) {
      console.error('Chart rendering error:', err);
      setError(err.message);
    }
  }, [dimensions, chartData, selectedSeries, DEFAULT_COLORS, renderLine, addInteractivity]);

  // Generate chart title from chartData or use default
  const getChartTitle = () => {
    // Use the title and context from chartData if available (comes from view.title in the API response)
    if (chartData?.title && chartData?.context) {
      return `${chartData.title} (${chartData.context})`;
    }

    // Fallback to "Load Chart" when data isn't ready yet
    return 'Load Chart';
  };

  const isWaitingForData = !toolResult || !toolResult.text;

  if (isWaitingForData || (loading && !summary)) {
    return (
      <div ref={containerRef} className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{getChartTitle()}</h3>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingContent}>
            <NetdataSpinner size={40} />
            <div className={styles.loadingText}>Loading chart data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{getChartTitle()}</h3>
        </div>
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon}>⚠️</span>
          <span>Chart Error: {error}</span>
        </div>
      </div>
    );
  }

  const { groupByOptions, filterOptions } = getAvailableOptions();
  const hasFilterOptions = groupByOptions.length > 0 || Object.keys(filterOptions).length > 0;

  return (
    <div ref={containerRef} className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitleRow}>
          <h3 className={styles.chartTitle}>{getChartTitle()}</h3>
          {/* Send to Dashboard Button */}
          <button
            className={`${styles.sendToDashboardButton} ${sentToDashboard ? styles.sent : ''}`}
            onClick={handleSendToDashboard}
            title={sentToDashboard ? 'Sent!' : 'Send to Dashboard'}
          >
            {sentToDashboard ? 'Sent!' : '+ Dashboard'}
          </button>
        </div>

        {/* Filters & Grouping Panel */}
        {hasFilterOptions && (
          <div className={styles.filterPanel}>
            <div className={styles.filterPanelHeader}>
              <button
                className={styles.filterPanelToggle}
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              >
                <span className={styles.filterPanelToggleIcon}>
                  {isFilterPanelOpen ? '▼' : '▶'}
                </span>
                <span className={styles.filterPanelTitle}>Filters & Grouping</span>
              </button>
              {hasChanges && (
                <button
                  className={styles.resetButton}
                  onClick={handleReset}
                  title="Reset to original configuration"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Active selections shown as tags when collapsed */}
            {!isFilterPanelOpen && (activeGroupBy.length > 0 || Object.keys(activeFilters).length > 0) && (
              <div className={styles.activeSelections}>
                {/* Group By Tags */}
                {activeGroupBy.map(group => (
                  <div key={group} className={styles.activeTag}>
                    <span className={styles.activeTagPrefix}>Group:</span>
                    <span className={styles.activeTagValue}>{group}</span>
                    <button
                      className={styles.activeTagRemove}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveGroupBy(group);
                      }}
                      title={`Remove ${group} grouping`}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Filter Tags */}
                {Object.entries(activeFilters).map(([filterLabel, values]) =>
                  values.map(value => (
                    <div key={`${filterLabel}-${value}`} className={styles.activeTag}>
                      <span className={styles.activeTagPrefix}>{filterLabel}:</span>
                      <span className={styles.activeTagValue}>
                        {getFilterDisplayName(filterLabel, value)}
                      </span>
                      <button
                        className={styles.activeTagRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFilter(filterLabel, value);
                        }}
                        title={`Remove ${filterLabel} filter`}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {isFilterPanelOpen && (
              <div className={styles.filterPanelContent}>
                {/* Group By Section */}
                {groupByOptions.length > 0 && (
                  <div className={styles.filterSection}>
                    <div className={styles.filterSectionTitle}>Group By</div>
                    <div className={styles.filterChips}>
                      {groupByOptions.map(option => (
                        <label key={option.label} className={styles.filterChip}>
                          <input
                            type="checkbox"
                            checked={activeGroupBy.includes(option.label)}
                            onChange={(e) => handleGroupByChange(option.label, e.target.checked)}
                            className={styles.filterCheckbox}
                          />
                          <span className={styles.filterChipLabel}>{option.displayName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filter By Section */}
                {Object.keys(filterOptions).length > 0 && (
                  <div className={styles.filterSection}>
                    <div className={styles.filterSectionTitle}>Filter By</div>
                    <div className={styles.filterGroupsContainer}>
                      {Object.entries(filterOptions).map(([filterLabel, options]) => (
                        <div key={filterLabel} className={styles.filterGroup}>
                          <div className={styles.filterGroupTitle}>{filterLabel}</div>
                          <div className={styles.filterChipsScrollable}>
                            {options.map(option => {
                              const isChecked = activeFilters[filterLabel]?.includes(option.value) || false;
                              return (
                                <label key={option.value} className={styles.filterChip}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => handleFilterChange(filterLabel, option.value, e.target.checked)}
                                    className={styles.filterCheckbox}
                                  />
                                  <span className={styles.filterChipLabel}>{option.displayName}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {chartData?.datasets && chartData.datasets.length > 0 && (
          <div className={styles.legendWrapper}>
            <div className={styles.legend}>
              {[...chartData.datasets]
                .sort((a, b) => {
                  const labelA = a.label || '';
                  const labelB = b.label || '';
                  return labelA.localeCompare(labelB);
                })
                .map((dataset, index) => {
                  const seriesLabel = dataset.label || `Series ${index + 1}`;
                  const isSelected = isSeriesSelected(seriesLabel);

                  return (
                    <div
                      key={index}
                      className={`${styles.legendItem} ${!isSelected ? styles.legendItemInactive : ''}`}
                      onClick={(e) => handleLegendClick(seriesLabel, e)}
                      style={{ cursor: 'pointer' }}
                      title={`Click to select only ${seriesLabel}, Ctrl+Click to toggle`}
                    >
                      <span
                        className={styles.legendColor}
                        style={{
                          backgroundColor:
                            dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                          opacity: isSelected ? 1 : 0.3,
                        }}
                      ></span>
                      <span className={styles.legendLabel}>{seriesLabel}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
        </div>
      )}

      <div className={styles.chartWrapper}>
        <svg ref={svgRef} className={styles.chartSvg}></svg>
      </div>
      {tooltip.visible && tooltip.content && ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          className={styles.tooltip}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          <div className={styles.tooltipDate}>{tooltip.content.timestamp}</div>
          {tooltip.content.dataRows.map((row, index) => (
            <div key={index} className={styles.tooltipRow}>
              <span
                className={styles.tooltipColor}
                style={{ backgroundColor: row.color }}
              ></span>
              <span className={styles.tooltipLabel}>{row.label}:</span>
              <span className={styles.tooltipValue}>{row.value}</span>
            </div>
          ))}
          {tooltip.content.hasMore && (
            <div className={styles.tooltipMore}>
              +{tooltip.content.moreCount} more series
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Dashboard picker for multiple dashboards */}
      {dashboardPicker && (
        <DashboardPicker
          dashboards={dashboardPicker.dashboards}
          onSelect={handleDashboardSelect}
          onCancel={handleDashboardPickerCancel}
          onHighlight={highlightDashboard}
          position={dashboardPicker.position}
        />
      )}
    </div>
  );
};

export default LoadChartBlock;
