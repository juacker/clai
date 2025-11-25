import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TerminalEmulatorWrapper from '../components/TerminalEmulator/TerminalEmulatorWrapper';
import DesktopChatPanel from '../components/Chat/DesktopChatPanel';
import { PluginProvider } from '../contexts/PluginContext';
import { CommandProvider } from '../contexts/CommandContext';
import { TabManagerProvider } from '../contexts/TabManagerContext';
import { ChatManagerProvider } from '../contexts/ChatManagerContext';
import styles from './MainLayout.module.css';

const MainLayout = () => {
  const [messageForChat, setMessageForChat] = useState(null);

  // Wrapper function to add unique ID to each message
  const handleSendToChat = (text) => {
    setMessageForChat({
      text,
      id: Date.now(), // Unique identifier to ensure consecutive identical messages are processed
    });
  };

  // Callback to handle when chat has processed the message
  const handleMessageProcessed = () => {
    setMessageForChat(null);
  };

  return (
    <CommandProvider>
      <PluginProvider>
        <TabManagerProvider>
          <ChatManagerProvider>
            <div className={styles.mainLayout}>
              {/* Fixed chat panel on right side (full height) */}
              <DesktopChatPanel
                message={messageForChat}
                onMessageProcessed={handleMessageProcessed}
              />

              {/* Fixed TerminalEmulator at bottom */}
              <TerminalEmulatorWrapper
                onSendToChat={handleSendToChat}
              />

              {/* Content area - takes remaining flex space */}
              <div className={styles.contentArea}>
                <Outlet />
              </div>
            </div>
          </ChatManagerProvider>
        </TabManagerProvider>
      </PluginProvider>
    </CommandProvider>
  );
};

export default MainLayout;

