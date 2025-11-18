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

const INITIAL_VISIBLE_COUNT = 20;

// Floating filter modal content
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
                          aria-label={isExpanded ? `Show less ${filterLabel} options` : `Show ${options.length - INITIAL_VISIBLE_COUNT} more ${filterLabel} options`}
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
 * ChartsView Component - Improved Design
 */
const ChartsView = ({ selectedContexts, onRemoveContext, onClearAll }) => {
  const { selectedSpace, selectedRoom } = useTabContext();

  const instanceId = useMemo(() => `charts-${Math.random().toString(36).substr(2, 9)}`, []);

  const perfMonitor = useMemo(() => createPerformanceMonitor('ChartsView'), []);
  const filterPanelRef = useRef(null);

  const [timeInterval, setTimeInterval] = useState('15m');
  const [customAfter, setCustomAfter] = useState('');
  const [customBefore, setCustomBefore] = useState('');

  const [globalGroupBy, setGlobalGroupBy] = useState([]);
  const [globalFilterBy, setGlobalFilterBy] = useState({});
  const [applyGlobally, setApplyGlobally] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const [chartSummaries, setChartSummaries] = useState({});

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [expandedGroups, setExpandedGroups] = useState({});

  const TIME_INTERVALS = useMemo(() => [
    { value: '15m', label: '15m', minutes: 15 },
    { value: '1h', label: '1h', minutes: 60 },
    { value: '6h', label: '6h', minutes: 360 },
    { value: '24h', label: '24h', minutes: 1440 },
    { value: '7d', label: '7d', minutes: 10080 },
    { value: 'custom', label: 'Custom', minutes: null },
  ], []);

  const timeRange = useMemo(() => {
    if (timeInterval === 'custom') {
      if (!customAfter || !customBefore) {
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

  const handleTimeIntervalChange = useCallback((value) => {
    setTimeInterval(value);
  }, []);

  const handleCustomTimeChange = useCallback((field, value) => {
    if (field === 'after') {
      setCustomAfter(value);
    } else if (field === 'before') {
      setCustomBefore(value);
    }
  }, []);

  const handleToggleApplyGlobally = useCallback(() => {
    setApplyGlobally(prev => !prev);
  }, []);

  const handleChartSummary = useCallback((context, summary) => {
    setChartSummaries(prev => ({
      ...prev,
      [context]: summary
    }));
  }, []);

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

  const getFilterDisplayName = useCallback((filterLabel, value) => {
    const options = aggregatedOptions.filterOptions[filterLabel];
    if (!options) return value;

    const option = options.find(opt => opt.value === value);
    return option ? option.displayName : value;
  }, [aggregatedOptions]);

  const contextsArray = useMemo(() => {
    return Array.from(selectedContexts);
  }, [selectedContexts]);

  const memoizedGlobalFilterBy = useMemo(() => globalFilterBy, [
    JSON.stringify(globalFilterBy)
  ]);

  const memoizedGlobalGroupBy = useMemo(() => globalGroupBy, [
    JSON.stringify(globalGroupBy)
  ]);

  const hasGlobalFilters = globalGroupBy.length > 0 || Object.keys(globalFilterBy).length > 0;

  if (contextsArray.length === 0) {
    return (
      <div className={styles.chartsViewWrapper}>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
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
      {/* Compact Header Bar */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
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
          {/* Filter Toggle Button */}
          <button
            className={`${styles.filterToggleButton} ${applyGlobally ? styles.active : ''}`}
            onClick={() => setIsFilterModalOpen(true)}
            title="Open filters"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 3h13M3.5 6h9M5.5 9h5M7 12h2" />
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
        </div>
      </div>

      {/* Custom Time Range */}
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

      {/* Active Filters Bar - With green styling matching individual charts */}
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

export default ChartsView;
