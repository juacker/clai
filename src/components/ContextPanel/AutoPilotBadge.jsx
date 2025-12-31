/**
 * AutoPilotBadge Component
 *
 * Displays auto-pilot status and provides toggle functionality.
 * Shows different states: enabled, disabled, via All Nodes, no credits.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getAutopilotStatus, setAutopilotEnabled } from '../../api/client';
import styles from './AutoPilotBadge.module.css';

/**
 * Robot/Auto-pilot icon
 */
const AutoPilotIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
    <circle cx="8" cy="16" r="1" fill="currentColor" />
    <circle cx="16" cy="16" r="1" fill="currentColor" />
  </svg>
);

/**
 * Loading spinner icon
 */
const LoadingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinner}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

/**
 * AutoPilotBadge displays auto-pilot status and allows toggling
 *
 * @param {Object} props
 * @param {string} props.spaceId - Space ID (UUID)
 * @param {string} props.roomId - Room ID (UUID)
 */
const AutoPilotBadge = ({ spaceId, roomId }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState(null);

  // Fetch status when space/room changes
  const fetchStatus = useCallback(async () => {
    if (!spaceId || !roomId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getAutopilotStatus(spaceId, roomId);
      setStatus(result);
    } catch (err) {
      console.error('[AutoPilotBadge] Failed to fetch status:', err);
      setError(err.message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [spaceId, roomId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle toggle click
  const handleToggle = async () => {
    if (!status || !status.can_toggle || toggling) return;

    setToggling(true);
    setError(null);

    try {
      await setAutopilotEnabled(spaceId, roomId, !status.enabled);
      // Refresh status after toggle
      await fetchStatus();
    } catch (err) {
      console.error('[AutoPilotBadge] Failed to toggle:', err);
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  // Don't render if no space/room
  if (!spaceId || !roomId) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div className={`${styles.badge} ${styles.loading}`} title="Loading auto-pilot status...">
        <span className={styles.icon}>
          <LoadingIcon />
        </span>
        <span className={styles.text}>Auto-pilot</span>
      </div>
    );
  }

  // Error state - hide the badge
  if (error || !status) {
    return null;
  }

  // Determine badge state and styling
  const isEnabled = status.enabled;
  const canToggle = status.can_toggle && !toggling;
  const viaAllNodes = status.via_all_nodes;
  const hasCredits = status.has_credits;

  // Build class names
  const badgeClasses = [
    styles.badge,
    isEnabled ? styles.enabled : styles.disabled,
    !canToggle ? styles.nonToggleable : styles.clickable,
    toggling ? styles.toggling : '',
  ].filter(Boolean).join(' ');

  // Determine display text and tooltip
  let displayText = isEnabled ? 'ON' : 'OFF';
  let tooltip = `Auto-pilot: ${isEnabled ? 'Enabled' : 'Disabled'}`;

  if (viaAllNodes && isEnabled) {
    displayText = 'ON (All Nodes)';
    tooltip = 'Auto-pilot enabled via All Nodes room. Disable All Nodes first to change.';
  } else if (!hasCredits) {
    tooltip = 'Auto-pilot requires AI credits. Add credits to enable.';
  } else if (status.message) {
    tooltip = status.message;
  } else if (canToggle) {
    tooltip = `Click to ${isEnabled ? 'disable' : 'enable'} auto-pilot`;
  }

  return (
    <div
      className={badgeClasses}
      title={tooltip}
      onClick={canToggle ? handleToggle : undefined}
      role={canToggle ? 'button' : undefined}
      tabIndex={canToggle ? 0 : undefined}
      onKeyDown={canToggle ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      } : undefined}
    >
      <span className={styles.icon}>
        {toggling ? <LoadingIcon /> : <AutoPilotIcon />}
      </span>
      <span className={styles.label}>Auto-pilot</span>
      <span className={styles.status}>{displayText}</span>
    </div>
  );
};

export default AutoPilotBadge;
