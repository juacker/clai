/**
 * Assistant Session Store
 *
 * Zustand store managing assistant session state per session and per tab.
 * Receives updates from the assistant event reducer (useAssistantEvents).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const createInitialSessionState = (session) => ({
  session,
  messages: [],
  runs: [],
  toolCalls: [],
  streamingTextByMessageId: {},
  isStreaming: false,
});

const useAssistantStore = create(
  devtools(
    immer((set, get) => ({
      // Record<sessionId, SessionState>
      sessions: {},
      // Record<tabId, sessionId>
      activeSessionByTab: {},

      setActiveSessionForTab: (tabId, sessionId) =>
        set((state) => {
          state.activeSessionByTab[tabId] = sessionId;
        }),

      getActiveSessionForTab: (tabId) => {
        return get().activeSessionByTab[tabId] || null;
      },

      initSession: (session) =>
        set((state) => {
          if (!state.sessions[session.id]) {
            state.sessions[session.id] = createInitialSessionState(session);
          }
          // Map tab to session if tab_id present
          if (session.tabId) {
            state.activeSessionByTab[session.tabId] = session.id;
          }
        }),

      addMessage: (sessionId, message) =>
        set((state) => {
          const s = state.sessions[sessionId];
          if (s) {
            // Avoid duplicates
            if (!s.messages.find((m) => m.id === message.id)) {
              s.messages.push(message);
            }
          }
        }),

      appendDelta: (sessionId, messageId, text) =>
        set((state) => {
          const s = state.sessions[sessionId];
          if (s) {
            s.streamingTextByMessageId[messageId] =
              (s.streamingTextByMessageId[messageId] || '') + text;
            s.isStreaming = true;
          }
        }),

      completeMessage: (sessionId, message) =>
        set((state) => {
          const s = state.sessions[sessionId];
          if (!s) return;
          const idx = s.messages.findIndex((m) => m.id === message.id);
          if (idx >= 0) {
            s.messages[idx] = message;
          }
          delete s.streamingTextByMessageId[message.id];
          // Only clear isStreaming if no more streaming messages
          if (Object.keys(s.streamingTextByMessageId).length === 0) {
            s.isStreaming = false;
          }
        }),

      setRunStatus: (sessionId, run) =>
        set((state) => {
          const s = state.sessions[sessionId];
          if (!s) return;
          const idx = s.runs.findIndex((r) => r.id === run.id);
          if (idx >= 0) {
            s.runs[idx] = run;
          } else {
            s.runs.push(run);
          }
          if (['completed', 'failed', 'cancelled'].includes(run.status)) {
            s.isStreaming = false;
            s.streamingTextByMessageId = {};
          }
        }),

      setToolCall: (sessionId, toolCall) =>
        set((state) => {
          const s = state.sessions[sessionId];
          if (!s) return;
          const idx = s.toolCalls.findIndex((tc) => tc.id === toolCall.id);
          if (idx >= 0) {
            s.toolCalls[idx] = toolCall;
          } else {
            s.toolCalls.push(toolCall);
          }
        }),

      loadSessionData: (sessionId, session, messages, runs = [], toolCalls = []) =>
        set((state) => {
          state.sessions[sessionId] = {
            ...createInitialSessionState(session),
            messages,
            runs,
            toolCalls,
          };
        }),

      removeSession: (sessionId) =>
        set((state) => {
          delete state.sessions[sessionId];
          // Clean up tab mappings
          for (const [tabId, sid] of Object.entries(
            state.activeSessionByTab
          )) {
            if (sid === sessionId) {
              delete state.activeSessionByTab[tabId];
            }
          }
        }),
    })),
    { name: 'assistant-store' }
  )
);

export default useAssistantStore;
