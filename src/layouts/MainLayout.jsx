import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { getUserInfo } from '../api/client';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import DesktopChatPanel from '../components/Chat/DesktopChatPanel';
import { SharedSpaceRoomDataProvider } from '../contexts/SharedSpaceRoomDataContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { CommandMessagingProvider } from '../contexts/CommandMessagingContext';
import { ChatManagerProvider } from '../contexts/ChatManagerContext';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageForChat, setMessageForChat] = useState(null);

  // Wrapper function to add unique ID to each message
  const handleSendToChat = (text) => {
    setMessageForChat({
      text,
      id: Date.now(), // Unique identifier to ensure consecutive identical messages are processed
    });
  };
  const navigate = useNavigate();

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
          <CommandMessagingProvider>
            <ChatManagerProvider>
            <div className={styles.mainLayout}>
              {/* Fixed chat panel on right side (full height) */}
              <DesktopChatPanel
                message={messageForChat}
                onMessageProcessed={handleMessageProcessed}
              />

              {/* Fixed TerminalEmulator at bottom */}
              <TerminalEmulatorWrapper
                userInfo={userInfo}
                onSendToChat={handleSendToChat}
              />

              {/* Content area - takes remaining flex space */}
              <div className={styles.contentArea}>
                <Outlet context={{ userInfo }} />
              </div>
            </div>
          </ChatManagerProvider>
          </CommandMessagingProvider>
        </TabManagerProvider>
      </SharedSpaceRoomDataProvider>
    </CommandProvider>
  );
};

export default MainLayout;

