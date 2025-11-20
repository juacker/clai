import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

const Login = () => {
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://app.netdata.cloud');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (token.trim() && baseUrl.trim()) {
      // Store both token and base URL
      localStorage.setItem('netdata_token', token);
      localStorage.setItem('netdata_base_url', baseUrl.trim());
      // Redirect to home page
      navigate('/');
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1>Login to Netdata AI</h1>
        <p className={styles.description}>
          Please enter your Netdata Cloud API token to continue.
        </p>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.formGroup}>
            <label htmlFor="baseUrl">Base URL</label>
            <input
              id="baseUrl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://app.netdata.cloud"
              className={styles.input}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="token">API Token</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your API token"
              className={styles.input}
              required
            />
          </div>
          <button type="submit" className={styles.submitButton}>
            Login
          </button>
        </form>
        <div className={styles.helpText}>
          <p>Don't have a token? Generate one from your Netdata Cloud account settings.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;

