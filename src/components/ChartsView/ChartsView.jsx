import React, { useState, useMemo, useCallback } from 'react';
import { useTabContext } from '../../contexts/TabContext';
import ContextChart from './ContextChart';
import styles from './ChartsView.module.css';

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

  // Time interval state
  const [timeInterval, setTimeInterval] = useState('15m'); // '15m', '1h', '6h', '24h', 'custom'
  const [customAfter, setCustomAfter] = useState('');
  const [customBefore, setCustomBefore] = useState('');

  // Global filters and grouping state
  const [globalGroupBy, setGlobalGroupBy] = useState([]);
  const [globalFilterBy, setGlobalFilterBy] = useState([]);
  const [applyGlobally, setApplyGlobally] = useState(false);

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

  // Convert selectedContexts Set to Array for rendering
  const contextsArray = useMemo(() => {
    return Array.from(selectedContexts);
  }, [selectedContexts]);

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

      {/* Charts Grid Container - full width */}
      <div className={styles.chartsViewContainer}>
        <div className={styles.chartsGrid}>
          {contextsArray.map((context) => (
            <div key={context} className={styles.chartCard}>
              <ContextChart
                context={context}
                groupBy={applyGlobally ? globalGroupBy : []}
                filterBy={applyGlobally ? globalFilterBy : []}
                valueAgg="avg"
                timeAgg="average"
                after={timeRange.after}
                before={timeRange.before}
                intervalCount={timeRange.intervalCount}
                space={selectedSpace}
                room={selectedRoom}
                onRemove={() => onRemoveContext(context)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChartsView;

