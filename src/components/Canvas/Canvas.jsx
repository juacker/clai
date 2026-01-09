/**
 * Canvas Component
 *
 * React Flow-based node canvas for AI agent visualization.
 * Agents can create nodes (charts, status badges, markdown) and
 * connect them with edges to visualize relationships.
 *
 * State is owned by this component and persisted to localStorage
 * using the commandId. The component registers an API with the
 * CommandRegistry so agents can manipulate it.
 *
 * Custom Node Types:
 * - chart: Netdata chart visualization (see ChartNode)
 * - statusBadge: Status indicator with severity levels (see StatusBadgeNode)
 * - markdown: Markdown content (see MarkdownNode)
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';
import { useCommandRegistration } from '../../hooks/useCommandRegistration';
import { nodeTypes } from './nodes';
import styles from './Canvas.module.css';

/**
 * Apply force-directed layout to nodes
 * Connected nodes are pulled together, all nodes repel each other
 * Uses actual node dimensions for proper collision detection
 */
const applyForceLayout = (nodes, edges, width = 800, height = 600) => {
  if (nodes.length === 0) return nodes;

  // Create simulation nodes with current positions and actual dimensions
  const simNodes = nodes.map((node) => {
    // Use measured dimensions or fallback to data dimensions or defaults
    const nodeWidth = node.measured?.width || node.width || node.data?.width || 450;
    const nodeHeight = node.measured?.height || node.height || node.data?.height || 350;
    // For rectangular nodes with circular collision, use diagonal/2
    // This ensures corners don't overlap since circles must cover the full rectangle
    const diagonal = Math.sqrt(nodeWidth * nodeWidth + nodeHeight * nodeHeight);
    return {
      ...node,
      x: node.position.x + nodeWidth / 2,
      y: node.position.y + nodeHeight / 2,
      nodeWidth,
      nodeHeight,
      radius: diagonal / 2 + 10, // Small padding for visual breathing room
    };
  });

  // Create simulation links from edges
  const simLinks = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  // Create and run simulation - collision handles overlap, other forces for grouping
  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-800)) // Gentle repulsion
    .force('link', forceLink(simLinks).id((d) => d.id).distance(200).strength(0.5))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collision', forceCollide().radius((d) => d.radius).strength(1).iterations(4))
    .force('x', forceX(width / 2).strength(0.05))
    .force('y', forceY(height / 2).strength(0.05))
    .stop();

  // Run more simulation iterations for better convergence
  for (let i = 0; i < 500; i++) {
    simulation.tick();
  }

  // Map back to React Flow node format
  return nodes.map((node) => {
    const simNode = simNodes.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: simNode.x - simNode.nodeWidth / 2,
        y: simNode.y - simNode.nodeHeight / 2,
      },
    };
  });
};

/**
 * Custom controls panel - replaces default Controls for consistent styling
 */
const CanvasControls = ({ nodes, edges, setNodes, containerRef }) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const handleArrangeAndFit = useCallback(() => {
    if (nodes.length === 0) {
      fitView({ padding: 0.1, duration: 200 });
      return;
    }

    // Get actual canvas dimensions for better layout
    const width = containerRef.current?.offsetWidth || 1200;
    const height = containerRef.current?.offsetHeight || 800;

    // Apply force layout using actual dimensions
    const newNodes = applyForceLayout(nodes, edges, width, height);
    setNodes(newNodes);

    // Fit view immediately with quick animation
    requestAnimationFrame(() => {
      fitView({ padding: 0.1, duration: 200 });
    });
  }, [nodes, edges, setNodes, fitView, containerRef]);

  return (
    <Panel position="bottom-left" className={styles.controlsPanel}>
      <div className={styles.controlsStack}>
        <button className={styles.controlButton} onClick={() => zoomIn()} title="Zoom in">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className={styles.controlButton} onClick={() => zoomOut()} title="Zoom out">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className={styles.controlButton} onClick={handleArrangeAndFit} title="Arrange nodes and fit view">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      </div>
    </Panel>
  );
};

/**
 * Generate a unique node ID
 */
const generateNodeId = (prefix = 'node') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generate a unique edge ID
 */
const generateEdgeId = (sourceId, targetId) =>
  `edge_${sourceId}_${targetId}_${Date.now()}`;

/**
 * Get the localStorage key for a canvas
 * @param {string} commandId - Command ID
 * @returns {string} localStorage key
 */
const getStorageKey = (commandId) => `canvas_${commandId}`;

/**
 * Load canvas state from localStorage
 * @param {string} commandId - Command ID
 * @returns {{ nodes: Array, edges: Array }} Canvas state
 */
const loadCanvasState = (commandId) => {
  if (!commandId) return { nodes: [], edges: [] };

  try {
    const saved = localStorage.getItem(getStorageKey(commandId));
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
      };
    }
  } catch (e) {
    console.error('[Canvas] Failed to load state:', e);
  }

  return { nodes: [], edges: [] };
};

/**
 * Save canvas state to localStorage
 * @param {string} commandId - Command ID
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 */
const saveCanvasState = (commandId, nodes, edges) => {
  if (!commandId) return;

  try {
    localStorage.setItem(getStorageKey(commandId), JSON.stringify({ nodes, edges }));
  } catch (e) {
    console.error('[Canvas] Failed to save state:', e);
  }
};

const Canvas = ({ command }) => {
  const commandId = command?.id;

  // Load initial state from localStorage
  const initialState = useRef(loadCanvasState(commandId));

  // React Flow state - owned by this component
  const [nodes, setNodes, onNodesChange] = useNodesState(initialState.current.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialState.current.edges);

  // Ref for container dimensions
  const containerRef = useRef(null);

  // Track if initialized (for save debouncing)
  const isInitializedRef = useRef(false);

  // Initialize on first render
  useEffect(() => {
    isInitializedRef.current = true;
  }, []);

  // Save state to localStorage when it changes (debounced)
  useEffect(() => {
    if (!commandId || !isInitializedRef.current) return;

    const timeoutId = setTimeout(() => {
      saveCanvasState(commandId, nodes, edges);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [commandId, nodes, edges]);

  // Register API with CommandRegistry
  // This allows agents to manipulate the canvas
  useCommandRegistration(
    commandId,
    () => ({
      type: 'canvas',

      /**
       * Add a node to the canvas
       * @param {string} nodeType - Node type (chart, statusBadge, markdown)
       * @param {{ x: number, y: number }} position - Node position
       * @param {object} data - Node data
       * @returns {string} Generated node ID
       */
      addNode: (nodeType, position, data) => {
        const nodeId = generateNodeId(nodeType);

        // Default dimensions per node type
        const defaultDimensions = {
          chart: { width: data?.width || 450, height: data?.height || 350 },
          markdown: { width: data?.width || 400, height: data?.height || 200 },
          statusBadge: { width: data?.width || 200, height: data?.height || 120 },
        };
        const dims = defaultDimensions[nodeType] || { width: 300, height: 200 };

        const node = {
          id: nodeId,
          type: nodeType,
          position,
          data,
          style: { width: dims.width, height: dims.height },
        };
        setNodes((prev) => [...prev, node]);
        return nodeId;
      },

      // Remove a node (and its connected edges)
      removeNode: (nodeId) => {
        setNodes((prev) => prev.filter((n) => n.id !== nodeId));
        setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
        return true;
      },

      // Update a node's position or data
      updateNode: (nodeId, updates) => {
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== nodeId) return n;
            return {
              ...n,
              position: updates.position ?? n.position,
              data: updates.data ? { ...n.data, ...updates.data } : n.data,
            };
          })
        );
        return true;
      },

      /**
       * Add an edge between two nodes
       * @param {string} sourceId - Source node ID
       * @param {string} targetId - Target node ID
       * @param {object} options - Edge options (label, animated)
       * @returns {string} Generated edge ID
       */
      addEdge: (sourceId, targetId, options = {}) => {
        const edgeId = generateEdgeId(sourceId, targetId);
        const edge = {
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: options.animated !== false,
          label: options.label || undefined,
        };
        setEdges((prev) => [...prev, edge]);
        return edgeId;
      },

      // Remove an edge
      removeEdge: (edgeId) => {
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
        return true;
      },

      // Get all nodes
      getNodes: () => nodes,

      // Get all edges
      getEdges: () => edges,

      // Clear all nodes and edges
      clear: () => {
        setNodes([]);
        setEdges([]);
      },
    }),
    [nodes, edges, setNodes, setEdges]
  );

  // Handle new connections from user interaction
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Show placeholder if no commandId
  if (!commandId) {
    return (
      <div className={styles.canvasWrapper}>
        <div className={styles.noContext}>
          Canvas not initialized
        </div>
      </div>
    );
  }

  return (
    <div className={styles.canvasWrapper} ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionKeyCode={['Shift']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
        }}
      >
        <CanvasControls nodes={nodes} edges={edges} setNodes={setNodes} containerRef={containerRef} />
        <MiniMap
          nodeStrokeColor="#00ab44"
          nodeColor="#f0f0f0"
          nodeBorderRadius={4}
          maskColor="rgba(0, 0, 0, 0.1)"
          className={styles.minimap}
        />
        <Background variant="dots" gap={12} size={1} color="#ddd" />
      </ReactFlow>
    </div>
  );
};

export default Canvas;
