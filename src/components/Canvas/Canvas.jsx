/**
 * Canvas Component
 *
 * React Flow-based node canvas for AI agent visualization.
 * Agents can create nodes (charts, status badges, text) and
 * connect them with edges to visualize relationships.
 *
 * State is persisted per space/room in TabManagerContext.
 *
 * Custom Node Types:
 * - chart: Netdata chart visualization (see ChartNode)
 * - statusBadge: Status indicator with severity levels (see StatusBadgeNode)
 * - text: Text labels and annotations (see TextNode)
 */

import React, { useCallback, useContext, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTabManager } from '../../contexts/TabManagerContext';
import TabContext from '../../contexts/TabContext';
import { nodeTypes } from './nodes';
import styles from './Canvas.module.css';

const Canvas = ({ command }) => {
  const { activeTabId, getActiveCanvasState, setCanvasState } = useTabManager();
  const tabContext = useContext(TabContext);

  // Get space/room key for state persistence
  const spaceRoomKey = tabContext?.selectedSpace && tabContext?.selectedRoom
    ? `${tabContext.selectedSpace.id}_${tabContext.selectedRoom.id}`
    : null;

  // Track previous space/room to detect changes
  const prevSpaceRoomKeyRef = useRef(spaceRoomKey);

  // Get persisted state for current space/room
  const persistedState = spaceRoomKey ? getActiveCanvasState(spaceRoomKey) : { nodes: [], edges: [] };

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(persistedState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(persistedState.edges);

  // Track if we should save (avoid saving on initial load)
  const isInitializedRef = useRef(false);

  // Track if we're saving (to avoid sync loop)
  const isSavingRef = useRef(false);

  // Track local node/edge counts to detect external changes
  const localCountRef = useRef({ nodes: 0, edges: 0 });

  // Load state when space/room changes
  useEffect(() => {
    if (spaceRoomKey && spaceRoomKey !== prevSpaceRoomKeyRef.current) {
      const newState = getActiveCanvasState(spaceRoomKey);
      setNodes(newState.nodes);
      setEdges(newState.edges);
      localCountRef.current = { nodes: newState.nodes.length, edges: newState.edges.length };
      prevSpaceRoomKeyRef.current = spaceRoomKey;
      isInitializedRef.current = true;
    } else if (spaceRoomKey && !isInitializedRef.current) {
      // Initial load
      localCountRef.current = { nodes: persistedState.nodes.length, edges: persistedState.edges.length };
      isInitializedRef.current = true;
    }
  }, [spaceRoomKey, getActiveCanvasState, setNodes, setEdges, persistedState.nodes.length, persistedState.edges.length]);

  // Sync external state changes (from agent bridge)
  // This detects when the persisted state changes externally (not from local user interaction)
  useEffect(() => {
    if (!spaceRoomKey || !isInitializedRef.current || isSavingRef.current) return;

    const persistedNodeCount = persistedState.nodes.length;
    const persistedEdgeCount = persistedState.edges.length;
    const localNodeCount = localCountRef.current.nodes;
    const localEdgeCount = localCountRef.current.edges;

    // Check if persisted state has nodes/edges that don't match what we expect
    // This indicates an external change (e.g., from agent bridge)
    const hasExternalChanges =
      persistedNodeCount !== nodes.length ||
      persistedEdgeCount !== edges.length;

    if (hasExternalChanges) {
      // Check if this looks like an external addition (more items than we have locally)
      const looksExternal =
        persistedNodeCount > localNodeCount ||
        persistedEdgeCount > localEdgeCount;

      if (looksExternal) {
        // Sync from persisted state
        setNodes(persistedState.nodes);
        setEdges(persistedState.edges);
        localCountRef.current = { nodes: persistedNodeCount, edges: persistedEdgeCount };
      }
    }
  }, [spaceRoomKey, persistedState.nodes, persistedState.edges, nodes.length, edges.length, setNodes, setEdges]);

  // Update local count ref when local state changes
  useEffect(() => {
    localCountRef.current = { nodes: nodes.length, edges: edges.length };
  }, [nodes.length, edges.length]);

  // Save state when nodes or edges change
  useEffect(() => {
    if (spaceRoomKey && activeTabId && isInitializedRef.current) {
      // Mark that we're about to save (to prevent sync loop)
      isSavingRef.current = true;

      // Debounce saving to avoid too many updates
      const timeoutId = setTimeout(() => {
        setCanvasState(activeTabId, nodes, edges, spaceRoomKey);
        // Allow sync again after a short delay
        setTimeout(() => {
          isSavingRef.current = false;
        }, 100);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, edges, spaceRoomKey, activeTabId, setCanvasState]);

  // Handle new connections
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Show message if no space/room selected
  if (!spaceRoomKey) {
    return (
      <div className={styles.canvasWrapper}>
        <div className={styles.noContext}>
          Select a space and room to use the canvas
        </div>
      </div>
    );
  }

  return (
    <div className={styles.canvasWrapper}>
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
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
        }}
      >
        <Controls showInteractive={false} />
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
