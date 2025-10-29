import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getUserInfo } from '../api/client';
import UserAvatar from '../components/UserAvatar';
import SpaceRoomSelector from '../components/SpaceRoomSelector';
import TerminalEmulator from '../components/TerminalEmulator';
import { SharedSpaceRoomDataProvider } from '../contexts/SharedSpaceRoomDataContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const token = localStorage.getItem('netdata_token');

        if (!token) {
          navigate('/login');
          return;
        }

        const info = await getUserInfo(token);
        setUserInfo(info);
      } catch (err) {
        console.error('Error fetching user info:', err);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, [navigate]);

  if (loading) {
    return (
      <div className={styles.mainLayout}>
        <div className={styles.loadingContainer}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <CommandProvider>
      <SharedSpaceRoomDataProvider>
        <TabManagerProvider>
          <div className={styles.mainLayout}>
            {/* Mobile: SpaceRoomSelector (button + drawer) */}
            <div className={styles.spaceRoomWrapper}>
              <SpaceRoomSelector />
            </div>

            {/* Desktop: TerminalEmulator (shell command bar) */}
            <TerminalEmulator userInfo={userInfo} />

            {userInfo && (
              <div className={styles.avatarWrapper}>
                <UserAvatar
                  avatarUrl={userInfo.avatarURL}
                  userName={userInfo.name}
                  size="medium"
                />
              </div>
            )}
            <Outlet context={{ userInfo }} />
          </div>
        </TabManagerProvider>
      </SharedSpaceRoomDataProvider>
    </CommandProvider>
  );
};

export default MainLayout;

