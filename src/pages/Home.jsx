import React, { useState, useEffect } from 'react';
import { getUserInfo } from '../api/client';
import styles from './Home.module.css';

const Home = () => {
  const [userName, setUserName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // TODO: Replace with actual token once authentication is implemented
        const token = 'YOUR_TOKEN_HERE';
        const userInfo = await getUserInfo(token);
        setUserName(userInfo.name);
        setError(null);
      } catch (err) {
        console.error('Error fetching user info:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, []);

  return (
    <div className={styles.homePage}>
      <h1>Welcome to Netdata AI</h1>
      {loading && <p>Loading user information...</p>}
      {error && <p className={styles.error}>Unable to load user information. Authentication required.</p>}
      {!loading && !error && userName && <p>Hello {userName}</p>}
    </div>
  );
};

export default Home;
