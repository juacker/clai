import React, { useState, useEffect } from 'react';
import styles from './NetdataConfig.module.css';

/**
 * Netdata Configuration Component
 * UI for configuring Netdata plugin instances
 *
 * This component handles both registration (Level 1) and instance creation (Level 2)
 */
export const NetdataConfig = ({ mode, initialConfig, onSave, onCancel }) => {
  const [config, setConfig] = useState({
    token: '',
    baseUrl: 'https://app.netdata.cloud',
    spaceId: '',
    roomId: '',
    ...initialConfig
  });

  const [spaces, setSpaces] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);

  // Mode can be 'registration' (Level 1) or 'instance' (Level 2)
  const isRegistrationMode = mode === 'registration';

  /**
   * Fetch spaces when token and baseUrl are provided
   */
  useEffect(() => {
    if (config.token && config.baseUrl && !isRegistrationMode) {
      fetchSpaces();
    }
  }, [config.token, config.baseUrl, isRegistrationMode]);

  /**
   * Fetch rooms when space is selected
   */
  useEffect(() => {
    if (config.spaceId && config.token && config.baseUrl && !isRegistrationMode) {
      fetchRooms(config.spaceId);
    }
  }, [config.spaceId, config.token, config.baseUrl, isRegistrationMode]);

  /**
   * Fetch available spaces
   */
  const fetchSpaces = async () => {
    setLoading(true);
    setError(null);

    try {
      // Dynamically import NetdataAPI to avoid circular dependencies
      const { NetdataAPI } = await import('./NetdataAPI');
      const api = new NetdataAPI({
        baseUrl: config.baseUrl,
        token: config.token
      });

      const response = await api.getSpaces();
      setSpaces(response.spaces || []);
    } catch (err) {
      console.error('Failed to fetch spaces:', err);
      setError(`Failed to fetch spaces: ${err.message}`);
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch rooms for a specific space
   */
  const fetchRooms = async (spaceId) => {
    setLoading(true);
    setError(null);

    try {
      const { NetdataAPI } = await import('./NetdataAPI');
      const api = new NetdataAPI({
        baseUrl: config.baseUrl,
        token: config.token
      });

      const response = await api.getRooms(spaceId);
      setRooms(response.rooms || []);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
      setError(`Failed to fetch rooms: ${err.message}`);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Validate credentials
   */
  const validateCredentials = async () => {
    setValidating(true);
    setError(null);

    try {
      const { NetdataAPI } = await import('./NetdataAPI');
      const api = new NetdataAPI({
        baseUrl: config.baseUrl,
        token: config.token
      });

      await api.getUserInfo();
      return true;
    } catch (err) {
      console.error('Failed to validate credentials:', err);
      setError(`Invalid credentials: ${err.message}`);
      return false;
    } finally {
      setValidating(false);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!config.token || !config.baseUrl) {
      setError('Token and Base URL are required');
      return;
    }

    if (!isRegistrationMode && (!config.spaceId || !config.roomId)) {
      setError('Space and Room are required');
      return;
    }

    // Validate credentials
    const isValid = await validateCredentials();
    if (!isValid) {
      return;
    }

    // Call onSave callback
    if (onSave) {
      onSave(config);
    }
  };

  /**
   * Handle input change
   */
  const handleChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user types
    if (error) {
      setError(null);
    }
  };

  return (
    <div className={styles.netdataConfig}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <h2 className={styles.title}>
          {isRegistrationMode ? 'Register Netdata' : 'Configure Netdata Instance'}
        </h2>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {/* Token Input */}
        <div className={styles.formGroup}>
          <label htmlFor="token" className={styles.label}>
            Authentication Token *
          </label>
          <input
            id="token"
            type="password"
            className={styles.input}
            value={config.token}
            onChange={(e) => handleChange('token', e.target.value)}
            placeholder="Enter your Netdata Cloud token"
            required
            disabled={!isRegistrationMode && initialConfig?.token}
          />
          <small className={styles.hint}>
            Your Netdata Cloud Bearer token
          </small>
        </div>

        {/* Base URL Input */}
        <div className={styles.formGroup}>
          <label htmlFor="baseUrl" className={styles.label}>
            Base URL *
          </label>
          <input
            id="baseUrl"
            type="url"
            className={styles.input}
            value={config.baseUrl}
            onChange={(e) => handleChange('baseUrl', e.target.value)}
            placeholder="https://app.netdata.cloud"
            required
            disabled={!isRegistrationMode && initialConfig?.baseUrl}
          />
          <small className={styles.hint}>
            Netdata Cloud base URL
          </small>
        </div>

        {/* Space Selection (only in instance mode) */}
        {!isRegistrationMode && (
          <div className={styles.formGroup}>
            <label htmlFor="spaceId" className={styles.label}>
              Space *
            </label>
            <select
              id="spaceId"
              className={styles.select}
              value={config.spaceId}
              onChange={(e) => handleChange('spaceId', e.target.value)}
              required
              disabled={loading || spaces.length === 0}
            >
              <option value="">Select a space...</option>
              {spaces.map(space => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
            {loading && <small className={styles.hint}>Loading spaces...</small>}
          </div>
        )}

        {/* Room Selection (only in instance mode) */}
        {!isRegistrationMode && config.spaceId && (
          <div className={styles.formGroup}>
            <label htmlFor="roomId" className={styles.label}>
              Room *
            </label>
            <select
              id="roomId"
              className={styles.select}
              value={config.roomId}
              onChange={(e) => handleChange('roomId', e.target.value)}
              required
              disabled={loading || rooms.length === 0}
            >
              <option value="">Select a room...</option>
              {rooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {loading && <small className={styles.hint}>Loading rooms...</small>}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={validating}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.saveButton}
            disabled={validating || loading}
          >
            {validating ? 'Validating...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NetdataConfig;

