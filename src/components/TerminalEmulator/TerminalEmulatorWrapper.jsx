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

import React, { useCallback, useRef } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useAgentActivity } from '../../contexts/AgentActivityContext';
import { useOnDemandAgent } from '../../agents';
import TerminalEmulator from './TerminalEmulator';

const TerminalEmulatorWrapper = ({ userInfo }) => {
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { startExecution, completeExecution, ensureTabTracked } = useAgentActivity();
  const { runAgent } = useOnDemandAgent();

  // Track if agent is running for this wrapper instance
  const isRunningRef = useRef(false);

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

      // Check if agent is already running
      if (isRunningRef.current) {
        console.warn('[TerminalEmulatorWrapper] Agent already running');
        openChat();
        return;
      }

      const spaceId = activeTab.context?.spaceRoom?.selectedSpaceId;
      const roomId = activeTab.context?.spaceRoom?.selectedRoomId;

      // Ensure tab is tracked so we can show messages
      ensureTabTracked(activeTab.id);

      if (!spaceId || !roomId) {
        // Show error in chat UI
        startExecution(activeTab.id, query);
        openChat();
        completeExecution(activeTab.id, 'Please select a space and room from the context menu before asking questions. Use the space/room selector in the terminal to set your context.');
        return;
      }

      // Open the chat panel to show agent activity
      openChat();
      isRunningRef.current = true;

      try {
        // Run the on-demand agent
        await runAgent(query, activeTab.id, spaceId, roomId);
      } finally {
        isRunningRef.current = false;
      }
    },
    [activeTab, openChat, runAgent, ensureTabTracked, startExecution, completeExecution]
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

