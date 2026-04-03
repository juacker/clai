/**
 * TerminalEmulatorWrapper
 *
 * Wraps the TerminalEmulator and provides it with access to the active tab's context.
 * Routes free-text terminal prompts into the assistant engine.
 */

import React, { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTabManager } from '../../contexts/TabManagerContext';
import { TabContextProvider } from '../../contexts/TabContext';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useFleet } from '../../contexts/FleetContext';
import { useAssistantSession, useAssistantStore, assistantClient } from '../../assistant';
import TerminalEmulator from './TerminalEmulator';

const getEnabledMcpServerIds = (tab) => {
  const attached = tab.context?.mcpServers?.attachedServerIds || tab.context?.mcpServers?.selectedServerIds || [];
  const disabled = new Set(tab.context?.mcpServers?.disabledServerIds || []);
  return attached.filter((id) => !disabled.has(id));
};

const TerminalEmulatorWrapper = () => {
  const location = useLocation();
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { isFleetRoute, selectedAgent, refresh: refreshFleet } = useFleet();
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
      if (location.pathname === '/fleet' && isFleetRoute) {
        if (!selectedAgent) {
          return { error: 'Select an agent in Fleet before sending a message.' };
        }

        const providerSession = await getProviderSession();
        if (!providerSession) {
          return {
            error: 'Connect an assistant provider in Settings before sending prompts.',
          };
        }

        try {
          const model = (await assistantClient.getDefaultModel().catch(() => null)) || 'gpt-4o-mini';
          let sessionId = selectedAgent.sessionId;

          if (!sessionId) {
            const createdSession = await assistantClient.createSession({
              tabId: selectedAgent.tabId || null,
              kind: 'background_job',
              title: selectedAgent.name,
              providerId: providerSession.providerId,
              modelId: model,
              context: {
                tabId: selectedAgent.tabId || null,
                mcpServerIds: selectedAgent.selectedMcpServerIds || [],
                execution: selectedAgent.execution || undefined,
                automationId: selectedAgent.agentId,
                agentWorkspaceId: selectedAgent.agentId,
                automationName: selectedAgent.name,
                automationDescription: selectedAgent.description || null,
              },
            });
            sessionId = createdSession.id;
            useAssistantStore.getState().initSession(createdSession);
            await refreshFleet().catch(() => {});
          }

          const result = await assistantClient.sendMessage(sessionId, query);
          const store = useAssistantStore.getState();
          store.addMessage(sessionId, result.message);
          return {};
        } catch (err) {
          console.error('[TerminalEmulatorWrapper] Fleet assistant error:', err);
          return {
            error: typeof err === 'string' ? err : (err?.message || 'Assistant request failed.'),
          };
        }
      }

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
        const mcpServerIds = getEnabledMcpServerIds(activeTab);
        const sessionId = await ensureSession(
          providerSession.providerId,
          model,
          { mcpServerIds }
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
    [
      activeTab,
      ensureSession,
      getProviderSession,
      isFleetRoute,
      location.pathname,
      openChat,
      refreshFleet,
      selectedAgent,
    ]
  );

  // If no active tab, render terminal without context
  if (!activeTab) {
    return <TerminalEmulator onSendToChat={handleSendToAgent} />;
  }

  // Wrap terminal with the active tab's context
  return (
    <TabContextProvider
      tabId={activeTab.id}
      initialContext={activeTab.context}
      onContextChange={handleContextChange}
    >
      <TerminalEmulator onSendToChat={handleSendToAgent} />
    </TabContextProvider>
  );
};

export default TerminalEmulatorWrapper;
