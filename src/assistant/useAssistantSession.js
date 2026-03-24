/**
 * useAssistantSession Hook
 *
 * High-level hook that provides assistant session management for a tab.
 * Handles lazy session creation, message sending, and state access.
 */

import { useCallback, useRef } from 'react';
import useAssistantStore from './sessionStore';
import * as client from './client';

export function useAssistantSession(tabId) {
  const sessionId = useAssistantStore(
    (state) => state.activeSessionByTab[tabId]
  );
  const sessionState = useAssistantStore((state) =>
    sessionId ? state.sessions[sessionId] : null
  );

  // Use ref to avoid stale closures in callbacks
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /**
   * Ensure an assistant session exists for this tab.
   * Checks store → DB → creates new if needed.
   * Returns the session ID.
   */
  const ensureSession = useCallback(
    async (providerId, modelId, context = {}) => {
      const store = useAssistantStore.getState();

      // Match on provider, model, AND context (space/room)
      const contextSpaceId = context.spaceId || null;
      const contextRoomId = context.roomId || null;

      const sessionMatches = (s) =>
        s.modelId === modelId &&
        s.providerId === providerId &&
        (s.context?.spaceId || null) === contextSpaceId &&
        (s.context?.roomId || null) === contextRoomId;

      // Check if we already have a matching session for this tab
      const existingId = store.activeSessionByTab[tabId];
      if (existingId && store.sessions[existingId]) {
        const existing = store.sessions[existingId].session;
        if (sessionMatches(existing)) {
          return existingId;
        }
        // Config changed — remove stale mapping, create new session
        store.removeSession(existingId);
      }

      // Check DB for an existing session attached to this tab with matching config
      try {
        const sessions = await client.listSessions(tabId);
        const matching = sessions.find((s) => sessionMatches(s));
        if (matching) {
          const [messages, runs, toolCalls] = await Promise.all([
            client.loadSessionMessages(matching.id),
            client.listRuns(matching.id),
            client.listToolCalls(matching.id),
          ]);
          store.loadSessionData(matching.id, matching, messages, runs, toolCalls);
          store.setActiveSessionForTab(tabId, matching.id);
          return matching.id;
        }
      } catch (err) {
        console.warn('[useAssistantSession] Failed to check existing sessions:', err);
      }

      // Create a new session
      const session = await client.createSession({
        tabId,
        providerId,
        modelId,
        context,
      });
      store.initSession(session);
      store.setActiveSessionForTab(tabId, session.id);
      return session.id;
    },
    [tabId]
  );

  /**
   * Send a message in the current session.
   * The engine handles everything — events update the store.
   */
  const sendMessage = useCallback(
    async (text) => {
      const sid = sessionIdRef.current;
      if (!sid) throw new Error('No active assistant session for this tab');
      return client.sendMessage(sid, text);
    },
    []
  );

  /**
   * Clear all assistant sessions attached to this tab.
   * This prevents older context-specific sessions from being restored later.
   */
  const clearSessions = useCallback(async () => {
    const sessions = await client.listSessions(tabId);
    const store = useAssistantStore.getState();

    await Promise.all(sessions.map((session) => client.deleteSession(session.id)));

    sessions.forEach((session) => {
      store.removeSession(session.id);
    });
  }, [tabId]);

  return {
    sessionId,
    sessionState,
    session: sessionState?.session || null,
    messages: sessionState?.messages || [],
    runs: sessionState?.runs || [],
    streamingText: sessionState?.streamingTextByMessageId || {},
    isStreaming: sessionState?.isStreaming || false,
    ensureSession,
    sendMessage,
    clearSessions,
  };
}
