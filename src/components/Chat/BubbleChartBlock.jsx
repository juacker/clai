import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3';
import styles from './BubbleChartBlock.module.css';

/**
 * BubbleChartBlock Component
 *
 * Renders a custom bubble chart using D3.js to visualize three quantitative dimensions simultaneously.
 * Each bubble's horizontal position (x), vertical position (y), and size (radius) represents different metrics.
 *
 * @param {Object} props - Component props
 * @param {Object} props.toolInput - Chart configuration and data
 * @param {string} props.toolInput.title - Chart title
 * @param {string} props.toolInput.x_axis_label - X-axis label
 * @param {string} props.toolInput.y_axis_label - Y-axis label
 * @param {string} props.toolInput.size_label - Label describing what bubble size represents
 * @param {string} props.toolInput.x_unit - Optional unit for X-axis values
 * @param {string} props.toolInput.y_unit - Optional unit for Y-axis values
 * @param {string} props.toolInput.size_unit - Optional unit for size dimension
 * @param {Array} props.toolInput.datasets - Array of bubble datasets
 * @param {Object} props.toolResult - Tool execution result
 */
const BubbleChartBlock = ({ toolInput, toolResult }) => {
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
  // Netdata chart color palette
  const DEFAULT_COLORS = [
    '#00AB44',  // Netdata Green
    '#00B5D8',  // Netdata Teal
    '#3498DB',  // Sky Blue
    '#9B59B6',  // Purple
    '#F39C12',  // Orange
    '#E74C3C',  // Red
    '#1ABC9C',  // Turquoise
    '#34495E',  // Dark Gray
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
        const height = Math.min(450, Math.max(300, width * 0.6));
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Immediately calculate dimensions
    const width = containerRef.current.clientWidth;
    if (width > 0) {
      const height = Math.min(450, Math.max(300, width * 0.6));
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

    // Parse datasets with proper structure
    const parsedDatasets = toolInput.datasets.map((dataset, index) => {
      if (!dataset.data || dataset.data.length === 0) {
        throw new Error(`Dataset "${dataset.label}" has no data`);
      }

      const bubbles = dataset.data.map((point) => {
        if (point.x === undefined || point.y === undefined || point.r === undefined) {
          throw new Error(`Invalid bubble data in dataset "${dataset.label}"`);
        }

        return {
          x: parseFloat(point.x),
          y: parseFloat(point.y),
          r: parseFloat(point.r),
          label: point.label || '',
          color: point.color || null,
        };
      });

      return {
        label: dataset.label || `Series ${index + 1}`,
        color: dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        bubbles,
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

      // Collect all bubbles from filtered datasets
      const allBubbles = filteredDatasets.flatMap(dataset =>
        dataset.bubbles.map(bubble => ({ ...bubble, datasetLabel: dataset.label, datasetColor: dataset.color }))
      );

      if (allBubbles.length === 0) {
        throw new Error('No bubbles to display');
      }

      // Create scales
      const xExtent = d3.extent(allBubbles, d => d.x);
      const yExtent = d3.extent(allBubbles, d => d.y);
      const rExtent = d3.extent(allBubbles, d => d.r);

      // Add padding to extents
      const xPadding = (xExtent[1] - xExtent[0]) * 0.1 || 1;
      const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;

      const xScale = d3.scaleLinear()
        .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
        .range([0, width]);

      const yScale = d3.scaleLinear()
        .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
        .range([height, 0]);

      // Scale for bubble radius (area-based scaling for better perception)
      const rScale = d3.scaleSqrt()
        .domain(rExtent)
        .range([4, 30]); // Min and max pixel radius

      // Add grid lines
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
        .attr('class', styles.grid)
        .attr('opacity', 0.1)
        .attr('transform', `translate(0,${height})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(5)
            .tickSize(-height)
            .tickFormat('')
        );

      // Add X axis
      const xAxis = d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d => `${d}${toolInput.x_unit || ''}`)
        .tickSizeOuter(0);

      g.append('g')
        .attr('class', styles.xAxis)
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

      // Add Y axis
      const yAxis = d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => `${d}${toolInput.y_unit || ''}`)
        .tickSizeOuter(0);

      g.append('g')
        .attr('class', styles.yAxis)
        .call(yAxis);

      // Add axis labels
      if (toolInput.x_axis_label) {
        g.append('text')
          .attr('class', styles.axisLabel)
          .attr('text-anchor', 'end')
          .attr('x', width)
          .attr('y', height + 45)
          .text(toolInput.x_axis_label);
      }
      
      if (toolInput.y_axis_label) {
        g.append('text')
          .attr('class', styles.yAxisLabel)
          .attr('x', 0)
          .attr('y', -15)
          .text(toolInput.y_axis_label);
      }

      // Render bubbles
      filteredDatasets.forEach((dataset) => {
        const bubbleGroup = g.append('g')
          .attr('class', 'bubble-group');

        dataset.bubbles.forEach((bubble) => {
          const bubbleColor = bubble.color || dataset.color;
          const cx = xScale(bubble.x);
          const cy = yScale(bubble.y);
          const r = rScale(bubble.r);

          // Create bubble with glow effect
          bubbleGroup.append('circle')
            .attr('class', styles.bubble)
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', r)
            .attr('fill', bubbleColor)
            .attr('fill-opacity', 0.6)
            .attr('stroke', bubbleColor)
            .attr('stroke-width', 2)
            .attr('data-label', bubble.label)
            .attr('data-series', dataset.label)
            .style('cursor', 'pointer')
            .on('mouseover', function (event) {
              d3.select(this)
                .transition()
                .duration(150)
                .attr('fill-opacity', 0.9)
                .attr('stroke-width', 3);

              showTooltip(event, {
                label: bubble.label,
                series: dataset.label,
                x: bubble.x,
                y: bubble.y,
                r: bubble.r,
                color: bubbleColor,
              });
            })
            .on('mouseout', function () {
              d3.select(this)
                .transition()
                .duration(150)
                .attr('fill-opacity', 0.6)
                .attr('stroke-width', 2);

              hideTooltip();
            });

          // Add label if bubble is large enough
          if (r > 15 && bubble.label) {
            bubbleGroup.append('text')
              .attr('class', styles.bubbleLabel)
              .attr('x', cx)
              .attr('y', cy)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'middle')
              .attr('pointer-events', 'none')
              .style('font-size', `${Math.min(r / 3, 11)}px`)
              .text(bubble.label);
          }
        });
      });

    } catch (err) {
      console.error('Chart rendering error:', err);
      setError(err.message);
    }
  }, [dimensions, toolInput, parseData, selectedSeries]);

  // Show tooltip with bubble data and smart positioning
  const showTooltip = useCallback((event, data) => {
    if (!data) return;

    const offset = 15;
    const padding = 10;

    let left = event.clientX + offset;
    let top = event.clientY - offset;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const tooltipWidth = 240;
    const tooltipHeight = 140;

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
      content: {
        label: data.label,
        series: data.series,
        x: `${data.x.toFixed(2)}${toolInput?.x_unit || ''}`,
        y: `${data.y.toFixed(2)}${toolInput?.y_unit || ''}`,
        r: `${data.r.toFixed(2)}${toolInput?.size_unit || ''}`,
        color: data.color,
      },
    });
  }, [toolInput?.x_unit, toolInput?.y_unit, toolInput?.size_unit]);

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
  // Once we have data, render the container so dimensions can be calculated
  // The D3 rendering useEffect will handle waiting for dimensions internally
  if (isWaitingForData) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{toolInput?.title || 'Bubble Chart'}</h3>
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
        <h3 className={styles.chartTitle}>{toolInput?.title || 'Bubble Chart'}</h3>
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
          {tooltip.content.label && (
            <div className={styles.tooltipLabel}>{tooltip.content.label}</div>
          )}
          <div className={styles.tooltipSeries}>
            <span
              className={styles.tooltipColor}
              style={{ backgroundColor: tooltip.content.color }}
            ></span>
            <span>{tooltip.content.series}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipKey}>{toolInput?.x_axis_label || 'X'}:</span>
            <span className={styles.tooltipValue}>{tooltip.content.x}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipKey}>{toolInput?.y_axis_label || 'Y'}:</span>
            <span className={styles.tooltipValue}>{tooltip.content.y}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipKey}>{toolInput?.size_label || 'Size'}:</span>
            <span className={styles.tooltipValue}>{tooltip.content.r}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default BubbleChartBlock;

