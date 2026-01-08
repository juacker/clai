/**
 * TerminalEmulatorWrapper
 *
 * Wraps the TerminalEmulator and provides it with access to the active tab's context.
 * This allows the global terminal to interact with the active tab's space/room/custom context.
 * Also handles on-demand agent execution when the user types queries in the terminal.
 *
 * @param {Object} props - Component props
 * @param {Object} props.userInfo - User information object
 */

import React, { useCallback } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useOnDemandAgent } from '../../agents';
import TerminalEmulator from './TerminalEmulator';

const TerminalEmulatorWrapper = ({ userInfo }) => {
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { runAgent } = useOnDemandAgent();

  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Handle context changes from the terminal
  const handleContextChange = (context) => {
    if (activeTab) {
      updateTabContext(activeTab.id, context);
    }
  };

  /**
   * Handle sending a query to the on-demand agent.
   * Gets the space/room context from the active tab and runs the agent.
   */
  const handleSendToAgent = useCallback(
    async (query) => {
      if (!activeTab) {
        console.warn('[TerminalEmulatorWrapper] No active tab');
        return;
      }

      const spaceId = activeTab.context?.spaceRoom?.selectedSpaceId;
      const roomId = activeTab.context?.spaceRoom?.selectedRoomId;

      if (!spaceId || !roomId) {
        console.warn('[TerminalEmulatorWrapper] No space/room context. Please select a space and room first.');
        // Still open chat to show the error state
        openChat();
        return;
      }

      // Open the chat panel to show agent activity
      openChat();

      // Run the on-demand agent
      await runAgent(query, activeTab.id, spaceId, roomId);
    },
    [activeTab, openChat, runAgent]
  );

  // If no active tab, render terminal without context
  if (!activeTab) {
    return <TerminalEmulator userInfo={userInfo} onSendToChat={handleSendToAgent} />;
  }

  // Wrap terminal with the active tab's context
  return (
    <TabContextProvider
      tabId={activeTab.id}
      initialContext={activeTab.context}
      onContextChange={handleContextChange}
    >
      <TerminalEmulator userInfo={userInfo} onSendToChat={handleSendToAgent} />
    </TabContextProvider>
  );
};

export default TerminalEmulatorWrapper;

