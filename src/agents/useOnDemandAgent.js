/**
 * useOnDemandAgent Hook
 *
 * Provides functionality to run on-demand agent queries from the terminal.
 * This hook:
 * 1. Invokes the Rust `run_on_demand_agent` command
 * 2. Updates the AgentActivityContext based on the result
 */

import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAgentActivity } from '../contexts/AgentActivityContext';

/**
 * Hook for running on-demand agent queries.
 *
 * @returns {Object} Object containing:
 *   - runAgent: Function to run an on-demand agent query
 *   - isRunning: Boolean indicating if an agent is currently running
 */
export const useOnDemandAgent = () => {
  const { startExecution, completeExecution, ensureTabTracked } = useAgentActivity();

  // Track if an agent is currently running
  const isRunningRef = useRef(false);

  /**
   * Run an on-demand agent with the given query.
   *
   * @param {string} query - The user's question or request
   * @param {string} tabId - The tab ID where the agent's output should appear
   * @param {string} spaceId - The Netdata space ID for context
   * @param {string} roomId - The Netdata room ID for context
   * @returns {Promise<Object>} Result object with success status
   */
  const runAgent = useCallback(
    async (query, tabId, spaceId, roomId) => {
      if (isRunningRef.current) {
        console.warn('[useOnDemandAgent] Agent already running, ignoring request');
        return { success: false, error: 'Agent already running' };
      }

      if (!query || !tabId || !spaceId || !roomId) {
        console.error('[useOnDemandAgent] Missing required parameters');
        return { success: false, error: 'Missing required parameters' };
      }

      isRunningRef.current = true;

      // Ensure the tab is being tracked for activity
      ensureTabTracked(tabId);

      // Start tracking execution in the context
      startExecution(tabId, query);

      try {
        console.log('[useOnDemandAgent] Starting agent:', {
          query,
          tabId,
          spaceId,
          roomId,
        });

        // Invoke the Rust command
        const result = await invoke('run_on_demand_agent', {
          query,
          spaceId,
          roomId,
          tabId,
        });

        console.log('[useOnDemandAgent] Agent completed:', result);

        // Mark execution as complete based on result
        completeExecution(tabId, result.error || null);
        isRunningRef.current = false;

        return result;
      } catch (err) {
        console.error('[useOnDemandAgent] Agent error:', err);

        // Complete with error
        completeExecution(tabId, err.message || 'Unknown error');
        isRunningRef.current = false;

        return { success: false, error: err.message || 'Unknown error' };
      }
    },
    [startExecution, completeExecution, ensureTabTracked]
  );

  return {
    runAgent,
    isRunning: isRunningRef.current,
  };
};

export default useOnDemandAgent;
