/**
 * Viewer Registry
 *
 * Maps viewer type strings (returned by workspace_read_file) to React
 * components that render file content in the workspace slide-out panel.
 *
 * Each viewer component receives a single prop:
 *   content: string — the raw file content
 *
 * To add a new viewer:
 *   1. Create a component in src/workspace/viewers/
 *   2. Register it here with a viewer type key
 *   3. Ensure the backend returns that key for the matching file extension
 */

import { lazy } from 'react';

import MarkdownViewer from './MarkdownViewer';
import JsonViewer from './JsonViewer';
import TextViewer from './TextViewer';

// Canvas and Dashboard are heavier — lazy-load them
const CanvasViewer = lazy(() => import('./CanvasViewer'));
const DashboardViewer = lazy(() => import('./DashboardViewer'));

/**
 * Viewer type → Component mapping.
 *
 * The `viewer` field from workspace_read_file determines which entry is used.
 * Falls back to TextViewer for unknown types.
 */
const VIEWER_REGISTRY = {
  markdown: MarkdownViewer,
  json: JsonViewer,
  text: TextViewer,
  canvas: CanvasViewer,
  dashboard: DashboardViewer,
};

/**
 * Look up the viewer component for a given viewer type string.
 * Returns TextViewer as the default fallback.
 */
export const getViewer = (viewerType) =>
  VIEWER_REGISTRY[viewerType] || TextViewer;

export default VIEWER_REGISTRY;
