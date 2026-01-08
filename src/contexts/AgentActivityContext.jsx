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
 * that tracks tool calls, their status, and results.
 *
 * This context subscribes to the activity bus and updates state accordingly.
 * AgentChat components use this context to display agent activity.
 *
 * Activity state per tab:
 * {
 *   status: 'idle' | 'running' | 'completed' | 'error',
 *   query: string | null,
 *   startedAt: number | null,
 *   completedAt: number | null,
 *   error: string | null,
 *   toolCalls: [
 *     {
 *       id: string,
 *       tool: string,
 *       params: object,
 *       status: 'pending' | 'success' | 'error',
 *       result: object | null,
 *       error: string | null,
 *       timestamp: number,
 *       streamingContent: string | null,
 *     }
 *   ]
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
  query: null,
  startedAt: null,
  completedAt: null,
  error: null,
  toolCalls: [],
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
   * Keeps previous tool calls as history.
   */
  const startExecution = useCallback((tabId, query) => {
    setActivities((prev) => {
      const current = prev[tabId] || createInitialActivity();
      return {
        ...prev,
        [tabId]: {
          ...current,
          status: 'running',
          query,
          startedAt: Date.now(),
          completedAt: null,
          error: null,
          // Keep existing tool calls as history
        },
      };
    });
  }, []);

  /**
   * Add a new tool call (pending status).
   */
  const addToolCall = useCallback((tabId, toolCall) => {
    setActivities((prev) => {
      const current = prev[tabId] || createInitialActivity();
      return {
        ...prev,
        [tabId]: {
          ...current,
          toolCalls: [
            ...current.toolCalls,
            {
              ...toolCall,
              status: toolCall.status || 'pending',
              result: null,
              error: null,
              streamingContent: null,
            },
          ],
        },
      };
    });
  }, []);

  /**
   * Update an existing tool call.
   */
  const updateToolCall = useCallback((tabId, toolId, updates) => {
    setActivities((prev) => {
      const current = prev[tabId];
      if (!current) return prev;

      return {
        ...prev,
        [tabId]: {
          ...current,
          toolCalls: current.toolCalls.map((tc) =>
            tc.id === toolId ? { ...tc, ...updates } : tc
          ),
        },
      };
    });
  }, []);

  /**
   * Append streaming content to a tool call (for SSE responses).
   */
  const appendStreamingContent = useCallback((tabId, toolId, chunk) => {
    setActivities((prev) => {
      const current = prev[tabId];
      if (!current) return prev;

      return {
        ...prev,
        [tabId]: {
          ...current,
          toolCalls: current.toolCalls.map((tc) =>
            tc.id === toolId
              ? {
                  ...tc,
                  streamingContent: (tc.streamingContent || '') + chunk,
                }
              : tc
          ),
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
   */
  const subscribeToTab = useCallback(
    (tabId) => {
      // Don't re-subscribe if already subscribed
      if (subscriptionsRef.current.has(tabId)) {
        return;
      }

      const unsubscribe = subscribe(tabId, (event) => {
        switch (event.type) {
          case 'tool:start':
            addToolCall(tabId, {
              id: event.id,
              tool: event.tool,
              params: event.params,
              status: 'pending',
              timestamp: event.timestamp,
            });
            break;

          case 'tool:complete':
            updateToolCall(tabId, event.id, {
              status: 'success',
              result: event.result,
            });
            break;

          case 'tool:error':
            updateToolCall(tabId, event.id, {
              status: 'error',
              error: event.error,
            });
            break;

          case 'tool:stream':
            appendStreamingContent(tabId, event.id, event.chunk);
            break;

          default:
            console.warn('[AgentActivityContext] Unknown event type:', event.type);
        }
      });

      subscriptionsRef.current.set(tabId, unsubscribe);
    },
    [addToolCall, updateToolCall, appendStreamingContent]
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
      addToolCall,
      updateToolCall,
      appendStreamingContent,
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
      addToolCall,
      updateToolCall,
      appendStreamingContent,
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
