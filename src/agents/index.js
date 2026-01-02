/**
 * Agents Module
 *
 * This module provides the bridge between Rust AI agents and the React frontend.
 * It handles tool requests from agents and routes them to the appropriate
 * frontend components.
 */

export {
  initAgentBridge,
  cleanupAgentBridge,
  registerToolHandler,
  unregisterToolHandler,
  getRegisteredTools,
  setAgentTab,
  getAgentTab,
  clearAgentTab,
} from './bridge';

export { useAgentBridge } from './useAgentBridge';
