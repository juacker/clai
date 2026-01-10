import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, setBaseUrl } from '../api/client';
import styles from './Login.module.css';

const Login = () => {
  const [token, setTokenValue] = useState('');
  const [baseUrl, setBaseUrlValue] = useState('https://app.netdata.cloud');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Hide splash screen when login page mounts
  useEffect(() => {
    if (window.hideSplashScreen) {
      window.hideSplashScreen();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (token.trim() && baseUrl.trim()) {
      setIsLoading(true);
      setError('');

      try {
        // Store token securely in OS keychain via Rust
        await setToken(token);
        // Store base URL in Rust backend
        await setBaseUrl(baseUrl.trim());
        // Also keep base URL in localStorage for initial load before Rust is ready
        localStorage.setItem('netdata_base_url', baseUrl.trim());
        // Redirect to home page
        navigate('/');
      } catch (err) {
        setError(`Failed to save credentials: ${err.message}`);
        setIsLoading(false);
      }
    }
  };

  return (
    <div className={styles.loginPage}>
      <img src="/icon.svg" alt="CLAI" className={styles.logo} />
      <div className={styles.loginCard}>
        <h1>Login to Netdata</h1>
        <p className={styles.description}>
          Please enter your Netdata Cloud API token to continue.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.formGroup}>
            <label htmlFor="baseUrl">Base URL</label>
            <input
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrlValue(e.target.value)}
              placeholder="https://app.netdata.cloud"
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="token">API Token</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setTokenValue(e.target.value)}
              placeholder="Enter your API token"
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>
          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <div className={styles.helpText}>
          <p>
            Don't have an account?{' '}
            <a href="https://app.netdata.cloud" target="_blank" rel="noopener noreferrer">
              Sign up for Netdata Cloud
            </a>
          </p>
          <p>
            Need an API token?{' '}
            <a href="https://learn.netdata.cloud/docs/netdata-cloud/authentication-&-authorization/api-tokens" target="_blank" rel="noopener noreferrer">
              Learn how to create one
            </a>
            <span className={styles.tokenHint}>Requires <code>scope:all</code> permission</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
