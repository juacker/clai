import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3';
import styles from './BarChartBlock.module.css';

/**
 * BarChartBlock Component
 *
 * Renders a custom bar chart using D3.js for comparing values across categories.
 * Supports grouped and stacked bar charts with responsive design and interactive features.
 *
 * @param {Object} props - Component props
 * @param {Object} props.toolInput - Chart configuration and data
 * @param {string} props.toolInput.title - Chart title
 * @param {string} props.toolInput.unit - Unit of measurement
 * @param {boolean} props.toolInput.stacked - Whether to stack bars
 * @param {Array} props.toolInput.datasets - Array of data series
 * @param {string} props.toolInput.x_axis_label - X-axis label
 * @param {string} props.toolInput.y_axis_label - Y-axis label
 * @param {Object} props.toolResult - Tool execution result
 */
const BarChartBlock = ({ toolInput, toolResult }) => {
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

    // Extract all unique categories from all datasets
    const categoriesSet = new Set();
    toolInput.datasets.forEach((dataset) => {
      if (!dataset.data || dataset.data.length === 0) {
        throw new Error(`Dataset "${dataset.label}" has no data`);
      }
      dataset.data.forEach((point) => {
        categoriesSet.add(point.label);
      });
    });

    const categories = Array.from(categoriesSet);

    // Parse datasets with proper structure
    const parsedDatasets = toolInput.datasets.map((dataset, index) => {
      const dataMap = new Map();
      dataset.data.forEach((point) => {
        dataMap.set(point.label, {
          value: parseFloat(point.v),
          color: point.color || null,
        });
      });

      return {
        label: dataset.label || `Series ${index + 1}`,
        color: dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        dataMap,
      };
    });

    return { categories, datasets: parsedDatasets };
  }, [toolInput]);

  // Main D3 rendering logic
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) {
      return;
    }

    try {
      const { categories, datasets } = parseData();
      setError(null);

      // Filter datasets based on selection
      const filteredDatasets = selectedSeries
        ? datasets.filter(d => selectedSeries.has(d.label))
        : datasets;

      if (filteredDatasets.length === 0) {
        console.warn('BarChart: No datasets to render after filtering');
        return;
      }

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

      // Create scales
      const x0 = d3.scaleBand()
        .domain(categories)
        .range([0, width])
        .padding(0.2);

      const x1 = d3.scaleBand()
        .domain(filteredDatasets.map(d => d.label))
        .range([0, x0.bandwidth()])
        .padding(0.05);

      // Calculate Y domain based on filtered datasets
      let yDomain;
      if (toolInput.stacked) {
        // For stacked bars, sum values at each category
        const maxStackedValue = Math.max(...categories.map(category => {
          return filteredDatasets.reduce((sum, dataset) => {
            const data = dataset.dataMap.get(category);
            return sum + (data ? data.value : 0);
          }, 0);
        }));
        yDomain = [0, maxStackedValue * 1.1];
      } else {
        // For grouped bars, find max individual value
        const allValues = filteredDatasets.flatMap(dataset =>
          Array.from(dataset.dataMap.values()).map(d => d.value)
        );
        const maxValue = Math.max(...allValues);
        yDomain = [0, maxValue * 1.1];
      }

      const yScale = d3.scaleLinear()
        .domain(yDomain)
        .range([height, 0]);

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

      // Add X axis
      const xAxis = d3.axisBottom(x0).tickSizeOuter(0);
      g.append('g')
        .attr('class', styles.xAxis)
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em');

      // Add Y axis
      const yAxis = d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => `${d}${toolInput.unit || ''}`)
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

      // Render bars with filtered datasets
      if (toolInput.stacked) {
        renderStackedBars(g, categories, filteredDatasets, x0, yScale, height);
      } else {
        renderGroupedBars(g, categories, filteredDatasets, x0, x1, yScale, height);
      }

    } catch (err) {
      console.error('Chart rendering error:', err);
      setError(err.message);
    }
  }, [dimensions, toolInput, parseData, selectedSeries]);

  // Render grouped bars
  const renderGroupedBars = (g, categories, datasets, x0, x1, yScale, height) => {
    const categoryGroups = g.selectAll('.category-group')
      .data(categories)
      .enter()
      .append('g')
      .attr('class', 'category-group')
      .attr('transform', d => `translate(${x0(d)},0)`);

    datasets.forEach((dataset) => {
      categoryGroups.each(function (category) {
        const data = dataset.dataMap.get(category);
        if (!data) return;

        const barColor = data.color || dataset.color;
        const barHeight = height - yScale(data.value);

        d3.select(this)
          .append('rect')
          .attr('class', styles.bar)
          .attr('x', x1(dataset.label))
          .attr('y', yScale(data.value))
          .attr('width', x1.bandwidth())
          .attr('height', barHeight)
          .attr('fill', barColor)
          .attr('data-category', category)
          .attr('data-series', dataset.label)
          .attr('data-value', data.value)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this)
              .transition()
              .duration(150)
              .attr('opacity', 0.8);

            showTooltip(event, {
              category,
              series: dataset.label,
              value: data.value,
              color: barColor,
            });
          })
          .on('mouseout', function () {
            d3.select(this)
              .transition()
              .duration(150)
              .attr('opacity', 1);

            hideTooltip();
          });
      });
    });
  };

  // Render stacked bars
  const renderStackedBars = (g, categories, datasets, x0, yScale, height) => {
    categories.forEach((category) => {
      let cumulativeHeight = 0;

      datasets.forEach((dataset) => {
        const data = dataset.dataMap.get(category);
        if (!data) return;

        const barColor = data.color || dataset.color;
        const barHeight = height - yScale(data.value);
        const y = yScale(cumulativeHeight + data.value);

        g.append('rect')
          .attr('class', styles.bar)
          .attr('x', x0(category))
          .attr('y', y)
          .attr('width', x0.bandwidth())
          .attr('height', barHeight)
          .attr('fill', barColor)
          .attr('data-category', category)
          .attr('data-series', dataset.label)
          .attr('data-value', data.value)
          .style('cursor', 'pointer')
          .on('mouseover', function (event) {
            d3.select(this)
              .transition()
              .duration(150)
              .attr('opacity', 0.8);

            showTooltip(event, {
              category,
              series: dataset.label,
              value: data.value,
              color: barColor,
            });
          })
          .on('mouseout', function () {
            d3.select(this)
              .transition()
              .duration(150)
              .attr('opacity', 1);

            hideTooltip();
          });

        cumulativeHeight += data.value;
      });
    });
  };

  // Show tooltip with bar data and smart positioning
  const showTooltip = useCallback((event, data) => {
    if (!data) return;

    const offset = 15;
    const padding = 10;

    let left = event.clientX + offset;
    let top = event.clientY - offset;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const tooltipWidth = 220;
    const tooltipHeight = 100;

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
        category: data.category,
        series: data.series,
        value: `${data.value.toFixed(2)}${toolInput?.unit || ''}`,
        color: data.color,
      },
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
  // Once we have data, render the container so dimensions can be calculated
  // The D3 rendering useEffect will handle waiting for dimensions internally
  if (isWaitingForData) {
    return (
      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>{toolInput?.title || 'Bar Chart'}</h3>
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
        <h3 className={styles.chartTitle}>{toolInput?.title || 'Bar Chart'}</h3>
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
          <div className={styles.tooltipCategory}>{tooltip.content.category}</div>
          <div className={styles.tooltipRow}>
            <span
              className={styles.tooltipColor}
              style={{ backgroundColor: tooltip.content.color }}
            ></span>
            <span className={styles.tooltipLabel}>{tooltip.content.series}:</span>
            <span className={styles.tooltipValue}>{tooltip.content.value}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default BarChartBlock;

