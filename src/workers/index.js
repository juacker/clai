/**
 * Workers Module
 *
 * This module provides the bridge between Rust AI workers and the React frontend.
 * It handles tool requests from workers and routes them to the appropriate
 * frontend components.
 */

export {
  initWorkerBridge,
  cleanupWorkerBridge,
  registerToolHandler,
  unregisterToolHandler,
  getRegisteredTools,
  setWorkerTab,
  getWorkerTab,
  clearWorkerTab,
} from './bridge';

export { useWorkerBridge } from './useWorkerBridge';
