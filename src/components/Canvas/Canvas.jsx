/**
 * Canvas Component
 *
 * Displays charts for metrics sent from other commands (like anomalies).
 * This is a receiver component that subscribes to canvas metrics from
 * the CommandMessagingContext.
 *
 * Features:
 * - Receives metrics via inter-command messaging
 * - Displays charts in a responsive grid
 * - Supports time range selection
 * - Global filtering and grouping options
 * - Allows removing individual metrics or clearing all
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import { useCommandMessaging } from '../../contexts/CommandMessagingContext';
import { useDebounce } from '../../hooks/useDebounce';
import ContextChart from '../ChartsView/ContextChart';
import styles from './Canvas.module.css';

// Time interval options
const TIME_INTERVALS = [
  { label: '5m', value: 5, unit: 'minutes' },
  { label: '15m', value: 15, unit: 'minutes' },
  { label: '30m', value: 30, unit: 'minutes' },
  { label: '1h', value: 1, unit: 'hours' },
  { label: '2h', value: 2, unit: 'hours' },
  { label: '6h', value: 6, unit: 'hours' },
  { label: '12h', value: 12, unit: 'hours' },
  { label: '24h', value: 24, unit: 'hours' },
  { label: '7d', value: 7, unit: 'days' },
];

const INITIAL_VISIBLE_COUNT = 20;

/**
 * Calculate time range based on interval
 */
const calculateTimeRange = (interval) => {
  const now = new Date();
  const before = now.toISOString();

  let after;
  switch (interval.unit) {
    case 'minutes':
      after = new Date(now.getTime() - interval.value * 60 * 1000).toISOString();
      break;
    case 'hours':
      after = new Date(now.getTime() - interval.value * 60 * 60 * 1000).toISOString();
      break;
    case 'days':
      after = new Date(now.getTime() - interval.value * 24 * 60 * 60 * 1000).toISOString();
      break;
    default:
      after = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  }

  return {
    after,
    before,
    intervalCount: 60,
  };
};

// Memoized FilterChip component
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

// Filter modal content
const FilterModalContent = React.memo(({
  groupByOptions,
  filterOptions,
  globalGroupBy,
  globalFilterBy,
  onGroupByChange,
  onFilterChange,
  searchQuery,
  onSearchChange,
  expandedGroups,
  onToggleGroupExpansion,
  onClose
}) => {
  return (
    <div className={styles.filterModal}>
      <div className={styles.filterModalHeader}>
        <h3 className={styles.filterModalTitle}>Global Filters & Grouping</h3>
        <button className={styles.filterModalClose} onClick={onClose} title="Close">
          ×
        </button>
      </div>

      <div className={styles.filterModalBody}>
        {/* Search Input */}
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
              {Object.entries(filterOptions).map(([filterLabel, options]) => {
                const isExpanded = expandedGroups[filterLabel] || searchQuery.trim() !== '';
                const hasMore = options.length > INITIAL_VISIBLE_COUNT;
                const visibleOptions = isExpanded ? options : options.slice(0, INITIAL_VISIBLE_COUNT);

                return (
                  <div key={filterLabel} className={styles.globalFilterGroup}>
                    <div className={styles.globalFilterGroupTitle}>{filterLabel}</div>
                    <div className={styles.globalFilterChipsScrollable}>
                      {visibleOptions.map(option => {
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
                      {hasMore && !searchQuery.trim() && (
                        <button
                          className={styles.showMoreButton}
                          onClick={() => onToggleGroupExpansion(filterLabel)}
                        >
                          {isExpanded
                            ? '▲ Show Less'
                            : `▼ +${options.length - INITIAL_VISIBLE_COUNT} more`
                          }
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Canvas Component
 */
const Canvas = ({ command }) => {
  // Get tab context for space/room
  const { selectedSpace, selectedRoom } = useTabContext();

  // Get messaging context
  const {
    getCanvasMetrics,
    removeFromCanvas,
    clearCanvas,
    registerCanvas,
    unregisterCanvas,
  } = useCommandMessaging();

  // Create space/room key for canvas storage
  const spaceRoomKey = useMemo(() => {
    if (!selectedSpace?.id || !selectedRoom?.id) return null;
    return `${selectedSpace.id}_${selectedRoom.id}`;
  }, [selectedSpace?.id, selectedRoom?.id]);

  // Get canvas metrics for current space/room
  const canvasMetrics = useMemo(() => {
    return getCanvasMetrics(spaceRoomKey);
  }, [getCanvasMetrics, spaceRoomKey]);

  // Selected time interval
  const [selectedInterval, setSelectedInterval] = useState(TIME_INTERVALS[3]); // Default 1h

  // Global filter state
  const [globalGroupBy, setGlobalGroupBy] = useState([]);
  const [globalFilterBy, setGlobalFilterBy] = useState({});
  const [applyGlobally, setApplyGlobally] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [chartSummaries, setChartSummaries] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Generate unique instance ID for keys
  const instanceId = useRef(`canvas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Register canvas on mount, unregister on unmount
  useEffect(() => {
    if (command?.id) {
      registerCanvas(command.id);
    }
    return () => {
      unregisterCanvas();
    };
  }, [command?.id, registerCanvas, unregisterCanvas]);

  // Calculate time range based on selected interval
  const timeRange = useMemo(() => {
    return calculateTimeRange(selectedInterval);
  }, [selectedInterval]);

  // Handle time interval change
  const handleIntervalChange = useCallback((interval) => {
    setSelectedInterval(interval);
  }, []);

  // Handle remove metric
  const handleRemoveMetric = useCallback((metric) => {
    if (!spaceRoomKey) return;
    removeFromCanvas(metric, spaceRoomKey);
  }, [removeFromCanvas, spaceRoomKey]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    clearCanvas(spaceRoomKey);
  }, [clearCanvas, spaceRoomKey]);

  // Handle chart summary updates
  const handleChartSummary = useCallback((context, summary) => {
    setChartSummaries(prev => ({
      ...prev,
      [context]: summary
    }));
  }, []);

  // Aggregate filter options from all chart summaries
  const chartSummariesHash = useMemo(() =>
    JSON.stringify(Object.keys(chartSummaries).sort()),
    [chartSummaries]
  );

  const aggregatedOptions = useMemo(() => {
    const groupByOptionsMap = new Map();
    const filterOptionsMap = new Map();

    Object.values(chartSummaries).forEach(summary => {
      if (!summary) return;

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
  }, [chartSummariesHash]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return aggregatedOptions;
    }

    const query = debouncedSearchQuery.toLowerCase();

    const filteredGroupByOptions = aggregatedOptions.groupByOptions.filter(option =>
      option.displayName.toLowerCase().includes(query)
    );

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

  // Filter handlers
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
  }, []);

  const handleToggleGroupExpansion = useCallback((groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }, []);

  const handleGlobalGroupByChange = useCallback((label, isChecked) => {
    setGlobalGroupBy(prev => {
      if (isChecked) {
        return [...prev, label];
      } else {
        return prev.filter(l => l !== label);
      }
    });
  }, []);

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

  const handleRemoveGlobalGroupBy = useCallback((label) => {
    setGlobalGroupBy(prev => prev.filter(l => l !== label));
  }, []);

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

  const handleClearGlobalFilters = useCallback(() => {
    setGlobalGroupBy([]);
    setGlobalFilterBy({});
  }, []);

  const handleToggleApplyGlobally = useCallback(() => {
    setApplyGlobally(prev => !prev);
  }, []);

  const getFilterDisplayName = useCallback((filterLabel, value) => {
    const options = aggregatedOptions.filterOptions[filterLabel];
    if (!options) return value;
    const option = options.find(opt => opt.value === value);
    return option ? option.displayName : value;
  }, [aggregatedOptions]);

  const hasGlobalFilters = globalGroupBy.length > 0 || Object.keys(globalFilterBy).length > 0;

  const memoizedGlobalFilterBy = useMemo(() => globalFilterBy, [
    JSON.stringify(globalFilterBy)
  ]);

  const memoizedGlobalGroupBy = useMemo(() => globalGroupBy, [
    JSON.stringify(globalGroupBy)
  ]);

  // Empty state
  if (canvasMetrics.length === 0) {
    return (
      <div className={styles.canvasWrapper}>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <span className={styles.headerTitle}>Canvas</span>
          </div>
        </div>
        <div className={styles.canvasContainer}>
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>📊</div>
            <h3 className={styles.emptyStateTitle}>No metrics in canvas</h3>
            <p className={styles.emptyStateText}>
              Click on metrics in the <strong>anomalies</strong> view to add charts here.
              <br />
              Charts will appear automatically when you select metrics.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.canvasWrapper}>
      {/* Header Bar */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Canvas</span>
          <span className={styles.metricCount}>{canvasMetrics.length} metric{canvasMetrics.length !== 1 ? 's' : ''}</span>
          <div className={styles.timeIntervalSelector}>
            {TIME_INTERVALS.map((interval) => (
              <button
                key={interval.label}
                className={`${styles.intervalButton} ${selectedInterval.label === interval.label ? styles.active : ''}`}
                onClick={() => handleIntervalChange(interval)}
              >
                {interval.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* Filter Toggle Button */}
          <button
            className={`${styles.filterToggleButton} ${applyGlobally ? styles.active : ''}`}
            onClick={() => setIsFilterModalOpen(true)}
            title="Open filters"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 3h13M3.5 6h9M5.5 9h5M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Filters
            {hasGlobalFilters && (
              <span className={styles.filterBadge}>
                {globalGroupBy.length + Object.values(globalFilterBy).reduce((sum, arr) => sum + arr.length, 0)}
              </span>
            )}
          </button>

          {/* Global Toggle */}
          <div className={styles.compactToggleContainer}>
            <span className={styles.compactToggleLabel}>Apply to all</span>
            <button
              className={`${styles.compactToggleSwitch} ${applyGlobally ? styles.active : ''}`}
              onClick={handleToggleApplyGlobally}
              role="switch"
              aria-checked={applyGlobally}
            >
              <span className={styles.compactToggleSlider} />
            </button>
          </div>

          <button className={styles.clearButton} onClick={handleClearAll}>
            Clear All
          </button>
        </div>
      </div>

      {/* Active Filters Bar */}
      {hasGlobalFilters && applyGlobally && (
        <div className={styles.activeFiltersBar}>
          <div className={styles.activeFiltersList}>
            {globalGroupBy.map(group => (
              <span key={group} className={styles.activeFilterTag}>
                <span className={styles.activeFilterPrefix}>Group:</span>
                <span className={styles.activeFilterValue}>{group}</span>
                <button
                  className={styles.activeFilterRemove}
                  onClick={() => handleRemoveGlobalGroupBy(group)}
                  title={`Remove ${group} grouping`}
                >
                  ×
                </button>
              </span>
            ))}

            {Object.entries(globalFilterBy).map(([filterLabel, values]) =>
              values.map(value => (
                <span key={`${filterLabel}-${value}`} className={styles.activeFilterTag}>
                  <span className={styles.activeFilterPrefix}>{filterLabel}:</span>
                  <span className={styles.activeFilterValue}>
                    {getFilterDisplayName(filterLabel, value)}
                  </span>
                  <button
                    className={styles.activeFilterRemove}
                    onClick={() => handleRemoveGlobalFilter(filterLabel, value)}
                    title={`Remove ${filterLabel} filter`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <button className={styles.clearFiltersButton} onClick={handleClearGlobalFilters}>
            Clear all filters
          </button>
        </div>
      )}

      {/* Charts Grid */}
      <div className={styles.canvasContainer}>
        <div className={styles.chartsGrid}>
          {canvasMetrics.map((context) => (
            <div key={`${instanceId.current}-chart-${context}`} className={styles.chartCard}>
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
                onRemove={() => handleRemoveMetric(context)}
                onSummaryUpdate={handleChartSummary}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div className={styles.filterModalOverlay} onClick={() => setIsFilterModalOpen(false)}>
          <div className={styles.filterModalContainer} onClick={(e) => e.stopPropagation()}>
            <FilterModalContent
              groupByOptions={filteredOptions.groupByOptions}
              filterOptions={filteredOptions.filterOptions}
              globalGroupBy={globalGroupBy}
              globalFilterBy={globalFilterBy}
              onGroupByChange={handleGlobalGroupByChange}
              onFilterChange={handleGlobalFilterChange}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              expandedGroups={expandedGroups}
              onToggleGroupExpansion={handleToggleGroupExpansion}
              onClose={() => setIsFilterModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;
