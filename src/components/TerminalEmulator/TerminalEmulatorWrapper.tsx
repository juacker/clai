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
import { useAssistantSession, useAssistantStore, assistantClient } from '../../assistant';
import { getOrCreateWorkspaceSession } from '../../workspace/client';
import TerminalEmulator from './TerminalEmulator';

interface TabLike {
  id: string;
  context?: {
    assistantConnectionId?: string | null;
    mcpServers?: {
      attachedServerIds?: string[];
      selectedServerIds?: string[];
      disabledServerIds?: string[];
    };
  } | null;
}

const getEnabledMcpServerIds = (tab: TabLike): string[] => {
  const attached = tab.context?.mcpServers?.attachedServerIds || tab.context?.mcpServers?.selectedServerIds || [];
  const disabled = new Set(tab.context?.mcpServers?.disabledServerIds || []);
  return attached.filter((id) => !disabled.has(id));
};

const errorMessage = (err: unknown, fallback: string): string =>
  typeof err === 'string' ? err : err instanceof Error ? err.message : fallback;

const TerminalEmulatorWrapper = () => {
  const location = useLocation();
  const { tabs, activeTabId, updateTabContext } = useTabManager();
  const { openChat } = useChatManager();
  const { ensureSession, isStreaming: tabIsStreaming } = useAssistantSession(activeTabId || '');
  const workspaceRouteMatch = location.pathname.match(/^\/workspace(?:\/([^/]+))?\/?$/);
  const isWorkspaceRoute = Boolean(workspaceRouteMatch);
  const currentWorkspaceId = workspaceRouteMatch?.[1]
    ? decodeURIComponent(workspaceRouteMatch[1])
    : 'default';

  // Track whether the active route's session has a non-terminal run so
  // the input can show queued-message wording while still accepting text.
  // Per route:
  //  - workspace: the workspace's canonical manager session, looked up by
  //    `workspace:<id>` tab-key (Workspace.tsx populates this on load).
  //  - default tab: the tab's own session via `useAssistantSession`.
  const workspaceSessionId = useAssistantStore(
    (state) => state.activeSessionByTab[`workspace:${currentWorkspaceId}`] || null
  );
  const workspaceIsStreaming = useAssistantStore(
    (state) => (workspaceSessionId ? !!state.sessions[workspaceSessionId]?.isStreaming : false)
  );

  const inputDisabled = isWorkspaceRoute ? workspaceIsStreaming : tabIsStreaming;

  // Get active tab
  const activeTab = tabs.find((t: TabLike) => t.id === activeTabId);

  // Handle context changes from the terminal
  const handleContextChange = (context: unknown) => {
    if (activeTab) {
      updateTabContext(activeTab.id, context as Record<string, unknown>);
    }
  };

  /**
   * Check if a provider session is configured.
   * Always fetches fresh — the invoke is fast and the user may have
   * connected/disconnected a provider since the last check.
   */
  const getEnabledProviderConnections = useCallback(async () => {
    try {
      const sessions = await assistantClient.listProviderConnections();
      return (sessions || []).filter((connection) => connection.enabled);
    } catch {
      return [];
    }
  }, []);

  const resolveTabConnectionId = useCallback(async (tab: TabLike | undefined): Promise<string | null> => {
    if (!tab) {
      return null;
    }

    // Legacy agent-derived tabs no longer exist; fall straight through to the
    // generic provider-connection picker.
    const connections = await getEnabledProviderConnections();
    if (connections.length === 0) {
      return null;
    }

    const existingId = tab.context?.assistantConnectionId;
    const selected = connections.find((connection) => connection.id === existingId) || connections[0]!;
    if (selected.id !== existingId) {
      updateTabContext(tab.id, { assistantConnectionId: selected.id });
    }
    return selected.id;
  }, [getEnabledProviderConnections, updateTabContext]);

  /**
   * Handle sending a query through the assistant engine.
   */
  const handleSendToAgent = useCallback(
    async (query: string): Promise<{ error?: string }> => {
      if (isWorkspaceRoute) {
        try {
          const binding = await getOrCreateWorkspaceSession(currentWorkspaceId);
          const connectionId = binding.providerConnectionId;
          if (!connectionId) {
            return {
              error: 'Add an enabled assistant provider connection before sending prompts from this workspace.',
            };
          }

          const store = useAssistantStore.getState();
          store.initSession(binding.session);

          // Bridge workspace session to the chat panel via a synthetic tab key
          const workspaceTabKey = `workspace:${currentWorkspaceId}`;
          store.setActiveSessionForTab(workspaceTabKey, binding.session.id);

          // Only open the side panel for agent workspaces — general workspaces
          // embed the chat directly in the page.
          if (binding.session.kind === 'background_job') {
            openChat();
          }

          const result = await assistantClient.sendMessage(binding.session.id, query, connectionId);
          store.addMessage(binding.session.id, result.message);
          if (result.queued) {
            // Sent while a run was active — show the "Queued" chip until a
            // run picks it up (queued_messages_delivered clears it).
            store.markMessageQueued(binding.session.id, result.message.id);
          }
          return {};
        } catch (err) {
          console.error('[TerminalEmulatorWrapper] Workspace assistant error:', err);
          return {
            error: errorMessage(err, 'Assistant request failed.'),
          };
        }
      }

      if (!activeTab) {
        console.warn('[TerminalEmulatorWrapper] No active tab');
        return { error: 'No active tab available.' };
      }

      const connectionId = await resolveTabConnectionId(activeTab);
      if (!connectionId) {
        openChat();
        return {
          error: 'Add an enabled assistant provider connection in Settings before sending prompts.',
        };
      }

      openChat();

      try {
        const mcpServerIds = getEnabledMcpServerIds(activeTab);
        const sessionId = await ensureSession({ mcpServerIds });
        const result = await assistantClient.sendMessage(sessionId, query, connectionId);
        const store = useAssistantStore.getState();
        store.addMessage(sessionId, result.message);
        if (result.queued) {
          store.markMessageQueued(sessionId, result.message.id);
        }
        return {};
      } catch (err) {
        console.error('[TerminalEmulatorWrapper] Assistant error:', err);
        return {
          error: errorMessage(err, 'Assistant request failed.'),
        };
      }
    },
    [
      activeTab,
      ensureSession,
      resolveTabConnectionId,
      openChat,
      currentWorkspaceId,
      isWorkspaceRoute,
    ]
  );

  const handleAgentCommand = useCallback(
    async (command: string): Promise<{ error?: string; message?: string }> => {
      const [name] = command.trim().split(/\s+/, 1);
      if (name !== 'compact') {
        return { error: `Unknown assistant command: /${name || command}` };
      }

      if (isWorkspaceRoute) {
        try {
          const binding = await getOrCreateWorkspaceSession(currentWorkspaceId);
          const connectionId = binding.providerConnectionId;
          if (!connectionId) {
            return {
              error: 'Add an enabled assistant provider connection before compacting this workspace session.',
            };
          }
          const store = useAssistantStore.getState();
          store.initSession(binding.session);
          store.setActiveSessionForTab(`workspace:${currentWorkspaceId}`, binding.session.id);
          const result = await assistantClient.compactSession(binding.session.id, connectionId);
          if (result.summaryMessage) {
            store.addMessage(binding.session.id, result.summaryMessage);
          }
          return {
            message: result.compaction
              ? result.compaction.strategy === 'session_rotation_summary'
                ? 'Conversation compacted. The CLI session will rotate on the next prompt.'
                : 'Conversation compacted.'
              : 'There is not enough history to compact yet.',
          };
        } catch (err) {
          console.error('[TerminalEmulatorWrapper] Workspace compaction error:', err);
          return {
            error: errorMessage(err, 'Compaction failed.'),
          };
        }
      }

      if (!activeTab) {
        return { error: 'No active tab available.' };
      }

      const connectionId = await resolveTabConnectionId(activeTab);
      if (!connectionId) {
        openChat();
        return {
          error: 'Add an enabled assistant provider connection in Settings before compacting.',
        };
      }

      try {
        const mcpServerIds = getEnabledMcpServerIds(activeTab);
        const sessionId = await ensureSession({ mcpServerIds });
        const result = await assistantClient.compactSession(sessionId, connectionId);
        if (result.summaryMessage) {
          useAssistantStore.getState().addMessage(sessionId, result.summaryMessage);
        }
        return {
          message: result.compaction
            ? result.compaction.strategy === 'session_rotation_summary'
              ? 'Conversation compacted. The CLI session will rotate on the next prompt.'
              : 'Conversation compacted.'
            : 'There is not enough history to compact yet.',
        };
      } catch (err) {
        console.error('[TerminalEmulatorWrapper] Assistant compaction error:', err);
        return {
          error: errorMessage(err, 'Compaction failed.'),
        };
      }
    },
    [
      activeTab,
      currentWorkspaceId,
      ensureSession,
      isWorkspaceRoute,
      openChat,
      resolveTabConnectionId,
    ]
  );

  // If no active tab, render terminal without context
  if (!activeTab) {
    return (
      <TerminalEmulator
        onSendToChat={handleSendToAgent}
        onAgentCommand={handleAgentCommand}
        agentWorking={inputDisabled}
      />
    );
  }

  // Wrap terminal with the active tab's context
  return (
    <TabContextProvider
      tabId={activeTab.id}
      initialContext={activeTab.context}
      onContextChange={handleContextChange}
    >
      <TerminalEmulator
        onSendToChat={handleSendToAgent}
        onAgentCommand={handleAgentCommand}
        agentWorking={inputDisabled}
      />
    </TabContextProvider>
  );
};

export default TerminalEmulatorWrapper;
