/**
 * AutoPilotBadge Component
 *
 * Displays auto-pilot status and provides toggle functionality.
 * Shows different states: enabled, disabled, via All Nodes, no credits, no provider.
 * Includes provider selection when no provider is configured.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  getAutopilotStatus,
  setAutopilotEnabled,
  getAvailableAiProviders,
  setAiProvider,
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
 * Settings/gear icon for provider selection
 */
const SettingsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

/**
 * Check icon for selected provider
 */
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Provider Selector Modal/Dropdown
 */
const ProviderSelector = ({ providers, currentProvider, onSelect, onClose, loading }) => {
  return (
    <div className={styles.providerOverlay} onClick={onClose}>
      <div className={styles.providerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.providerHeader}>
          <span>Select AI Provider</span>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        {loading ? (
          <div className={styles.providerLoading}>
            <LoadingIcon />
            <span>Detecting providers...</span>
          </div>
        ) : (
          <div className={styles.providerList}>
            {providers.map((provider) => {
              const isSelected = currentProvider?.type === provider.provider.type;
              const isAvailable = provider.available;

              return (
                <button
                  key={provider.command}
                  className={`${styles.providerItem} ${isSelected ? styles.selected : ''} ${!isAvailable ? styles.unavailable : ''}`}
                  onClick={() => isAvailable && onSelect(provider)}
                  disabled={!isAvailable}
                >
                  <div className={styles.providerInfo}>
                    <span className={styles.providerName}>{provider.name}</span>
                    {provider.version && (
                      <span className={styles.providerVersion}>{provider.version}</span>
                    )}
                    {!isAvailable && provider.error && (
                      <span className={styles.providerError}>{provider.error}</span>
                    )}
                  </div>
                  {isSelected && (
                    <span className={styles.checkIcon}>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

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
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true); // Start true so modal shows spinner immediately

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

  // Fetch providers when modal opens
  useEffect(() => {
    if (showProviderSelector && loadingProviders && providers.length === 0) {
      // Use requestAnimationFrame to wait for browser to paint the loading state
      // Then use setTimeout to defer to next tick, ensuring paint completes
      requestAnimationFrame(() => {
        setTimeout(() => {
          getAvailableAiProviders()
            .then((result) => {
              setProviders(result);
            })
            .catch((err) => {
              console.error('[AutoPilotBadge] Failed to fetch providers:', err);
            })
            .finally(() => {
              setLoadingProviders(false);
            });
        }, 50);
      });
    }
  }, [showProviderSelector, loadingProviders, providers.length]);

  // Handle toggle click
  const handleToggle = async () => {
    if (!status || toggling) return;

    // If no provider, show selector instead
    if (!status.provider_configured) {
      // Reset state before showing modal so spinner appears
      setProviders([]);
      setLoadingProviders(true);
      setShowProviderSelector(true);
      return;
    }

    if (!status.can_toggle) return;

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

  // Handle provider selection
  const handleProviderSelect = async (providerInfo) => {
    setLoadingProviders(true);
    try {
      await setAiProvider(providerInfo.provider);
      setShowProviderSelector(false);
      // Refresh status after provider change
      await fetchStatus();
    } catch (err) {
      console.error('[AutoPilotBadge] Failed to set provider:', err);
      setError(err.message);
    } finally {
      setLoadingProviders(false);
    }
  };

  // Handle settings click (to change provider)
  const handleSettingsClick = (e) => {
    e.stopPropagation();
    // Reset state before showing modal so spinner appears
    setProviders([]);
    setLoadingProviders(true);
    setShowProviderSelector(true); // Just show modal, useEffect will fetch
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
  const providerConfigured = status.provider_configured;
  const providerName = status.provider_name;

  // Build class names
  const badgeClasses = [
    styles.badge,
    isEnabled ? styles.enabled : styles.disabled,
    !providerConfigured ? styles.needsProvider : '',
    (!canToggle && providerConfigured) ? styles.nonToggleable : styles.clickable,
    toggling ? styles.toggling : '',
  ].filter(Boolean).join(' ');

  // Determine display text and tooltip
  let displayText = isEnabled ? 'ON' : 'OFF';
  let tooltip = `Auto-pilot: ${isEnabled ? 'Enabled' : 'Disabled'}`;

  if (!providerConfigured) {
    displayText = 'Setup';
    tooltip = 'Click to select an AI provider';
  } else if (viaAllNodes && isEnabled) {
    displayText = 'ON (All Nodes)';
    tooltip = 'Auto-pilot enabled via All Nodes room. Disable All Nodes first to change.';
  } else if (!hasCredits) {
    tooltip = 'Auto-pilot requires AI credits. Add credits to enable.';
  } else if (status.message) {
    tooltip = status.message;
  } else if (canToggle) {
    tooltip = `Click to ${isEnabled ? 'disable' : 'enable'} auto-pilot`;
  }

  // Add provider info to tooltip
  if (providerConfigured && providerName) {
    tooltip += ` • Using ${providerName}`;
  }

  return (
    <>
      <div
        className={badgeClasses}
        title={tooltip}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
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
        {providerConfigured && (
          <button
            className={styles.settingsButton}
            onClick={handleSettingsClick}
            title={`Change provider (${providerName})`}
          >
            <SettingsIcon />
          </button>
        )}
      </div>

      {showProviderSelector && ReactDOM.createPortal(
        <ProviderSelector
          providers={providers}
          currentProvider={status.provider}
          onSelect={handleProviderSelect}
          onClose={() => setShowProviderSelector(false)}
          loading={loadingProviders}
        />,
        document.body
      )}
    </>
  );
};

export default AutoPilotBadge;
