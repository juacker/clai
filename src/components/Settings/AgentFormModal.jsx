/**
 * AgentFormModal Component
 *
 * Modal form for creating and editing agents.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import IntervalSelect from './IntervalSelect';
import styles from './AgentFormModal.module.css';

const defaultExecution = () => ({
  filesystem: {
    extraPaths: [],
  },
  shell: {
    mode: 'off',
    allowedCommandPrefixes: [],
    blockedCommandPrefixes: ['rm', 'sudo', 'chmod', 'chown', 'dd', 'mkfs', 'mount', 'umount', 'shutdown', 'reboot'],
  },
});

const normalizeItems = (items = []) => items.map((item) => item.trim()).filter(Boolean);
const addUniqueItem = (items, value) => {
  const trimmed = value.trim();
  if (!trimmed || items.includes(trimmed)) {
    return items;
  }
  return [...items, trimmed];
};
const normalizePathGrants = (items = []) =>
  items
    .map((item) => ({
      path: item.path?.trim() || '',
      access: item.access || 'read_only',
    }))
    .filter((item) => item.path);

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

const ListInputField = ({
  label,
  value,
  onChange,
  onAdd,
  items,
  onRemove,
  placeholder,
  disabled,
  hint,
  id,
  variant,
}) => (
  <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      type="text"
      className={styles.input}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onAdd();
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
    />
    {items.length > 0 && (
      <div className={styles.chipList}>
        {items.map((item) => (
          <span key={item} className={`${styles.chip} ${variant === 'danger' ? styles.chipDanger : ''}`}>
            <code>{item}</code>
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onRemove(item)}
              disabled={disabled}
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    )}
    {hint && <span className={styles.hint}>{hint}</span>}
  </div>
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
  const [extraPathGrants, setExtraPathGrants] = useState([]);
  const [extraPathDraft, setExtraPathDraft] = useState('');
  const [extraPathAccess, setExtraPathAccess] = useState('read_only');
  const [shellMode, setShellMode] = useState('off');
  const [allowedCommands, setAllowedCommands] = useState([]);
  const [blockedCommands, setBlockedCommands] = useState(defaultExecution().shell.blockedCommandPrefixes);
  const [allowedCommandDraft, setAllowedCommandDraft] = useState('');
  const [blockedCommandDraft, setBlockedCommandDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when modal opens/closes or agent changes
  useEffect(() => {
    if (isOpen) {
      const execution = agent?.execution || defaultExecution();
      if (agent) {
        setName(agent.name || '');
        setDescription(agent.description || '');
        setIntervalMinutes(agent.intervalMinutes || 30);
        setSelectedMcpServerIds(agent.selectedMcpServerIds || []);
        setExtraPathGrants(normalizePathGrants(execution.filesystem?.extraPaths || []));
        setExtraPathDraft('');
        setExtraPathAccess('read_only');
        setShellMode(execution.shell?.mode || 'off');
        setAllowedCommands(normalizeItems(execution.shell?.allowedCommandPrefixes || []));
        setBlockedCommands(normalizeItems(execution.shell?.blockedCommandPrefixes || defaultExecution().shell.blockedCommandPrefixes));
        setAllowedCommandDraft('');
        setBlockedCommandDraft('');
      } else {
        setName('');
        setDescription('');
        setIntervalMinutes(30);
        setSelectedMcpServerIds([]);
        setExtraPathGrants([]);
        setExtraPathDraft('');
        setExtraPathAccess('read_only');
        setShellMode('off');
        setAllowedCommands([]);
        setBlockedCommands(defaultExecution().shell.blockedCommandPrefixes);
        setAllowedCommandDraft('');
        setBlockedCommandDraft('');
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
        execution: {
          filesystem: {
            extraPaths: extraPathGrants,
          },
          shell: {
            mode: shellMode,
            allowedCommandPrefixes: allowedCommands,
            blockedCommandPrefixes: blockedCommands,
          },
        },
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

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Local Capabilities</div>
            <div className={styles.sectionDescription}>
              Each agent always gets a private writable workspace folder. Use this section to grant additional local paths or shell access.
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Agent Workspace</label>
              <div className={styles.fixedGrantCard}>
                <div className={styles.fixedGrantTitle}>Private agent workspace</div>
                <div className={styles.fixedGrantText}>
                  CLAI creates a dedicated workspace directory for this agent automatically. It is always available with read + write access and used as the default working directory for shell commands.
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="agent-extra-path">
                Additional Path Grants
              </label>
              <div className={styles.listInputRow}>
                <input
                  id="agent-extra-path"
                  type="text"
                  className={styles.input}
                  value={extraPathDraft}
                  onChange={(e) => setExtraPathDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = extraPathDraft.trim();
                      if (!trimmed) return;
                      setExtraPathGrants((current) => {
                        if (current.some((item) => item.path === trimmed)) {
                          return current;
                        }
                        return [...current, { path: trimmed, access: extraPathAccess }];
                      });
                      setExtraPathDraft('');
                    }
                  }}
                  placeholder="$HOME, /tmp, /var/log"
                  disabled={saving}
                />
                <select
                  className={styles.selectSmall}
                  value={extraPathAccess}
                  onChange={(e) => setExtraPathAccess(e.target.value)}
                  disabled={saving}
                >
                  <option value="read_only">Read only</option>
                  <option value="read_write">Read + write</option>
                </select>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() => {
                    const trimmed = extraPathDraft.trim();
                    if (!trimmed) return;
                    setExtraPathGrants((current) => {
                      if (current.some((item) => item.path === trimmed)) {
                        return current;
                      }
                      return [...current, { path: trimmed, access: extraPathAccess }];
                    });
                    setExtraPathDraft('');
                  }}
                  disabled={saving || !extraPathDraft.trim()}
                >
                  Add
                </button>
              </div>
              {extraPathGrants.length > 0 && (
                <div className={styles.chipList}>
                  {extraPathGrants.map((item) => (
                    <span key={item.path} className={styles.chip}>
                      <code>{item.path}</code>
                      <span className={styles.chipMeta}>{item.access === 'read_write' ? 'rw' : 'ro'}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => setExtraPathGrants((current) => current.filter((grant) => grant.path !== item.path))}
                        disabled={saving}
                        aria-label={`Remove ${item.path}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <span className={styles.hint}>
                Use this for extra locations such as <code>$HOME</code> as read-only or <code>/tmp</code> as read + write.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="agent-shell-mode">
                Shell Access
              </label>
              <select
                id="agent-shell-mode"
                className={styles.select}
                value={shellMode}
                onChange={(e) => setShellMode(e.target.value)}
                disabled={saving}
              >
                <option value="off">Off</option>
                <option value="restricted">Restricted</option>
                <option value="full">Full</option>
              </select>
              <span className={styles.hint}>
                {shellMode === 'off' && 'The agent cannot run shell commands.'}
                {shellMode === 'restricted' && 'Only explicitly allowed commands can run. Blocked list always takes priority.'}
                {shellMode === 'full' && 'Any command is allowed except those explicitly blocked.'}
              </span>
            </div>

            {shellMode === 'restricted' && (
              <div className={styles.gridTwo}>
                <div className={styles.field}>
                  <ListInputField
                    id="agent-shell-allow"
                    label="Allowed Commands"
                    value={allowedCommandDraft}
                    onChange={setAllowedCommandDraft}
                    onAdd={() => {
                      setAllowedCommands((current) => addUniqueItem(current, allowedCommandDraft));
                      setAllowedCommandDraft('');
                    }}
                    items={allowedCommands}
                    onRemove={(item) => setAllowedCommands((current) => current.filter((value) => value !== item))}
                    placeholder="e.g. kubectl get"
                    disabled={saving}
                    hint={'Prefix match \u2014 e.g. "kubectl get" allows "kubectl get pods". Empty list means no commands allowed.'}
                  />
                </div>

                <div className={styles.field}>
                  <ListInputField
                    id="agent-shell-block"
                    label="Blocked Commands"
                    value={blockedCommandDraft}
                    onChange={setBlockedCommandDraft}
                    onAdd={() => {
                      setBlockedCommands((current) => addUniqueItem(current, blockedCommandDraft));
                      setBlockedCommandDraft('');
                    }}
                    items={blockedCommands}
                    onRemove={(item) => setBlockedCommands((current) => current.filter((value) => value !== item))}
                    placeholder="e.g. rm"
                    disabled={saving}
                    variant="danger"
                    hint="Prefix match. Blocked always wins over allowed."
                  />
                </div>
              </div>
            )}

            {shellMode === 'full' && (
              <ListInputField
                id="agent-shell-block-full"
                label="Blocked Commands"
                value={blockedCommandDraft}
                onChange={setBlockedCommandDraft}
                onAdd={() => {
                  setBlockedCommands((current) => addUniqueItem(current, blockedCommandDraft));
                  setBlockedCommandDraft('');
                }}
                items={blockedCommands}
                onRemove={(item) => setBlockedCommands((current) => current.filter((value) => value !== item))}
                placeholder="e.g. rm"
                disabled={saving}
                variant="danger"
                hint={'Prefix match \u2014 e.g. "rm" blocks "rm -rf". These commands will always be rejected.'}
              />
            )}
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
