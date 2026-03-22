/**
 * Assistant Event Reducer
 *
 * Subscribes to Tauri 'assistant://event' events and dispatches
 * updates to the assistant session store.
 *
 * Event envelope shape (from Rust serde):
 * {
 *   sessionId: string,
 *   runId: string | null,
 *   tabId: string | null,
 *   timestamp: number,
 *   event: {
 *     type: "session_created" | "message_created" | "run_queued" | ... ,
 *     payload: { ... }
 *   }
 * }
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import useAssistantStore from './sessionStore';

const ASSISTANT_EVENT_NAME = 'assistant://event';

export function useAssistantEvents() {
  useEffect(() => {
    const unlistenPromise = listen(ASSISTANT_EVENT_NAME, (tauriEvent) => {
      const envelope = tauriEvent.payload;
      if (!envelope || !envelope.event) return;

      const { sessionId } = envelope;
      const { type, payload } = envelope.event;
      const store = useAssistantStore.getState();

      switch (type) {
        case 'session_created':
          store.initSession(payload.session);
          break;

        case 'message_created':
          store.addMessage(sessionId, payload.message);
          break;

        case 'run_queued':
        case 'run_started':
        case 'run_completed':
        case 'run_failed':
        case 'run_cancelled':
          store.setRunStatus(sessionId, payload.run);
          break;

        case 'assistant_delta':
          store.appendDelta(sessionId, payload.messageId, payload.text);
          break;

        case 'assistant_message_completed':
          store.completeMessage(sessionId, payload.message);
          break;

        case 'tool_call_started':
        case 'tool_call_completed':
        case 'tool_call_failed':
          // Phase 3: tool execution events
          break;

        default:
          break;
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);
}
