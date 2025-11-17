import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import ContextChart from './ContextChart';
import styles from './ChartsView.module.css';
import { createPerformanceMonitor, measureDOMNodes } from '../../utils/performance/performanceMonitor';
import { useDebounce } from '../../hooks/useDebounce';

// Memoized FilterChip component to prevent unnecessary re-renders
const FilterChip = React.memo(({
  option,
  filterLabel,
  isChecked,
  onFilterChange
}) => {
  const handleChange = useCallback((e) => {
    onFilterChange(filterLabel, option.value, e.target.checked);
  }, [filterLabel, option.value, onFilterChange]);

  return (
    <label className={styles.globalFilterChip}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={handleChange}
        className={styles.globalFilterCheckbox}
      />
      <span className={styles.globalFilterChipLabel}>{option.displayName}</span>
    </label>
  );
});

// Memoized FilterPanelContent component for better performance
// PHASE 2: Added search functionality with filtering
const FilterPanelContent = React.memo(({
  groupByOptions,
  filterOptions,
  globalGroupBy,
  globalFilterBy,
  onGroupByChange,
  onFilterChange,
  searchQuery,
  onSearchChange
}) => {
  return (
    <>
      {/* PHASE 2: Search Input */}
      <div className={styles.globalFilterSearchContainer}>
        <input
          type="text"
          className={styles.globalFilterSearchInput}
          placeholder="Search filters..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
        {searchQuery && (
          <button
            className={styles.globalFilterSearchClear}
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Group By Section */}
      {groupByOptions.length > 0 && (
        <div className={styles.globalFilterSection}>
          <div className={styles.globalFilterSectionTitle}>Group By</div>
          <div className={styles.globalFilterChips}>
            {groupByOptions.map(option => (
              <label key={option.label} className={styles.globalFilterChip}>
                <input
                  type="checkbox"
                  checked={globalGroupBy.includes(option.label)}
                  onChange={(e) => onGroupByChange(option.label, e.target.checked)}
                  className={styles.globalFilterCheckbox}
                />
                <span className={styles.globalFilterChipLabel}>{option.displayName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Filter By Section */}
      {Object.keys(filterOptions).length > 0 && (
        <div className={styles.globalFilterSection}>
          <div className={styles.globalFilterSectionTitle}>Filter By</div>
          <div className={styles.globalFilterGroupsContainer}>
            {Object.entries(filterOptions).map(([filterLabel, options]) => (
              <div key={filterLabel} className={styles.globalFilterGroup}>
                <div className={styles.globalFilterGroupTitle}>{filterLabel}</div>
                <div className={styles.globalFilterChipsScrollable}>
                  {options.map(option => {
                    const isChecked = globalFilterBy[filterLabel]?.includes(option.value) || false;
                    return (
                      <FilterChip
                        key={option.value}
                        option={option}
                        filterLabel={filterLabel}
                        isChecked={isChecked}
                        onFilterChange={onFilterChange}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

/**
 * ChartsView Component
 *
 * Container for displaying multiple context charts with global controls.
 * Provides global time interval, filters, and grouping that can be applied to all charts.
 *
 * @param {Object} props - Component props
 * @param {Set<string>} props.selectedContexts - Set of selected context names to display
 * @param {Function} props.onRemoveContext - Callback when a context is removed
 * @param {Function} props.onClearAll - Callback to clear all contexts
 */
const ChartsView = ({ selectedContexts, onRemoveContext, onClearAll }) => {
  const { selectedSpace, selectedRoom } = useTabContext();

  // Generate a unique instance ID on mount
  const instanceId = useMemo(() => `charts-${Math.random().toString(36).substr(2, 9)}`, []);

  // PHASE 0: Performance monitoring setup
  const perfMonitor = useMemo(() => createPerformanceMonitor('ChartsView'), []);
  const filterPanelRef = useRef(null);

  // Time interval state
  const [timeInterval, setTimeInterval] = useState('15m'); // '15m', '1h', '6h', '24h', 'custom'
  const [customAfter, setCustomAfter] = useState('');
  const [customBefore, setCustomBefore] = useState('');

  // Global filters and grouping state
  const [globalGroupBy, setGlobalGroupBy] = useState([]);
  const [globalFilterBy, setGlobalFilterBy] = useState({});
  const [applyGlobally, setApplyGlobally] = useState(false);
  const [isGlobalPanelOpen, setIsGlobalPanelOpen] = useState(false);

  // Collected summaries from all charts
  const [chartSummaries, setChartSummaries] = useState({});

  // PHASE 2: Search functionality state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // PHASE 0: Performance monitoring for filter panel open/close
  useEffect(() => {
    if (isGlobalPanelOpen) {
      perfMonitor.start('filter-panel-open');
    }
  }, [isGlobalPanelOpen, perfMonitor]);

  useEffect(() => {
    if (isGlobalPanelOpen && filterPanelRef.current) {
      // Measure after render is complete
      requestAnimationFrame(() => {
        perfMonitor.end('filter-panel-open', 100);

        // Measure DOM nodes in development
        if (import.meta.env.DEV) {
          measureDOMNodes(filterPanelRef.current);
        }
      });
    }
  }, [isGlobalPanelOpen, perfMonitor]);

  // Predefined time intervals
  const TIME_INTERVALS = useMemo(() => [
    { value: '15m', label: 'Last 15 minutes', minutes: 15 },
    { value: '1h', label: 'Last hour', minutes: 60 },
    { value: '6h', label: 'Last 6 hours', minutes: 360 },
    { value: '24h', label: 'Last 24 hours', minutes: 1440 },
    { value: '7d', label: 'Last 7 days', minutes: 10080 },
    { value: 'custom', label: 'Custom range', minutes: null },
  ], []);

  // Calculate time range based on selected interval
  const timeRange = useMemo(() => {
    if (timeInterval === 'custom') {
      if (!customAfter || !customBefore) {
        // Default to last 15 minutes if custom range not set
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
        return {
          after: fifteenMinutesAgo.toISOString(),
          before: now.toISOString(),
          intervalCount: 15,
        };
      }
      return {
        after: customAfter,
        before: customBefore,
        intervalCount: 15,
      };
    }

    const selectedInterval = TIME_INTERVALS.find(i => i.value === timeInterval);
    if (!selectedInterval) {
      // Fallback to 15 minutes
      const now = new Date();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      return {
        after: fifteenMinutesAgo.toISOString(),
        before: now.toISOString(),
        intervalCount: 15,
      };
    }

    const now = new Date();
    const before = now.toISOString();
    const after = new Date(now.getTime() - selectedInterval.minutes * 60 * 1000).toISOString();

    // Calculate appropriate interval count based on time range
    let intervalCount = 15;
    if (selectedInterval.minutes <= 60) {
      intervalCount = 15;
    } else if (selectedInterval.minutes <= 360) {
      intervalCount = 20;
    } else if (selectedInterval.minutes <= 1440) {
      intervalCount = 24;
    } else {
      intervalCount = 30;
    }

    return { after, before, intervalCount };
  }, [timeInterval, customAfter, customBefore, TIME_INTERVALS]);

  // Handle time interval change
  const handleTimeIntervalChange = useCallback((value) => {
    setTimeInterval(value);
  }, []);

  // Handle custom time range
  const handleCustomTimeChange = useCallback((field, value) => {
    if (field === 'after') {
      setCustomAfter(value);
    } else if (field === 'before') {
      setCustomBefore(value);
    }
  }, []);

  // Toggle apply globally
  const handleToggleApplyGlobally = useCallback(() => {
    setApplyGlobally(prev => !prev);
  }, []);

  // Callback to receive summary data from charts
  const handleChartSummary = useCallback((context, summary) => {
    setChartSummaries(prev => ({
      ...prev,
      [context]: summary
    }));
  }, []);

  // OPTIMIZATION: Create a stable hash for chart summaries to prevent unnecessary recalculations
  const chartSummariesHash = useMemo(() =>
    JSON.stringify(Object.keys(chartSummaries).sort()),
    [chartSummaries]
  );

  // Aggregate available options from all chart summaries
  // OPTIMIZED: Now only recalculates when charts are added/removed, not on every summary update
  const aggregatedOptions = useMemo(() => {
    const groupByOptionsMap = new Map();
    const filterOptionsMap = new Map();

    Object.values(chartSummaries).forEach(summary => {
      if (!summary) return;

      // Nodes
      if (summary.nodes && summary.nodes.length > 1) {
        groupByOptionsMap.set('node', { label: 'node', displayName: 'Node' });

        if (!filterOptionsMap.has('node')) {
          filterOptionsMap.set('node', new Map());
        }
        const nodeOptions = filterOptionsMap.get('node');
        summary.nodes.forEach(n => {
          nodeOptions.set(n.mg, { value: n.mg, displayName: n.nm || n.mg });
        });
      }

      // Dimensions
      if (summary.dimensions && summary.dimensions.length > 1) {
        groupByOptionsMap.set('dimension', { label: 'dimension', displayName: 'Dimension' });

        if (!filterOptionsMap.has('dimension')) {
          filterOptionsMap.set('dimension', new Map());
        }
        const dimOptions = filterOptionsMap.get('dimension');
        summary.dimensions.forEach(d => {
          dimOptions.set(d.id, { value: d.id, displayName: d.id });
        });
      }

      // Instances
      if (summary.instances && summary.instances.length > 1) {
        groupByOptionsMap.set('instance', { label: 'instance', displayName: 'Instance' });

        if (!filterOptionsMap.has('instance')) {
          filterOptionsMap.set('instance', new Map());
        }
        const instOptions = filterOptionsMap.get('instance');
        summary.instances.forEach(i => {
          instOptions.set(i.id, { value: i.id, displayName: i.id });
        });
      }

      // Custom labels
      if (summary.labels && Array.isArray(summary.labels)) {
        summary.labels.forEach(labelObj => {
          if (labelObj.vl && labelObj.vl.length > 1) {
            groupByOptionsMap.set(labelObj.id, { label: labelObj.id, displayName: labelObj.id });

            if (!filterOptionsMap.has(labelObj.id)) {
              filterOptionsMap.set(labelObj.id, new Map());
            }
            const labelOptions = filterOptionsMap.get(labelObj.id);
            labelObj.vl.forEach(v => {
              labelOptions.set(v.id, { value: v.id, displayName: v.id });
            });
          }
        });
      }
    });

    // Convert maps to arrays and sort
    const groupByOptions = Array.from(groupByOptionsMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    const filterOptions = {};
    filterOptionsMap.forEach((optionsMap, key) => {
      filterOptions[key] = Array.from(optionsMap.values()).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
    });

    return { groupByOptions, filterOptions };
  }, [chartSummariesHash]); // Use hash instead of full chartSummaries object

  // PHASE 2: Filter options based on debounced search query
  const filteredOptions = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return aggregatedOptions;
    }

    const query = debouncedSearchQuery.toLowerCase();

    // Filter groupBy options
    const filteredGroupByOptions = aggregatedOptions.groupByOptions.filter(option =>
      option.displayName.toLowerCase().includes(query)
    );

    // Filter filterBy options
    const filteredFilterOptions = {};
    Object.entries(aggregatedOptions.filterOptions).forEach(([filterLabel, options]) => {
      const filteredOpts = options.filter(option =>
        option.displayName.toLowerCase().includes(query) ||
        filterLabel.toLowerCase().includes(query)
      );

      if (filteredOpts.length > 0) {
        filteredFilterOptions[filterLabel] = filteredOpts;
      }
    });

    return {
      groupByOptions: filteredGroupByOptions,
      filterOptions: filteredFilterOptions
    };
  }, [aggregatedOptions, debouncedSearchQuery]);

  // PHASE 2: Handle search query change
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
  }, []);

  // Handle global group by change
  const handleGlobalGroupByChange = useCallback((label, isChecked) => {
    setGlobalGroupBy(prev => {
      if (isChecked) {
        return [...prev, label];
      } else {
        return prev.filter(l => l !== label);
      }
    });
  }, []);

  // Handle global filter change
  const handleGlobalFilterChange = useCallback((filterLabel, value, isChecked) => {
    setGlobalFilterBy(prev => {
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

  // Remove a specific global group by
  const handleRemoveGlobalGroupBy = useCallback((label) => {
    setGlobalGroupBy(prev => prev.filter(l => l !== label));
  }, []);

  // Remove a specific global filter
  const handleRemoveGlobalFilter = useCallback((filterLabel, value) => {
    setGlobalFilterBy(prev => {
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

  // Clear all global filters
  const handleClearGlobalFilters = useCallback(() => {
    setGlobalGroupBy([]);
    setGlobalFilterBy({});
  }, []);

  // Get display name for a filter value
  const getFilterDisplayName = useCallback((filterLabel, value) => {
    const options = aggregatedOptions.filterOptions[filterLabel];
    if (!options) return value;

    const option = options.find(opt => opt.value === value);
    return option ? option.displayName : value;
  }, [aggregatedOptions]);

  // Convert selectedContexts Set to Array for rendering
  const contextsArray = useMemo(() => {
    return Array.from(selectedContexts);
  }, [selectedContexts]);

  // Memoize the filter object to prevent unnecessary re-renders
  const memoizedGlobalFilterBy = useMemo(() => globalFilterBy, [
    JSON.stringify(globalFilterBy)
  ]);

  // Memoize the groupBy array to prevent unnecessary re-renders
  const memoizedGlobalGroupBy = useMemo(() => globalGroupBy, [
    JSON.stringify(globalGroupBy)
  ]);

  // Check if global filters are active
  const hasGlobalFilters = globalGroupBy.length > 0 || Object.keys(globalFilterBy).length > 0;

  if (contextsArray.length === 0) {
    return (
      <div className={styles.chartsViewWrapper}>
        {/* Header Bar - matches Metrics header style */}
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <h3 className={styles.headerTitle}>Charts View</h3>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.clearAllButton}
              onClick={onClearAll}
              title="Remove all charts"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className={styles.chartsViewContainer}>
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📊</div>
            <h3 className={styles.emptyStateTitle}>No metrics selected</h3>
            <p className={styles.emptyStateText}>
              Select metrics from the Canvas view to visualize them here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chartsViewWrapper}>
      {/* Header Bar - matches Metrics header style */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <h3 className={styles.headerTitle}>Charts View</h3>

          {/* Time Interval Selector */}
          <div className={styles.timeIntervalSelector}>
            {TIME_INTERVALS.map(interval => (
              <button
                key={interval.value}
                className={`${styles.intervalButton} ${timeInterval === interval.value ? styles.active : ''}`}
                onClick={() => handleTimeIntervalChange(interval.value)}
              >
                {interval.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.clearAllButton}
            onClick={onClearAll}
            title="Remove all charts"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Custom Time Range (shown below header when active) */}
      {timeInterval === 'custom' && (
        <div className={styles.customTimeRangeBar}>
          <div className={styles.customTimeInput}>
            <label className={styles.customTimeLabel}>From</label>
            <input
              type="datetime-local"
              className={styles.datetimeInput}
              value={customAfter ? new Date(customAfter).toISOString().slice(0, 16) : ''}
              onChange={(e) => handleCustomTimeChange('after', e.target.value ? new Date(e.target.value).toISOString() : '')}
            />
          </div>
          <div className={styles.customTimeInput}>
            <label className={styles.customTimeLabel}>To</label>
            <input
              type="datetime-local"
              className={styles.datetimeInput}
              value={customBefore ? new Date(customBefore).toISOString().slice(0, 16) : ''}
              onChange={(e) => handleCustomTimeChange('before', e.target.value ? new Date(e.target.value).toISOString() : '')}
            />
          </div>
        </div>
      )}

      {/* Global Filters & Grouping Panel */}
      <div className={styles.globalControlsBar}>
        <div className={styles.globalControlsHeader}>
          <button
            className={styles.globalControlsToggle}
            onClick={() => setIsGlobalPanelOpen(!isGlobalPanelOpen)}
          >
            <span className={styles.globalControlsToggleIcon}>
              {isGlobalPanelOpen ? '▼' : '▶'}
            </span>
            <span className={styles.globalControlsTitle}>Global Filters & Grouping</span>
            {hasGlobalFilters && (
              <span className={styles.globalControlsBadge}>
                {globalGroupBy.length + Object.values(globalFilterBy).reduce((sum, arr) => sum + arr.length, 0)} active
              </span>
            )}
          </button>

          <div className={styles.globalControlsActions}>
            <label className={styles.globalToggleLabel}>
              <input
                type="checkbox"
                checked={applyGlobally}
                onChange={handleToggleApplyGlobally}
                className={styles.globalToggleCheckbox}
              />
              <span>Apply to all charts</span>
            </label>
            {hasGlobalFilters && (
              <button
                className={styles.clearGlobalButton}
                onClick={handleClearGlobalFilters}
                title="Clear all global filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Active global selections shown as tags when collapsed */}
        {!isGlobalPanelOpen && hasGlobalFilters && (
          <div className={styles.globalActiveSelections}>
            {/* Group By Tags */}
            {globalGroupBy.map(group => (
              <div key={group} className={styles.globalActiveTag}>
                <span className={styles.globalActiveTagPrefix}>Group:</span>
                <span className={styles.globalActiveTagValue}>{group}</span>
                <button
                  className={styles.globalActiveTagRemove}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveGlobalGroupBy(group);
                  }}
                  title={`Remove ${group} grouping`}
                >
                  ×
                </button>
              </div>
            ))}

            {/* Filter Tags */}
            {Object.entries(globalFilterBy).map(([filterLabel, values]) =>
              values.map(value => (
                <div key={`${filterLabel}-${value}`} className={styles.globalActiveTag}>
                  <span className={styles.globalActiveTagPrefix}>{filterLabel}:</span>
                  <span className={styles.globalActiveTagValue}>
                    {getFilterDisplayName(filterLabel, value)}
                  </span>
                  <button
                    className={styles.globalActiveTagRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveGlobalFilter(filterLabel, value);
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

        {/* Global Controls Panel Content */}
        {/* OPTIMIZED: Only render content when panel is open */}
        {isGlobalPanelOpen && (
          <div ref={filterPanelRef} className={styles.globalControlsContent}>
            {aggregatedOptions.groupByOptions.length === 0 && Object.keys(aggregatedOptions.filterOptions).length === 0 ? (
              <div className={styles.globalControlsEmpty}>
                <p>Loading available options from charts...</p>
              </div>
            ) : (
              <FilterPanelContent
                groupByOptions={filteredOptions.groupByOptions}
                filterOptions={filteredOptions.filterOptions}
                globalGroupBy={globalGroupBy}
                globalFilterBy={globalFilterBy}
                onGroupByChange={handleGlobalGroupByChange}
                onFilterChange={handleGlobalFilterChange}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
              />
            )}
          </div>
        )}
      </div>

      {/* Charts Grid Container - full width */}
      <div className={styles.chartsViewContainer}>
        <div className={styles.chartsGrid}>
          {contextsArray.map((context) => (
            <div key={`${instanceId}-chart-${context}`} className={styles.chartCard}>
              <ContextChart
                context={context}
                groupBy={applyGlobally ? memoizedGlobalGroupBy : []}
                filterBy={applyGlobally ? memoizedGlobalFilterBy : {}}
                valueAgg="avg"
                timeAgg="average"
                after={timeRange.after}
                before={timeRange.before}
                intervalCount={timeRange.intervalCount}
                space={selectedSpace}
                room={selectedRoom}
                onRemove={() => onRemoveContext(context)}
                onSummaryUpdate={handleChartSummary}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChartsView;
