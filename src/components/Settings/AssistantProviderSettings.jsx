/**
 * AssistantProviderSettings Component
 *
 * Configures the assistant engine's OpenAI-compatible provider connection.
 * Allows entering an API key, optional base URL, and model ID.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import styles from './ProviderSettings.module.css';

const STORAGE_KEY_MODEL = 'assistant-default-model';

export function getStoredModel() {
  return localStorage.getItem(STORAGE_KEY_MODEL) || '';
}

function setStoredModel(model) {
  if (model) {
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  } else {
    localStorage.removeItem(STORAGE_KEY_MODEL);
  }
}

const LoadingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinner}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '14px',
  fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
  color: 'var(--color-text-primary)',
  background: 'var(--color-bg-primary)',
  border: '1px solid var(--color-border-light)',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: '6px',
};

const AssistantProviderSettings = () => {
  const [providerSession, setProviderSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');

  // Load current state
  useEffect(() => {
    const load = async () => {
      try {
        const sessions = await invoke('provider_list_sessions');
        if (sessions.length > 0) {
          setProviderSession(sessions[0]);
          setBaseUrl(sessions[0].baseUrl || '');
        }
        setModelId(getStoredModel());
      } catch (err) {
        console.error('[AssistantProviderSettings] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key.');
      return;
    }
    if (!modelId.trim()) {
      setError('Please enter a model name.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const request = {
        providerId: 'openai',
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || null,
        accountLabel: null,
      };

      const session = await invoke('provider_connect_api_key', { request });
      setProviderSession(session);
      setStoredModel(modelId.trim());
      setApiKey('');
      setSuccess('Connected successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AssistantProviderSettings] Connect failed:', err);
      setError(typeof err === 'string' ? err : 'Failed to connect. Check your API key.');
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, modelId]);

  const handleDisconnect = useCallback(async () => {
    if (!providerSession) return;

    setDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      await invoke('provider_disconnect', { providerId: providerSession.providerId });
      setProviderSession(null);
      setBaseUrl('');
      setStoredModel('');
      setModelId('');
      setSuccess('Disconnected.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AssistantProviderSettings] Disconnect failed:', err);
      setError('Failed to disconnect.');
    } finally {
      setDisconnecting(false);
    }
  }, [providerSession]);

  const handleModelSave = useCallback(() => {
    setStoredModel(modelId.trim());
    setSuccess('Model updated.');
    setTimeout(() => setSuccess(null), 3000);
  }, [modelId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !saving) {
      handleConnect();
    }
  }, [handleConnect, saving]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <LoadingIcon />
          <span>Loading provider settings...</span>
        </div>
      </div>
    );
  }

  const isConnected = !!providerSession;

  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Assistant Provider</h3>
        <p className={styles.sectionDescription}>
          Connect an OpenAI-compatible API to power the assistant engine.
          Works with OpenAI, together.ai, Groq, local servers, and any compatible endpoint.
        </p>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px',
          color: 'var(--color-success, #10b981)',
          fontSize: '13px',
        }}>
          <CheckIcon />
          <span>{success}</span>
        </div>
      )}

      {isConnected ? (
        /* Connected state */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className={styles.providerList}>
            <div className={`${styles.providerItem} ${styles.selected}`}>
              <div className={styles.providerInfo}>
                <div className={styles.providerMain}>
                  <span className={styles.providerName}>OpenAI-Compatible</span>
                </div>
                <span className={styles.providerCommand}>
                  <code>{providerSession.baseUrl || 'api.openai.com'}</code>
                </span>
              </div>
              <span className={styles.checkIcon}>
                <CheckIcon />
              </span>
            </div>
          </div>

          {/* Model selector — editable when connected */}
          <div>
            <label style={labelStyle}>Model</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                onBlur={handleModelSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleModelSave(); }}
                placeholder="e.g. gpt-4o, claude-3-sonnet, meta-llama/..."
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            <p style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              margin: '4px 0 0 4px',
            }}>
              The model ID your provider supports. Changes apply to new sessions.
            </p>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '13px',
              fontFamily: 'inherit',
              color: 'var(--color-critical, #DC2626)',
              background: 'transparent',
              border: '1px solid var(--color-critical, #DC2626)',
              borderRadius: '8px',
              cursor: disconnecting ? 'not-allowed' : 'pointer',
              opacity: disconnecting ? 0.6 : 1,
              transition: 'all 0.15s ease',
              marginTop: '4px',
            }}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        /* Not connected — show form */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>
              API Key <span style={{ color: 'var(--color-critical, #DC2626)' }}>*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Model <span style={{ color: 'var(--color-critical, #DC2626)' }}>*</span>
            </label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. gpt-4o-mini, meta-llama/Llama-3-70b, ..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Base URL <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://api.openai.com/v1"
              style={inputStyle}
            />
            <p style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              margin: '4px 0 0 4px',
            }}>
              Leave empty for OpenAI. Set for compatible providers (e.g., together.ai, Groq, local).
            </p>
          </div>

          <button
            onClick={handleConnect}
            disabled={saving || !apiKey.trim() || !modelId.trim()}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'inherit',
              color: '#fff',
              background: saving || !apiKey.trim() || !modelId.trim() ? 'var(--color-text-tertiary)' : 'var(--color-primary, #6366f1)',
              border: 'none',
              borderRadius: '8px',
              cursor: saving || !apiKey.trim() || !modelId.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {saving ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}

      <div className={styles.hint}>
        <p>
          Your API key is stored securely in your OS keychain — it is never saved to disk or sent anywhere except the configured endpoint.
        </p>
      </div>
    </div>
  );
};

export default AssistantProviderSettings;
