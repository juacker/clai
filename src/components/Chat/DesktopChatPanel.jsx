import React, { useEffect } from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useAssistantStore, assistantClient } from '../../assistant';
import AssistantChat from '../AssistantChat/AssistantChat';
import styles from './DesktopChatPanel.module.css';

const normalizeIdList = (ids) => [...(ids || [])].sort();
const getEnabledMcpServerIds = (context) => {
  const attached = context?.mcpServers?.attachedServerIds || context?.mcpServers?.selectedServerIds || [];
  const disabled = new Set(context?.mcpServers?.disabledServerIds || []);
  return attached.filter((id) => !disabled.has(id));
};

/**
 * DesktopChatPanel - Chat panel container
 *
 * This component provides a full-height, fixed-position panel
 * that appears on the right side of the screen.
 *
 * Renders the assistant chat for the active tab and restores session state
 * from the assistant runtime on mount/tab change.
 */
const DesktopChatPanel = () => {
  const { isCurrentChatOpen } = useChatManager();
  const { activeTabId, tabs } = useTabManager();
  const assistantSessionId = useAssistantStore(
    (state) => state.activeSessionByTab[activeTabId]
  );
  const isOpen = isCurrentChatOpen();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  // Restore existing assistant session from DB on tab change or when the
  // panel is opened after a background run attached a session later.
  useEffect(() => {
    if (!activeTabId || assistantSessionId || !isOpen) return;

    let cancelled = false;

    const restore = async () => {
      try {
        const sessions = await assistantClient.listSessions(activeTabId);
        if (cancelled || sessions.length === 0) return;

          const contextMcpServerIds = normalizeIdList(getEnabledMcpServerIds(activeTab?.context));

        const session =
          sessions.find((candidate) =>
            candidate &&
            JSON.stringify(normalizeIdList(candidate.context?.mcpServerIds || [])) ===
              JSON.stringify(contextMcpServerIds)
          ) || sessions[0];
        const [messages, runs, toolCalls] = await Promise.all([
          assistantClient.loadSessionMessages(session.id),
          assistantClient.listRuns(session.id),
          assistantClient.listToolCalls(session.id),
        ]);
        if (cancelled) return;

        const store = useAssistantStore.getState();
        const currentActiveSessionId = store.getActiveSessionForTab(activeTabId);
        if (currentActiveSessionId && currentActiveSessionId !== session.id) {
          return;
        }

        store.loadSessionData(session.id, session, messages, runs, toolCalls);
        store.setActiveSessionForTab(activeTabId, session.id);
      } catch {
        // No session exists yet — that's fine
      }
    };
    restore();

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeTabId, assistantSessionId, isOpen]);

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ''}`}
      role="complementary"
      aria-label="Chat panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        <AssistantChat tabId={activeTabId} />
      </div>
    </div>
  );
};

export default DesktopChatPanel;
