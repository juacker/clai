/**
 * ProviderSettings Component
 *
 * Displays and allows selection of AI providers for auto-pilot.
 * Extracted from AutoPilotBadge for use in Settings modal.
 */

import React, { useState, useEffect } from 'react';
import {
  getAvailableAiProviders,
  setAiProvider,
  getAiProvider,
} from '../../api/client';
import styles from './ProviderSettings.module.css';

/**
 * Loading spinner icon
 */
const LoadingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinner}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

/**
 * Check icon for selected provider
 */
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Warning icon for unavailable providers
 */
const WarningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/**
 * ProviderSettings - AI Provider selection interface
 */
const ProviderSettings = () => {
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch providers and current selection on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch available providers and current selection in parallel
        const [providersResult, currentResult] = await Promise.all([
          getAvailableAiProviders(),
          getAiProvider().catch(() => null), // Ignore error if no provider set
        ]);

        setProviders(providersResult);
        setCurrentProvider(currentResult);
      } catch (err) {
        console.error('[ProviderSettings] Failed to fetch providers:', err);
        setError('Failed to load providers. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle provider selection
  const handleSelect = async (providerInfo) => {
    if (!providerInfo.available || saving) return;

    setSaving(true);
    setError(null);

    try {
      await setAiProvider(providerInfo.provider);
      // Store as ProviderInfo-like structure for consistent comparison
      setCurrentProvider({ provider: providerInfo.provider, is_configured: true });
    } catch (err) {
      console.error('[ProviderSettings] Failed to set provider:', err);
      setError('Failed to save provider. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <LoadingIcon />
          <span>Detecting AI providers...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && providers.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <WarningIcon />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const availableCount = providers.filter(p => p.available).length;

  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>AI Provider</h3>
        <p className={styles.sectionDescription}>
          Select which AI CLI to use for auto-pilot agents.
          {availableCount === 0 && (
            <span className={styles.noProviders}>
              {' '}No providers available. Install an AI CLI to get started.
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <WarningIcon />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.providerList}>
        {providers.map((provider) => {
          const isSelected = currentProvider?.provider?.type === provider.provider.type;
          const isAvailable = provider.available;

          return (
            <button
              key={provider.command}
              className={`${styles.providerItem} ${isSelected ? styles.selected : ''} ${!isAvailable ? styles.unavailable : ''}`}
              onClick={() => handleSelect(provider)}
              disabled={!isAvailable || saving}
            >
              <div className={styles.providerInfo}>
                <div className={styles.providerMain}>
                  <span className={styles.providerName}>{provider.name}</span>
                  {provider.version && (
                    <span className={styles.providerVersion}>{provider.version}</span>
                  )}
                </div>
                {!isAvailable && provider.error && (
                  <span className={styles.providerError}>
                    <WarningIcon />
                    {provider.error}
                  </span>
                )}
                {isAvailable && (
                  <span className={styles.providerCommand}>
                    <code>{provider.command}</code>
                  </span>
                )}
              </div>
              {isSelected && (
                <span className={styles.checkIcon}>
                  <CheckIcon />
                </span>
              )}
              {saving && isSelected && (
                <span className={styles.savingIcon}>
                  <LoadingIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={styles.hint}>
        <p>
          Auto-pilot uses your selected AI CLI to analyze infrastructure and provide insights.
          Make sure the CLI is installed and configured with your API key.
        </p>
      </div>
    </div>
  );
};

export default ProviderSettings;
