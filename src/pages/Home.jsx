import React from 'react';
import { useOutletContext } from 'react-router-dom';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();

  return (
    <div className={styles.homePage}>
      <div className={styles.welcomeSection}>
        <h1>Welcome to Netdata AI</h1>
        {userInfo && (
          <p className={styles.greeting}>
            Hello, <span className={styles.userName}>{userInfo.name}</span>
          </p>
        )}
      </div>

      <div className={styles.contentSection}>
        <p className={styles.description}>
          Your intelligent monitoring and troubleshooting companion
        </p>
      </div>
    </div>
  );
};

export default Home;
