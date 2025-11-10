/**
 * TerminalEmulatorWrapper
 *
 * Wraps the TerminalEmulator and provides it with access to the active tab's context.
 * This allows the global terminal to interact with the active tab's space/room/custom context.
 * Also forwards the onSendToChat callback to enable terminal-to-chat message forwarding.
 *
 * @param {Object} props - Component props
 * @param {Object} props.userInfo - User information object
 * @param {function} props.onSendToChat - Callback to send message to chat
 */

import React from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import TerminalEmulator from './TerminalEmulator';

const TerminalEmulatorWrapper = ({ userInfo, onSendToChat }) => {
  const { tabs, activeTabId, updateTabContext } = useTabManager();

  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Handle context changes from the terminal
  const handleContextChange = (context) => {
    if (activeTab) {
      updateTabContext(activeTab.id, context);
    }
  };

  // If no active tab, render terminal without context
  if (!activeTab) {
    return <TerminalEmulator userInfo={userInfo} onSendToChat={onSendToChat} />;
  }

  // Wrap terminal with the active tab's context
  return (
    <TabContextProvider
      tabId={activeTab.id}
      initialContext={activeTab.context}
      onContextChange={handleContextChange}
    >
      <TerminalEmulator userInfo={userInfo} onSendToChat={onSendToChat} />
    </TabContextProvider>
  );
};

export default TerminalEmulatorWrapper;

