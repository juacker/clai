/**
 * Canvas Component
 *
 * React Flow-based node canvas for AI agent visualization.
 * Agents can create nodes (charts, status badges, text) and
 * connect them with edges to visualize relationships.
 *
 * State is persisted per space/room in TabManagerContext.
 */

import React, { useCallback, useContext, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTabManager } from '../../contexts/TabManagerContext';
import TabContext from '../../contexts/TabContext';
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

  // Load state when space/room changes
  useEffect(() => {
    if (spaceRoomKey && spaceRoomKey !== prevSpaceRoomKeyRef.current) {
      const newState = getActiveCanvasState(spaceRoomKey);
      setNodes(newState.nodes);
      setEdges(newState.edges);
      prevSpaceRoomKeyRef.current = spaceRoomKey;
      isInitializedRef.current = true;
    } else if (spaceRoomKey && !isInitializedRef.current) {
      // Initial load
      isInitializedRef.current = true;
    }
  }, [spaceRoomKey, getActiveCanvasState, setNodes, setEdges]);

  // Save state when nodes or edges change
  useEffect(() => {
    if (spaceRoomKey && activeTabId && isInitializedRef.current) {
      // Debounce saving to avoid too many updates
      const timeoutId = setTimeout(() => {
        setCanvasState(activeTabId, nodes, edges, spaceRoomKey);
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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};

export default Canvas;
