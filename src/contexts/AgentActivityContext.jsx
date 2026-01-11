import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { subscribe } from '../agents/activityBus';

/**
 * AgentActivityContext
 *
 * Manages agent activity state per tab. Each tab has its own activity stream
 * that tracks messages (user and assistant) with their content blocks.
 *
 * This context subscribes to the activity bus and processes SSE stream events.
 * AgentChat components use this context to display agent activity.
 *
 * The data model follows the SSE stream format:
 * - Messages contain contentBlocks (text, tool_use, tool_result)
 * - Tool_use and tool_result share the same ID for pairing
 * - Content builds up incrementally via deltas
 *
 * Activity state per tab:
 * {
 *   status: 'idle' | 'running' | 'completed' | 'error',
 *   streamingMessages: [
 *     {
 *       id: string,
 *       role: 'user' | 'assistant',
 *       contentBlocks: [
 *         { type: 'text', text: string } |
 *         { type: 'tool_use', id: string, name: string, input: object, partialInput: string } |
 *         { type: 'tool_result', id: string, text: string }
 *       ],
 *       isStreaming: boolean,
 *       timestamp: number,
 *       provider: object | null,  // AI provider that generated this message (for assistant messages)
 *     }
 *   ],
 *   startedAt: number | null,
 *   completedAt: number | null,
 *   error: string | null,
 *   currentProvider: object | null,  // Provider for current/last execution
 * }
 */

const AgentActivityContext = createContext(null);

export const useAgentActivity = () => {
  const context = useContext(AgentActivityContext);
  if (!context) {
    throw new Error(
      'useAgentActivity must be used within an AgentActivityProvider'
    );
  }
  return context;
};

/**
 * Create initial activity state for a tab.
 */
const createInitialActivity = () => ({
  status: 'idle',
  streamingMessages: [], // SSE-style messages with contentBlocks
  startedAt: null,
  completedAt: null,
  error: null,
  currentProvider: null, // Provider for current execution
  spaceId: null, // Agent's space ID (from SSE stream envelope)
  roomId: null, // Agent's room ID (from SSE stream envelope)
});

export const AgentActivityProvider = ({ children }) => {
  // Store activity state per tab: { tabId: activityState }
  const [activities, setActivities] = useState({});

  // Track which tabs we're subscribed to
  const subscriptionsRef = useRef(new Map()); // tabId -> unsubscribe function

  // Ref for accessing current activities without causing re-subscriptions
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;

  /**
   * Get activity for a specific tab.
   */
  const getActivity = useCallback((tabId) => {
    return activitiesRef.current[tabId] || createInitialActivity();
  }, []);

  /**
   * Initialize activity tracking for a tab.
   */
  const initializeActivity = useCallback((tabId) => {
    if (!activitiesRef.current[tabId]) {
      setActivities((prev) => ({
        ...prev,
        [tabId]: createInitialActivity(),
      }));
    }
  }, []);

  /**
   * Mark agent execution as started.
   * Adds the user's query as a message and keeps previous history.
   * @param {string} tabId - The tab ID
   * @param {string} query - The user's query
   * @param {object} provider - The AI provider being used for this execution
   */
  const startExecution = useCallback((tabId, query, provider = null) => {
    setActivities((prev) => {
      const current = prev[tabId] || createInitialActivity();
      const timestamp = Date.now();

      // Create a user message for the query
      const userMessage = {
        id: `user-${timestamp}`,
        role: 'user',
        contentBlocks: [{ type: 'text', text: query }],
        isStreaming: false,
        timestamp,
        provider: null, // User messages don't have a provider
      };

      return {
        ...prev,
        [tabId]: {
          ...current,
          status: 'running',
          streamingMessages: [...current.streamingMessages, userMessage],
          startedAt: timestamp,
          completedAt: null,
          error: null,
          currentProvider: provider, // Store the provider for this execution
        },
      };
    });
  }, []);

  /**
   * Mark agent execution as completed.
   */
  const completeExecution = useCallback((tabId, error = null) => {
    setActivities((prev) => {
      const current = prev[tabId];
      if (!current) return prev;

      return {
        ...prev,
        [tabId]: {
          ...current,
          status: error ? 'error' : 'completed',
          completedAt: Date.now(),
          error,
        },
      };
    });
  }, []);

  /**
   * Clear activity for a tab.
   */
  const clearActivity = useCallback((tabId) => {
    setActivities((prev) => ({
      ...prev,
      [tabId]: createInitialActivity(),
    }));
  }, []);

  /**
   * Handle SSE stream events - properly processes all SSE event types
   * to build up messages with content blocks (text, tool_use, tool_result).
   *
   * The payload structure can vary:
   * - Direct SSE: { type, message, content_block, delta, index }
   * - Wrapped: { message: {...}, content_block: {...}, delta: {...}, index }
   */
  const handleSSEStreamEvent = useCallback((tabId, event) => {
    const { eventType, payload, spaceId, roomId } = event;

    // Handle both wrapped and direct payload structures
    const data = payload || {};

    setActivities((prev) => {
      const current = prev[tabId] || createInitialActivity();
      let streamingMessages = [...current.streamingMessages];

      // Store spaceId/roomId from envelope (constant per agent session)
      const updatedSpaceId = spaceId || current.spaceId;
      const updatedRoomId = roomId || current.roomId;

      switch (eventType) {
        case 'message_start': {
          // New message started (user or assistant)
          // All messages from the SSE stream are part of the agent session,
          // so they all get the current provider (for icon display)
          const message = data.message || data;
          if (message && message.id) {
            const isAssistant = (message.role || 'assistant') === 'assistant';
            streamingMessages.push({
              id: message.id,
              role: message.role || 'assistant',
              contentBlocks: [],
              isStreaming: isAssistant,
              timestamp: Date.now(),
              // Store the current provider for all SSE messages (they're all from the agent)
              provider: current.currentProvider,
            });
          }
          break;
        }

        case 'content_block_start': {
          // New content block started within current message
          const contentBlock = data.content_block || data;
          const blockIndex = data.index;

          if (streamingMessages.length > 0) {
            const lastMsg = { ...streamingMessages[streamingMessages.length - 1] };
            lastMsg.contentBlocks = [...(lastMsg.contentBlocks || [])];

            const idx = blockIndex !== undefined ? blockIndex : lastMsg.contentBlocks.length;

            // Validate content block has required type property
            if (!contentBlock || !contentBlock.type) {
              // AI provider sent malformed block - log warning and create error placeholder
              console.warn('[AgentActivityContext] Received content_block_start without type property:', {
                contentBlock,
                blockIndex,
                hint: 'This may indicate the AI model does not fully support tool use.',
              });
              // Create a malformed block placeholder so UI can display a warning
              lastMsg.contentBlocks[idx] = {
                type: 'malformed',
                error: 'AI model returned invalid block (missing type property)',
                rawData: contentBlock,
              };
              streamingMessages[streamingMessages.length - 1] = lastMsg;
              break;
            }

            if (contentBlock.type === 'tool_use') {
              lastMsg.contentBlocks[idx] = {
                type: 'tool_use',
                id: contentBlock.id,
                name: contentBlock.name,
                input: contentBlock.input || {},
                partialInput: '',
              };
            } else if (contentBlock.type === 'tool_result') {
              lastMsg.contentBlocks[idx] = {
                type: 'tool_result',
                id: contentBlock.id,
                text: '',
              };
            } else if (contentBlock.type === 'text') {
              lastMsg.contentBlocks[idx] = {
                type: 'text',
                text: contentBlock.text || '',
              };
            } else {
              // Unknown block type - create placeholder with original data
              console.warn('[AgentActivityContext] Received content_block_start with unknown type:', contentBlock.type);
              lastMsg.contentBlocks[idx] = {
                type: 'unknown',
                originalType: contentBlock.type,
                rawData: contentBlock,
              };
            }

            streamingMessages[streamingMessages.length - 1] = lastMsg;
          }
          break;
        }

        case 'content_block_delta': {
          // Incremental content received
          const delta = data.delta || data;
          const blockIndex = data.index;

          if (streamingMessages.length > 0) {
            const lastMsg = { ...streamingMessages[streamingMessages.length - 1] };
            lastMsg.contentBlocks = [...(lastMsg.contentBlocks || [])];

            const idx = blockIndex !== undefined ? blockIndex : 0;

            if (delta?.type === 'text_delta' && delta.text) {
              // Text content delta
              if (!lastMsg.contentBlocks[idx]) {
                lastMsg.contentBlocks[idx] = { type: 'text', text: '' };
              } else {
                lastMsg.contentBlocks[idx] = { ...lastMsg.contentBlocks[idx] };
              }
              lastMsg.contentBlocks[idx].text =
                (lastMsg.contentBlocks[idx].text || '') + delta.text;
            } else if (delta?.type === 'input_json_delta') {
              // Tool input JSON delta
              const partialJson = delta.partial_json || '';
              if (lastMsg.contentBlocks[idx]) {
                lastMsg.contentBlocks[idx] = { ...lastMsg.contentBlocks[idx] };
                const block = lastMsg.contentBlocks[idx];
                block.partialInput = (block.partialInput || '') + partialJson;

                // Try to parse the accumulated JSON
                if (partialJson) {
                  try {
                    block.input = JSON.parse(block.partialInput);
                  } catch (e) {
                    // JSON not complete yet, keep accumulating
                  }
                }
              }
            }

            streamingMessages[streamingMessages.length - 1] = lastMsg;
          }
          break;
        }

        case 'content_block_stop': {
          // Content block complete - no action needed, block is already built
          break;
        }

        case 'message_stop': {
          // Message complete
          if (streamingMessages.length > 0) {
            const lastMsg = { ...streamingMessages[streamingMessages.length - 1] };
            lastMsg.isStreaming = false;
            streamingMessages[streamingMessages.length - 1] = lastMsg;
          }
          break;
        }

        default:
          // Unknown event type, ignore
          break;
      }

      return {
        ...prev,
        [tabId]: {
          ...current,
          streamingMessages,
          status: 'running',
          spaceId: updatedSpaceId,
          roomId: updatedRoomId,
        },
      };
    });
  }, []);

  /**
   * Remove activity tracking for a tab (when tab is closed).
   */
  const removeActivity = useCallback((tabId) => {
    // Unsubscribe from events
    const unsubscribe = subscriptionsRef.current.get(tabId);
    if (unsubscribe) {
      unsubscribe();
      subscriptionsRef.current.delete(tabId);
    }

    // Remove from state
    setActivities((prev) => {
      const { [tabId]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Subscribe to activity bus events for a tab.
   * Handles SSE stream events to build up messages with content blocks.
   */
  const subscribeToTab = useCallback(
    (tabId) => {
      // Don't re-subscribe if already subscribed
      if (subscriptionsRef.current.has(tabId)) {
        return;
      }

      const unsubscribe = subscribe(tabId, (event) => {
        if (event.type === 'tool:stream') {
          // Process SSE events to build up messages
          handleSSEStreamEvent(tabId, event);
        }
        // Ignore other event types - SSE is the primary data source
      });

      subscriptionsRef.current.set(tabId, unsubscribe);
    },
    [handleSSEStreamEvent]
  );

  /**
   * Ensure a tab is being tracked and subscribed.
   */
  const ensureTabTracked = useCallback(
    (tabId) => {
      initializeActivity(tabId);
      subscribeToTab(tabId);
    },
    [initializeActivity, subscribeToTab]
  );

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      activities,
      getActivity,
      initializeActivity,
      startExecution,
      completeExecution,
      clearActivity,
      removeActivity,
      ensureTabTracked,
    }),
    [
      activities,
      getActivity,
      initializeActivity,
      startExecution,
      completeExecution,
      clearActivity,
      removeActivity,
      ensureTabTracked,
    ]
  );

  return (
    <AgentActivityContext.Provider value={value}>
      {children}
    </AgentActivityContext.Provider>
  );
};

export default AgentActivityContext;
