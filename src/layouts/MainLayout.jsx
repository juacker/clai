import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { hasToken, getUserInfo } from '../api/client';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import DesktopChatPanel from '../components/Chat/DesktopChatPanel';
import { SharedSpaceRoomDataProvider } from '../contexts/SharedSpaceRoomDataContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { CommandMessagingProvider } from '../contexts/CommandMessagingContext';
import { ChatManagerProvider } from '../contexts/ChatManagerContext';
import { AgentActivityProvider } from '../contexts/AgentActivityContext';
import { useAgentBridge } from '../agents';
import styles from './MainLayout.module.css';

/**
 * Component that initializes the agent bridge.
 * Must be inside TabManagerProvider to access the context.
 */
const AgentBridgeInitializer = ({ children }) => {
  useAgentBridge();
  return children;
};

const MainLayout = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // Check if user is authenticated via secure token storage
        const isAuthenticated = await hasToken();

        if (!isAuthenticated) {
          // Don't hide splash here - let Login page handle it
          navigate('/login');
          return;
        }

        // Token is handled by Rust backend, no need to pass it
        const info = await getUserInfo();
        setUserInfo(info);
        setLoading(false);
        // Hide splash screen only on successful auth
        if (window.hideSplashScreen) {
          window.hideSplashScreen();
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
        // Don't hide splash here - let Login page handle it
        navigate('/login');
      }
    };

    fetchUserInfo();
  }, [navigate]);

  // Always render providers and AgentBridgeInitializer to avoid unmount/remount issues
  // Only the inner content changes based on loading state
  return (
    <CommandProvider>
      <SharedSpaceRoomDataProvider>
        <TabManagerProvider>
          <AgentActivityProvider>
            <AgentBridgeInitializer>
              <CommandMessagingProvider>
                <ChatManagerProvider>
                {loading ? (
                  <div className={styles.mainLayout}>
                    <div className={styles.loadingContainer}>
                      <p>Loading...</p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.mainLayout}>
                    {/* Fixed chat panel on right side (full height) */}
                    <DesktopChatPanel userInfo={userInfo} />

                    {/* Fixed TerminalEmulator at bottom */}
                    <TerminalEmulatorWrapper userInfo={userInfo} />

                    {/* Content area - takes remaining flex space */}
                    <div className={styles.contentArea}>
                      <Outlet context={{ userInfo }} />
                    </div>
                  </div>
                )}
                </ChatManagerProvider>
              </CommandMessagingProvider>
            </AgentBridgeInitializer>
          </AgentActivityProvider>
        </TabManagerProvider>
      </SharedSpaceRoomDataProvider>
    </CommandProvider>
  );
};

export default MainLayout;

