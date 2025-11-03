import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getUserInfo } from '../api/client';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import { SharedSpaceRoomDataProvider } from '../contexts/SharedSpaceRoomDataContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { usePlatform } from '../hooks/usePlatform';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isDesktop } = usePlatform();

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
            {/* Desktop: TerminalEmulator (shell command bar) */}
            {isDesktop && <TerminalEmulatorWrapper userInfo={userInfo} />}

            {/* Content area - takes remaining flex space */}
            <div className={styles.contentArea}>
              <Outlet context={{ userInfo }} />
            </div>
          </div>
        </TabManagerProvider>
      </SharedSpaceRoomDataProvider>
    </CommandProvider>
  );
};

export default MainLayout;

