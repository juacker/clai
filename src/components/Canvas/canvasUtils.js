/**
 * Canvas Utilities
 *
 * Helper functions for programmatic canvas manipulation.
 * These are used by the agent bridge to create/update/remove nodes.
 */

/**
 * Generate a unique node ID
 */
export const generateNodeId = (prefix = 'node') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create a chart node definition
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} context - Netdata metric context (e.g., "system.cpu")
 * @param {Object} options - Additional options
 * @returns {Object} Node definition for React Flow
 */
export const createChartNode = (x, y, context, options = {}) => ({
  id: options.id || generateNodeId('chart'),
  type: 'chart',
  position: { x, y },
  data: {
    context,
    title: options.title,
    groupBy: options.groupBy || [],
    filterBy: options.filterBy || {},
    timeRange: options.timeRange || '15m',
    width: options.width || 400,
    height: options.height || 300,
  },
});

/**
 * Create a status badge node definition
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} status - Status level: "healthy", "warning", "critical", "unknown"
 * @param {string} message - Status message
 * @param {Object} options - Additional options
 * @returns {Object} Node definition for React Flow
 */
export const createStatusBadgeNode = (x, y, status, message, options = {}) => ({
  id: options.id || generateNodeId('badge'),
  type: 'statusBadge',
  position: { x, y },
  data: {
    status,
    message,
    title: options.title,
    showTimestamp: options.showTimestamp || false,
    timestamp: options.timestamp || new Date().toISOString(),
  },
});

/**
 * Create a text node definition
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} text - Text content
 * @param {Object} options - Additional options
 * @returns {Object} Node definition for React Flow
 */
export const createTextNode = (x, y, text, options = {}) => ({
  id: options.id || generateNodeId('text'),
  type: 'text',
  position: { x, y },
  data: {
    text,
    size: options.size || 'medium',
    color: options.color,
    backgroundColor: options.backgroundColor,
    align: options.align || 'left',
    showHandles: options.showHandles !== false,
  },
});

/**
 * Create an edge definition
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {Object} options - Additional options
 * @returns {Object} Edge definition for React Flow
 */
export const createEdge = (sourceId, targetId, options = {}) => ({
  id: options.id || `edge_${sourceId}_${targetId}`,
  source: sourceId,
  target: targetId,
  type: options.type || 'smoothstep',
  animated: options.animated === true,
  label: options.label,
  style: options.style,
});

/**
 * Calculate grid position for auto-layout
 * @param {number} index - Node index in sequence
 * @param {number} columns - Number of columns in grid
 * @param {Object} options - Layout options
 * @returns {Object} Position { x, y }
 */
export const calculateGridPosition = (index, columns = 3, options = {}) => {
  const {
    startX = 50,
    startY = 50,
    gapX = 450,
    gapY = 350,
  } = options;

  const col = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: startX + col * gapX,
    y: startY + row * gapY,
  };
};

/**
 * Layout nodes in a vertical stack
 * @param {Array} nodes - Array of node definitions
 * @param {Object} options - Layout options
 * @returns {Array} Nodes with updated positions
 */
export const layoutVertical = (nodes, options = {}) => {
  const { startX = 50, startY = 50, gap = 200 } = options;

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: startX,
      y: startY + index * gap,
    },
  }));
};

/**
 * Layout nodes in a horizontal row
 * @param {Array} nodes - Array of node definitions
 * @param {Object} options - Layout options
 * @returns {Array} Nodes with updated positions
 */
export const layoutHorizontal = (nodes, options = {}) => {
  const { startX = 50, startY = 50, gap = 450 } = options;

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: startX + index * gap,
      y: startY,
    },
  }));
};
