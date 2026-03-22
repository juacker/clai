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
import { useAssistantSession, useAssistantStore, assistantClient } from '../../assistant';
import { getStoredModel } from '../Settings/AssistantProviderSettings';
import TerminalEmulator from './TerminalEmulator';

const TerminalEmulatorWrapper = ({ userInfo }) => {
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { startExecution, completeExecution, ensureTabTracked } = useAgentActivity();
  const { runAgent } = useOnDemandAgent();
  const { ensureSession } = useAssistantSession(activeTabId);

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
   * Check if a provider session is configured.
   * Always fetches fresh — the invoke is fast and the user may have
   * connected/disconnected a provider since the last check.
   */
  const getProviderSession = useCallback(async () => {
    try {
      const sessions = await assistantClient.listProviderSessions();
      return sessions.length > 0 ? sessions[0] : null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Handle sending a query — routes to assistant engine or legacy agent path.
   */
  const handleSendToAgent = useCallback(
    async (query) => {
      if (!activeTab) {
        console.warn('[TerminalEmulatorWrapper] No active tab');
        return;
      }

      // Check if we should use the assistant engine path
      const providerSession = await getProviderSession();

      if (providerSession) {
        // Assistant engine path
        openChat();
        try {
          const model = getStoredModel() || 'gpt-4o-mini';
          const spaceId = activeTab.context?.spaceRoom?.selectedSpaceId || null;
          const roomId = activeTab.context?.spaceRoom?.selectedRoomId || null;
          const sessionId = await ensureSession(
            providerSession.providerId,
            model,
            { spaceId, roomId }
          );
          // Use client directly and add user message to store immediately
          // for instant display (don't wait for async Tauri event).
          const result = await assistantClient.sendMessage(sessionId, query);
          const store = useAssistantStore.getState();
          store.addMessage(sessionId, result.message);
        } catch (err) {
          console.error('[TerminalEmulatorWrapper] Assistant error:', err);
        }
        return;
      }

      // Legacy agent path
      if (isRunningRef.current) {
        console.warn('[TerminalEmulatorWrapper] Agent already running');
        openChat();
        return;
      }

      const spaceId = activeTab.context?.spaceRoom?.selectedSpaceId;
      const roomId = activeTab.context?.spaceRoom?.selectedRoomId;

      ensureTabTracked(activeTab.id);

      if (!spaceId || !roomId) {
        startExecution(activeTab.id, query);
        openChat();
        completeExecution(activeTab.id, 'Please select a space and room from the context menu before asking questions. Use the space/room selector in the terminal to set your context.');
        return;
      }

      openChat();
      isRunningRef.current = true;

      try {
        await runAgent(query, activeTab.id, spaceId, roomId);
      } finally {
        isRunningRef.current = false;
      }
    },
    [activeTab, openChat, runAgent, ensureTabTracked, startExecution, completeExecution, getProviderSession, ensureSession]
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

