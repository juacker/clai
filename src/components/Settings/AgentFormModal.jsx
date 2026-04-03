/**
 * AgentFormModal Component
 *
 * Modal form for creating and editing agents.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import IntervalSelect from './IntervalSelect';
import styles from './AgentFormModal.module.css';

/**
 * Close icon
 */
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Loading spinner
 */
const LoadingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinner}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);


/**
 * AgentFormModal - Create/Edit automation form
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Callback when modal closes
 * @param {Function} props.onSubmit - Callback with form data
 * @param {Object} props.agent - Agent to edit (null for create)
 */
const AgentFormModal = ({ isOpen, onClose, onSubmit, agent, mcpServers = [] }) => {
  const isEditing = !!agent;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when modal opens/closes or agent changes
  useEffect(() => {
    if (isOpen) {
      if (agent) {
        setName(agent.name || '');
        setDescription(agent.description || '');
        setIntervalMinutes(agent.intervalMinutes || 30);
        setSelectedMcpServerIds(agent.selectedMcpServerIds || []);
      } else {
        setName('');
        setDescription('');
        setIntervalMinutes(30);
        setSelectedMcpServerIds([]);
      }
      setError(null);
    }
  }, [isOpen, agent]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !saving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, saving, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  }, [saving, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Agent name is required');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Agent name must be 100 characters or less');
      return;
    }

    if (intervalMinutes < 1 || intervalMinutes > 1440) {
      setError('Interval must be between 1 minute and 24 hours');
      return;
    }

    setSaving(true);

    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim(),
        intervalMinutes: Number(intervalMinutes),
        selectedMcpServerIds,
      });
    } catch (err) {
      console.error('[AgentFormModal] Submit error:', err);
      setError(err.message || 'Failed to save agent. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEditing ? 'Edit Scheduled Agent' : 'Create Scheduled Agent'}
          </h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            disabled={saving}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="agent-name">
              Name <span className={styles.required}>*</span>
            </label>
            <input
              id="agent-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Security Monitor, Performance Analyzer"
              disabled={saving}
              maxLength={100}
              autoFocus
            />
            <span className={styles.hint}>
              A descriptive name for this scheduled agent
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="agent-description">
              Description
            </label>
            <textarea
              id="agent-description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this agent should focus on, what to look for, and how to report findings..."
              disabled={saving}
              rows={6}
            />
            <span className={styles.hint}>
              Markdown supported. These instructions guide the agent on what to do and how to report.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="agent-interval">
              Check Interval
            </label>
            <IntervalSelect
              id="agent-interval"
              value={intervalMinutes}
              onChange={setIntervalMinutes}
              disabled={saving}
            />
            <span className={styles.hint}>
              How often this agent runs while enabled
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>MCP Servers</label>
            {mcpServers.length === 0 ? (
              <div className={styles.hint}>
                No MCP servers configured yet. Add them in Settings to make external tools available to this agent.
              </div>
            ) : (
              <div className={styles.checkboxGroup}>
                {mcpServers.map((server) => {
                  const checked = selectedMcpServerIds.includes(server.id);
                  return (
                    <label key={server.id} className={styles.checkboxOption}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving || !server.enabled}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          setSelectedMcpServerIds((current) => (
                            nextChecked
                              ? [...current, server.id]
                              : current.filter((id) => id !== server.id)
                          ));
                        }}
                      />
                      <span>
                        {server.name}
                        {!server.enabled ? ' (disabled)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <span className={styles.hint}>
              Selected servers will be attached to the agent session when it runs.
            </span>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={saving}
            >
              {saving ? (
                <>
                  <LoadingIcon />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Create Scheduled Agent'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AgentFormModal;
