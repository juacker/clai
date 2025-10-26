import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

const Login = () => {
  const [token, setToken] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (token.trim()) {
      // TODO: Store token securely (localStorage, sessionStorage, or context)
      localStorage.setItem('netdata_token', token);
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

