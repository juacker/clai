import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useSpaceRoom } from '../contexts/SpaceRoomContext';
import styles from './Home.module.css';

const Home = () => {
  const { userInfo } = useOutletContext();
  const { selectedSpace, selectedRoom, loading } = useSpaceRoom();

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

        {!loading && selectedSpace && (
          <div className={styles.contextInfo}>
            <h2 className={styles.contextTitle}>Current Context</h2>
            <div className={styles.contextDetails}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Space:</span>
                <span className={styles.contextValue}>{selectedSpace.name}</span>
              </div>
              {selectedRoom && (
                <div className={styles.contextItem}>
                  <span className={styles.contextLabel}>Room:</span>
                  <span className={styles.contextValue}>{selectedRoom.name}</span>
                </div>
              )}
              {selectedSpace.description && (
                <div className={styles.contextDescription}>
                  <p>{selectedSpace.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
