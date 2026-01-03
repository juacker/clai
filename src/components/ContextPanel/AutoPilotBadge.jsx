/**
 * AutoPilotBadge Component
 *
 * Displays auto-pilot status and provides toggle functionality.
 * Shows different states: enabled, disabled, no credits, no provider, no agents.
 *
 * Provider and agent configuration is now done via the Settings modal.
 * This badge acts as a simple ON/OFF toggle for the current room.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getAutopilotStatus,
  setAutopilotEnabled,
} from '../../api/client';
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

  // Listen for agent assignment changes to refresh status
  useEffect(() => {
    const handleAgentChange = () => {
      fetchStatus();
    };

    window.addEventListener('agent-assignments-changed', handleAgentChange);
    return () => {
      window.removeEventListener('agent-assignments-changed', handleAgentChange);
    };
  }, [fetchStatus]);

  // Handle toggle click
  const handleToggle = async () => {
    if (!status || toggling || !status.can_toggle) return;

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

  // Extract status fields
  const isEnabled = status.enabled;
  const canToggle = status.can_toggle && !toggling;
  const hasCredits = status.has_credits;
  const providerConfigured = status.provider_configured;
  const providerName = status.provider_name;
  const hasAgents = status.has_agents;
  const enabledAgentCount = status.enabled_agent_count || 0;
  const totalAgentCount = status.total_agent_count || 0;

  // Determine display text and state
  let displayText;
  let tooltip;
  let badgeState;

  if (!hasAgents) {
    // No agents configured - show "No Agents"
    displayText = 'No Agents';
    tooltip = 'No agents configured. Configure agents in Settings.';
    badgeState = 'noAgents';
  } else if (!providerConfigured) {
    // No provider - show "Setup"
    displayText = 'Setup';
    tooltip = 'No AI provider configured. Configure provider in Settings.';
    badgeState = 'needsProvider';
  } else if (!hasCredits) {
    // No credits
    displayText = 'No Credits';
    tooltip = 'Auto-pilot requires AI credits. Add credits to enable.';
    badgeState = 'noCredits';
  } else if (isEnabled && enabledAgentCount === 0) {
    // Enabled but no agents assigned - show warning
    displayText = 'ON (0)';
    tooltip = `Auto-pilot enabled but no agents assigned to this room. Assign agents in Settings.`;
    tooltip += ' Click to disable.';
    badgeState = 'enabledNoAgents';
  } else if (isEnabled) {
    // Enabled with agents - show agent count
    displayText = `ON (${enabledAgentCount})`;
    tooltip = `Auto-pilot enabled. ${enabledAgentCount} of ${totalAgentCount} agent${totalAgentCount !== 1 ? 's' : ''} assigned to this room.`;
    if (providerName) {
      tooltip += ` Using ${providerName}.`;
    }
    tooltip += ' Click to disable.';
    badgeState = 'enabled';
  } else {
    // Disabled
    displayText = 'OFF';
    tooltip = `Auto-pilot disabled. ${enabledAgentCount} of ${totalAgentCount} agent${totalAgentCount !== 1 ? 's' : ''} assigned to this room.`;
    if (providerName) {
      tooltip += ` Using ${providerName}.`;
    }
    tooltip += ' Click to enable.';
    badgeState = 'disabled';
  }

  // Build class names
  const badgeClasses = [
    styles.badge,
    styles[badgeState],
    canToggle ? styles.clickable : styles.nonToggleable,
    toggling ? styles.toggling : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={badgeClasses}
      title={tooltip}
      onClick={handleToggle}
      role="button"
      tabIndex={canToggle ? 0 : -1}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && canToggle) {
          e.preventDefault();
          handleToggle();
        }
      }}
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
