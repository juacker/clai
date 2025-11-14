import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3';
import { getData } from '../../api/client';
import styles from './LoadChartBlock.module.css';

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
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  });
  const [selectedSeries, setSelectedSeries] = useState(null);

  const DEFAULT_COLORS = useMemo(() => [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ], []);

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

  // Build getData request params from toolInput
  const buildGetDataParams = useCallback((input) => {
    const nodeIDs = [];
    const dimensions = [];
    const instances = [];
    const labels = [];

    if (input.filter_by && Array.isArray(input.filter_by)) {
      input.filter_by.forEach(filter => {
        switch (filter.label) {
          case 'node':
            nodeIDs.push(filter.value);
            break;
          case 'dimension':
            dimensions.push(filter.value);
            break;
          case 'instance':
            instances.push(filter.value);
            break;
          default:
            labels.push(`${filter.label}:${filter.value}`);
            break;
        }
      });
    }

    const systemLabels = ['node', 'dimension', 'instance'];
    const groupedBy = [];
    const groupedByLabel = [];

    if (input.group_by && Array.isArray(input.group_by)) {
      input.group_by.forEach(label => {
        if (systemLabels.includes(label)) {
          groupedBy.push(label);
        } else {
          if (!groupedBy.includes('label')) {
            groupedBy.push('label');
          }
          groupedByLabel.push(label);
        }
      });
    }

    if (groupedBy.length === 0) {
      groupedBy.push('dimension');
    }

    const afterTimestamp = Math.floor(new Date(input.after).getTime() / 1000);
    const beforeTimestamp = Math.floor(new Date(input.before).getTime() / 1000);

    return {
      scope: {
        contexts: [input.context],
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
            aggregation: input.value_agg || 'avg'
          }
        ],
        time: {
          time_group: input.time_agg || 'average',
          time_resampling: 0
        }
      },
      window: {
        after: afterTimestamp,
        before: beforeTimestamp,
        points: input.interval_count || 15
      }
    };
  }, []);

  const buildNodeMapping = (summary) => {
    const nodeMap = new Map();
    if (summary?.nodes && Array.isArray(summary.nodes)) {
      summary.nodes.forEach(node => {
        if (node.mg && node.nm) {
          nodeMap.set(node.mg, node.nm); // not surprisingly, the mg (machine guid) is the node id here :D
        }
      });
    }
    return nodeMap;
  };

  const replaceNodeIdsInLabel = (label, nodeMap, isGroupedByNode) => {
    if (!isGroupedByNode || nodeMap.size === 0) {
      return label;
    }

    // Replace all node IDs found in the label with their names
    let updatedLabel = label;
    nodeMap.forEach((nodeName, nodeId) => {
      // Use a regex to replace the node ID (UUID format)
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

    // Build node ID to name mapping
    const nodeMap = buildNodeMapping(summary);

    // Check if the request was grouped by node
    const isGroupedByNode = toolInput?.group_by?.includes('node') || false;

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

      // Replace node IDs with node names in the label
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
      unit: unit
    };
  }, [toolInput, DEFAULT_COLORS]);

  // Fetch data from API when toolResult is available
  useEffect(() => {
    if (!toolResult || !toolResult.text) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('netdata_token');
        if (!token) {
          throw new Error('Authentication token not found');
        }

        if (!space?.id || !room?.id) {
          throw new Error('Space ID or Room ID not found. Please select a space and room.');
        }

        const params = buildGetDataParams(toolInput);
        const response = await getData(token, space.id, room.id, params);
        const transformedData = transformResponseToChartData(response);

        setChartData(transformedData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch chart data:', err);
        setError(err.message || 'Failed to load chart data');
        setLoading(false);
      }
    };

    fetchData();
  }, [toolResult?.text, space?.id, room?.id, buildGetDataParams, toolInput, transformResponseToChartData]);

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

    const limitedPoints = validPoints.slice(0, 10);
    const hasMore = validPoints.length > 10;

    const dataRows = limitedPoints.map(({ dataset, point }) => ({
      color: dataset.color,
      label: dataset.label,
      value: `${point.value.toFixed(2)}${chartData?.unit || ''}`,
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

          // Start hide timeout when leaving circle
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
        // Use a timeout to allow moving to circles
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
        .tickFormat((d) => `${d}${chartData.unit || ''}`)
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

      renderLine(g, filteredDatasets, xScale, yScale);
      addInteractivity(g, filteredDatasets, xScale, yScale, width, height);

    } catch (err) {
      console.error('Chart rendering error:', err);
      setError(err.message);
    }
  }, [dimensions, chartData, selectedSeries, DEFAULT_COLORS, renderLine, addInteractivity]);

  // Generate chart title from tool input
  const getChartTitle = () => {
    if (!toolInput) return 'Load Chart';

    const context = toolInput.context || 'metric';
    const filters = toolInput.filter_by || [];
    const groups = toolInput.group_by || [];

    let title = context;

    if (filters.length > 0) {
      const filterStr = filters.map(f => `${f.label}=${f.value}`).join(', ');
      title += ` (${filterStr})`;
    }

    if (groups.length > 0 && groups.length <= 2) {
      title += ` by ${groups.join(', ')}`;
    }

    return title;
  };

  const isWaitingForData = !toolResult || !toolResult.text;

  if (isWaitingForData || loading) {
    return (
      <div ref={containerRef} className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{getChartTitle()}</h3>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingContent}>
            <div className={styles.loadingSpinner}></div>
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

  return (
    <div ref={containerRef} className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{getChartTitle()}</h3>
        {chartData?.datasets && chartData.datasets.length > 0 && (
          <div className={styles.legendWrapper}>
            <div className={styles.legend}>
              {chartData.datasets.map((dataset, index) => {
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
    </div>
  );
};

export default LoadChartBlock;
