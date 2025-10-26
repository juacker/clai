import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserInfo } from '../api/client';
import styles from './Home.module.css';

const Home = () => {
  const [userName, setUserName] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // Get token from localStorage
        const token = localStorage.getItem('netdata_token');

        if (!token) {
          // No token found, redirect to login
          navigate('/login');
          return;
        }

        const userInfo = await getUserInfo(token);
        setUserName(userInfo.name);
      } catch (err) {
        console.error('Error fetching user info:', err);
        // Authentication error, redirect to login
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, [navigate]);

  if (loading) {
    return (
      <div className={styles.homePage}>
        <h1>Welcome to Netdata AI</h1>
        <p>Loading user information...</p>
      </div>
    );
  }

  return (
    <div className={styles.homePage}>
      <h1>Welcome to Netdata AI</h1>
      {userName && <p>Hello {userName}</p>}
    </div>
  );
};

export default Home;
