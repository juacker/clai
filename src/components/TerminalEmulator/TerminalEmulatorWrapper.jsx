/**
 * TerminalEmulatorWrapper
 *
 * Wraps the TerminalEmulator and provides it with access to the active tab's context.
 * This allows the global terminal to interact with the active tab's space/room/custom context.
 * Routes free-text terminal prompts into the assistant engine.
 *
 * @param {Object} props - Component props
 * @param {Object} props.userInfo - User information object
 */

import React, { useCallback } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useAssistantSession, useAssistantStore, assistantClient } from '../../assistant';
import TerminalEmulator from './TerminalEmulator';

const TerminalEmulatorWrapper = ({ userInfo }) => {
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { ensureSession } = useAssistantSession(activeTabId);

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
   * Handle sending a query through the assistant engine.
   */
  const handleSendToAgent = useCallback(
    async (query) => {
      if (!activeTab) {
        console.warn('[TerminalEmulatorWrapper] No active tab');
        return { error: 'No active tab available.' };
      }

      const providerSession = await getProviderSession();
      if (!providerSession) {
        openChat();
        return {
          error: 'Connect an assistant provider in Settings before sending prompts.',
        };
      }

      openChat();

      try {
        const model = (await assistantClient.getDefaultModel().catch(() => null)) || 'gpt-4o-mini';
        const spaceId = activeTab.context?.spaceRoom?.selectedSpaceId || null;
        const roomId = activeTab.context?.spaceRoom?.selectedRoomId || null;
        const mcpServerIds = getEnabledMcpServerIds(activeTab);
        const sessionId = await ensureSession(
          providerSession.providerId,
          model,
          { spaceId, roomId, mcpServerIds }
        );
        const result = await assistantClient.sendMessage(sessionId, query);
        const store = useAssistantStore.getState();
        store.addMessage(sessionId, result.message);
        return {};
      } catch (err) {
        console.error('[TerminalEmulatorWrapper] Assistant error:', err);
        return {
          error: typeof err === 'string' ? err : (err?.message || 'Assistant request failed.'),
        };
      }
    },
    [activeTab, openChat, getProviderSession, ensureSession]
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
  const getEnabledMcpServerIds = (tab) => {
    const attached = tab.context?.mcpServers?.attachedServerIds || tab.context?.mcpServers?.selectedServerIds || [];
    const disabled = new Set(tab.context?.mcpServers?.disabledServerIds || []);
    return attached.filter((id) => !disabled.has(id));
  };
