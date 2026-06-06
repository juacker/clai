import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import PermissionAttentionNotifications from '../components/PermissionAttentionNotifications';
import WorkspaceTaskNotifications from '../components/WorkspaceTaskNotifications';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { ChatManagerProvider } from '../contexts/ChatManagerContext';
import { useAssistantEvents } from '../assistant';
import styles from './MainLayout.module.css';

const AssistantEventListener = ({ children }: { children: React.ReactNode }) => {
  useAssistantEvents();
  return <>{children}</>;
};

const MainLayout = () => {
  useEffect(() => {
    const splash = (window as Window & { hideSplashScreen?: () => void }).hideSplashScreen;
    if (splash) {
      splash();
    }
  }, []);

  return (
    <TabManagerProvider>
      <AssistantEventListener>
        <ChatManagerProvider>
          <div className={styles.mainLayout}>
            <WorkspaceTaskNotifications />
            <PermissionAttentionNotifications />
            <TerminalEmulatorWrapper />
            <div className={styles.contentArea}>
              <Outlet />
            </div>
          </div>
        </ChatManagerProvider>
      </AssistantEventListener>
    </TabManagerProvider>
  );
};

export default MainLayout;
