import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3';
import styles from './TimeSeriesChartBlock.module.css';

/**
 * TimeSeriesChartBlock Component
 *
 * Renders a custom time-series chart using D3.js for monitoring data visualization.
 * Supports line and area charts with stacking capabilities, responsive design, and
 * interactive features like tooltips and crosshairs.
 *
 * @param {Object} props - Component props
 * @param {Object} props.toolInput - Chart configuration and data
 * @param {string} props.toolInput.title - Chart title
 * @param {string} props.toolInput.chart_type - 'line' or 'area'
 * @param {boolean} props.toolInput.stacked - Whether to stack area charts
 * @param {string} props.toolInput.unit - Unit of measurement
 * @param {Array} props.toolInput.datasets - Array of data series
 * @param {string} props.toolInput.x_axis_label - X-axis label
 * @param {string} props.toolInput.y_axis_label - Y-axis label
 * @param {Object} props.toolResult - Tool execution result
 */
const TimeSeriesChartBlock = ({ toolInput, toolResult }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  });
  // State for selected series (null = all visible, Set = only selected visible)
  const [selectedSeries, setSelectedSeries] = useState(null);

  // Default color palette for chart series
  const DEFAULT_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];

  // Handle container resizing with ResizeObserver
  // Important: This must re-run when toolResult changes because the container
  // only exists after we exit the loading state
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

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

    // Immediately calculate dimensions
    const width = containerRef.current.clientWidth;
    if (width > 0) {
      const height = Math.min(400, Math.max(250, width * 0.5));
      setDimensions({ width, height });
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [toolResult]); // Re-run when toolResult changes (when we exit loading state)

  // Parse and validate data
  const parseData = useCallback(() => {
    if (!toolInput || !toolInput.datasets || toolInput.datasets.length === 0) {
      throw new Error('No data provided');
    }

    const parsedDatasets = toolInput.datasets.map((dataset, index) => {
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

    return parsedDatasets;
  }, [toolInput]);

  // Main D3 rendering logic
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    try {
      const datasets = parseData();
      setError(null);

      // Filter datasets based on selection
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

      let yDomain;
      if (toolInput.stacked && toolInput.chart_type === 'area') {
        const timeMap = new Map();
        datasets.forEach((dataset) => {
          dataset.data.forEach((point) => {
            const time = point.date.getTime();
            timeMap.set(time, (timeMap.get(time) || 0) + point.value);
          });
        });
        const maxValue = Math.max(...Array.from(timeMap.values()));
        yDomain = [0, maxValue * 1.1];
      } else {
        const allValues = datasets.flatMap((d) => d.data.map((p) => p.value));
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);
        const padding = (maxValue - minValue) * 0.1;
        yDomain = [
          Math.max(0, minValue - padding),
          maxValue + padding,
        ];
      }

      const xScale = d3.scaleTime().domain(xDomain).range([0, width]);
      const yScale = d3.scaleLinear().domain(yDomain).range([height, 0]);

      const xAxis = d3.axisBottom(xScale).ticks(6).tickSizeOuter(0);
      const yAxis = d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => `${d}${toolInput.unit || ''}`)
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

      g.append('g')
        .attr('class', styles.yAxis)
        .call(yAxis);

      if (toolInput.x_axis_label) {
        g.append('text')
          .attr('class', styles.axisLabel)
          .attr('text-anchor', 'middle')
          .attr('x', width / 2)
          .attr('y', height + 40)
          .text(toolInput.x_axis_label);
      }
      
      if (toolInput.y_axis_label) {
        g.append('text')
          .attr('class', styles.yAxisLabel)
          .attr('x', 0)
          .attr('y', -15)
          .text(toolInput.y_axis_label);
      }

      if (toolInput.chart_type === 'area') {
        if (toolInput.stacked) {
          renderStackedArea(g, filteredDatasets, xScale, yScale, width, height);
        } else {
          renderArea(g, filteredDatasets, xScale, yScale, width, height);
        }
      } else {
        renderLine(g, filteredDatasets, xScale, yScale, width, height);
      }

      addInteractivity(g, filteredDatasets, xScale, yScale, width, height);

    } catch (err) {
      console.error('Chart rendering error:', err);
      setError(err.message);
    }
  }, [dimensions, toolInput, parseData, selectedSeries]);

  // Render line chart
  const renderLine = (g, datasets, xScale, yScale, width, height) => {
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
  };

  // Render area chart (non-stacked)
  const renderArea = (g, datasets, xScale, yScale, width, height) => {
    const area = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(height)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const line = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    datasets.forEach((dataset) => {
      g.append('path')
        .datum(dataset.data)
        .attr('class', styles.area)
        .attr('fill', dataset.color)
        .attr('fill-opacity', 0.3)
        .attr('d', area);

      g.append('path')
        .datum(dataset.data)
        .attr('class', styles.line)
        .attr('fill', 'none')
        .attr('stroke', dataset.color)
        .attr('stroke-width', 2)
        .attr('d', line);
    });
  };

  // Render stacked area chart
  const renderStackedArea = (g, datasets, xScale, yScale, width, height) => {
    const timeMap = new Map();

    datasets.forEach((dataset, datasetIndex) => {
      dataset.data.forEach((point) => {
        const time = point.date.getTime();
        if (!timeMap.has(time)) {
          timeMap.set(time, { date: point.date });
        }
        timeMap.get(time)[`series${datasetIndex}`] = point.value;
      });
    });

    const stackData = Array.from(timeMap.values()).sort((a, b) => a.date - b.date);

    stackData.forEach((d) => {
      datasets.forEach((_, i) => {
        if (d[`series${i}`] === undefined) {
          d[`series${i}`] = 0;
        }
      });
    });

    const keys = datasets.map((_, i) => `series${i}`);
    const stack = d3.stack().keys(keys);
    const series = stack(stackData);

    const area = d3
      .area()
      .x((d) => xScale(d.data.date))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    series.forEach((s, i) => {
      g.append('path')
        .datum(s)
        .attr('class', styles.area)
        .attr('fill', datasets[i].color)
        .attr('fill-opacity', 0.7)
        .attr('d', area);
    });
  };

  // Add interactive features (tooltip, crosshair, hover circles)
  const addInteractivity = (g, datasets, xScale, yScale, width, height) => {
    const crosshair = g
      .append('line')
      .attr('class', styles.crosshair)
      .attr('y1', 0)
      .attr('y2', height)
      .style('display', 'none')
      .style('opacity', 0);

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

    const overlay = g
      .append('rect')
      .attr('class', styles.overlay)
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    overlay
      .on('mousemove', function (event) {
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
            hoverCircles[index]
              .attr('cx', xScale(point.date))
              .attr('cy', yScale(point.value))
              .style('display', null)
              .transition()
              .duration(100)
              .style('opacity', 1);
          }
        });

        showTooltip(event, nearestPoints);
      })
      .on('mouseout', function () {
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

        hideTooltip();
      });
  };

  // Show tooltip with data values and smart positioning
  const showTooltip = useCallback((event, nearestPoints) => {
    if (!nearestPoints || nearestPoints.length === 0) return;

    const validPoints = nearestPoints.filter(np => np && np.point);
    if (validPoints.length === 0) return;

    const timestamp = d3.timeFormat('%Y-%m-%d %H:%M:%S %z')(validPoints[0].point.date);

    const dataRows = validPoints.map(({ dataset, point }) => ({
      color: dataset.color,
      label: dataset.label,
      value: `${point.value.toFixed(2)}${toolInput?.unit || ''}`,
    }));

    const offset = 15;
    const padding = 10;

    let left = event.clientX + offset;
    let top = event.clientY - offset;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const tooltipWidth = 280;
    const tooltipHeight = 80 + (dataRows.length * 30);

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
      content: { timestamp, dataRows },
    });
  }, [toolInput?.unit]);

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
      // If nothing is selected, select only this series
      if (!prevSelected) {
        return new Set([seriesLabel]);
      }

      // If Ctrl/Cmd is pressed, toggle the series in the selection
      if (isCtrlOrCmd) {
        const newSelected = new Set(prevSelected);
        if (newSelected.has(seriesLabel)) {
          newSelected.delete(seriesLabel);
          // If all series are deselected, show all
          return newSelected.size === 0 ? null : newSelected;
        } else {
          newSelected.add(seriesLabel);
          return newSelected;
        }
      }

      // If clicking on the only selected series, deselect it (show all)
      if (prevSelected.size === 1 && prevSelected.has(seriesLabel)) {
        return null;
      }

      // Otherwise, select only this series
      return new Set([seriesLabel]);
    });
  }, []);

  // Check if a series is selected
  const isSeriesSelected = useCallback((seriesLabel) => {
    if (!selectedSeries) return true; // All visible when nothing selected
    return selectedSeries.has(seriesLabel);
  }, [selectedSeries]);

  // Check if we're waiting for tool result during streaming
  // toolResult should exist and have valid content before rendering
  const isWaitingForData = !toolResult || !toolResult.text;

  // Show loading state only if waiting for data
  if (isWaitingForData) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{toolInput?.title || 'Time Series Chart'}</h3>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingContent}>
            <div className={styles.loadingSpinner}></div>
            <div className={styles.loadingText}>Waiting for chart data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.chartContainer}>
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
        <h3 className={styles.chartTitle}>{toolInput?.title || 'Time Series Chart'}</h3>
        {toolInput?.datasets && toolInput.datasets.length > 0 && (
          <div className={styles.legend}>
            {toolInput.datasets.map((dataset, index) => {
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default TimeSeriesChartBlock;
