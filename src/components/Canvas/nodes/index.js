/**
 * Canvas Custom Node Types
 *
 * Export all custom node types for React Flow registration.
 */

import ChartNode from './ChartNode';
import StatusBadgeNode from './StatusBadgeNode';
import TextNode from './TextNode';

// Re-export individual components
export { ChartNode, StatusBadgeNode, TextNode };

/**
 * Node types map for React Flow
 * Use this when configuring ReactFlow: <ReactFlow nodeTypes={nodeTypes} ... />
 */
export const nodeTypes = {
  chart: ChartNode,
  statusBadge: StatusBadgeNode,
  text: TextNode,
};
