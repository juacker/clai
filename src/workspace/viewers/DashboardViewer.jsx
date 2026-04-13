import React, { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import MarkdownMessage from '../../components/Chat/MarkdownMessage';
import ContextChart from '../../components/ChartsView/ContextChart';
import { validateDashboardElement } from '../../utils/dashboardElementValidator';

/**
 * Time intervals matching Dashboard.jsx.
 */
const TIME_INTERVALS = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
];

const getAutoRefreshInterval = (seconds) => {
  if (seconds <= 300) return 5000;
  if (seconds <= 1800) return 10000;
  if (seconds <= 3600) return 30000;
  if (seconds <= 21600) return 60000;
  return 600000;
};

const calculateTimeRange = (interval) => {
  const now = new Date();
  const after = new Date(now.getTime() - interval.seconds * 1000);
  return {
    after: after.toISOString(),
    before: now.toISOString(),
    intervalCount: 60,
  };
};

/**
 * Read-only dashboard viewer for file-based .dashboard.json artifacts.
 * Renders charts using ContextChart from the main Dashboard component.
 *
 */
const DashboardViewer = memo(({ content }) => {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  if (!parsed) {
    return <JsonFallback content={content} />;
  }

  return <DashboardContent parsed={parsed} ContextChart={ContextChart} />;
});

DashboardViewer.displayName = 'DashboardViewer';

const DashboardContent = memo(({ parsed, ContextChart }) => {
  const charts = useMemo(() => {
    if (Array.isArray(parsed.charts)) {
      return parsed.charts;
    }

    if (Array.isArray(parsed.elements)) {
      return parsed.elements
        .filter((element) => validateDashboardElement(element).valid)
        .map((element) => ({
          ...element.config,
          id: element.id,
        }));
    }

    return [];
  }, [parsed]);

  const initialLabel = parsed.timeRange || '1h';
  const initialInterval = TIME_INTERVALS.find((t) => t.label === initialLabel) || TIME_INTERVALS[3];

  const [selectedInterval, setSelectedInterval] = useState(initialInterval);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(parsed.autoRefresh !== false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const intervalRef = useRef(null);

  const timeRange = useMemo(() => calculateTimeRange(selectedInterval), [selectedInterval, lastRefresh]);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      clearInterval(intervalRef.current);
      return;
    }
    const ms = getAutoRefreshInterval(selectedInterval.seconds);
    intervalRef.current = setInterval(() => setLastRefresh(Date.now()), ms);
    return () => clearInterval(intervalRef.current);
  }, [autoRefreshEnabled, selectedInterval]);

  const handleRefreshNow = useCallback(() => setLastRefresh(Date.now()), []);

  if (charts.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
        This dashboard has no charts defined.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {TIME_INTERVALS.map((ti) => (
          <button
            key={ti.label}
            onClick={() => setSelectedInterval(ti)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--color-border-light)',
              background: ti.label === selectedInterval.label ? 'var(--color-accent)' : 'transparent',
              color: ti.label === selectedInterval.label ? 'white' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {ti.label}
          </button>
        ))}
        <button
          onClick={handleRefreshNow}
          title="Refresh now"
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid var(--color-border-light)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
        gap: 16,
      }}>
        {charts.map((chart, i) => (
          <div
            key={chart.context || i}
            style={{
              minHeight: 380,
              border: '1px solid var(--color-border-light)',
              borderRadius: 8,
              background: 'var(--color-bg-elevated)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {chart.title && (
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--color-border-light)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}>
                {chart.title}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ContextChart
                context={chart.context}
                groupBy={chart.groupBy || []}
                filterBy={chart.filterBy || {}}
                valueAgg={chart.valueAgg || 'avg'}
                timeAgg={chart.timeAgg || 'average'}
                after={timeRange.after}
                before={timeRange.before}
                intervalCount={timeRange.intervalCount}
                space={chart.spaceId ? { id: chart.spaceId } : null}
                room={chart.roomId ? { id: chart.roomId } : null}
                showRefreshIndicator={false}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

DashboardContent.displayName = 'DashboardContent';

const JsonFallback = ({ content }) => {
  let formatted = content;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    // keep raw
  }
  return <MarkdownMessage content={`\`\`\`json\n${formatted}\n\`\`\``} />;
};

export default DashboardViewer;
