import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getUserInfo } from '../api/client';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import MobileTerminalSheet from '../components/TerminalEmulator/MobileTerminalSheet';
import DesktopChatPanel from '../components/Chat/DesktopChatPanel';
import { SharedSpaceRoomDataProvider } from '../contexts/SharedSpaceRoomDataContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { ChatManagerProvider } from '../contexts/ChatManagerContext';
import { usePlatform } from '../hooks/usePlatform';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageForChat, setMessageForChat] = useState(null);
  const navigate = useNavigate();
  const { isDesktop, isMobile } = usePlatform();

  // Callback to handle when chat has processed the message
  const handleMessageProcessed = () => {
    setMessageForChat(null);
  };

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
          <ChatManagerProvider>
            <div className={styles.mainLayout}>
              {/* Desktop: Fixed chat panel on right side (full height) */}
              {isDesktop && (
                <DesktopChatPanel
                  message={messageForChat}
                  onMessageProcessed={handleMessageProcessed}
                />
              )}

              {/* Desktop: Fixed TerminalEmulator at bottom */}
              {isDesktop && (
                <TerminalEmulatorWrapper
                  userInfo={userInfo}
                  onSendToChat={setMessageForChat}
                />
              )}

              {/* Mobile: Unified draggable bottom sheet with terminal and chat */}
              {isMobile && (
                <MobileTerminalSheet
                  message={messageForChat}
                  onMessageProcessed={handleMessageProcessed}
                >
                  <TerminalEmulatorWrapper
                    userInfo={userInfo}
                    onSendToChat={setMessageForChat}
                  />
                </MobileTerminalSheet>
              )}

              {/* Content area - takes remaining flex space */}
              <div className={styles.contentArea}>
                <Outlet context={{ userInfo }} />
              </div>
            </div>
          </ChatManagerProvider>
        </TabManagerProvider>
      </SharedSpaceRoomDataProvider>
    </CommandProvider>
  );
};

export default MainLayout;

