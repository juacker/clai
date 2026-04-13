import React, { memo, useMemo, useRef, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
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
import { nodeTypes } from '../../components/Canvas/nodes';
import MarkdownMessage from '../../components/Chat/MarkdownMessage';
import canvasStyles from '../../components/Canvas/Canvas.module.css';

/**
 * Apply force-directed layout to nodes.
 * Shared logic with Canvas.jsx — kept inline to avoid coupling.
 */
const applyForceLayout = (nodes, edges, width = 800, height = 600) => {
  if (nodes.length === 0) return nodes;

  const simNodes = nodes.map((node) => {
    const nodeWidth = node.measured?.width || node.width || node.data?.width || 450;
    const nodeHeight = node.measured?.height || node.height || node.data?.height || 350;
    const diagonal = Math.sqrt(nodeWidth * nodeWidth + nodeHeight * nodeHeight);
    return {
      ...node,
      x: node.position.x + nodeWidth / 2,
      y: node.position.y + nodeHeight / 2,
      nodeWidth,
      nodeHeight,
      radius: diagonal / 2 + 10,
    };
  });

  const simLinks = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  const simulation = forceSimulation(simNodes)
    .force('charge', forceManyBody().strength(-800))
    .force('link', forceLink(simLinks).id((d) => d.id).distance(200).strength(0.5))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collision', forceCollide().radius((d) => d.radius).strength(1).iterations(4))
    .force('x', forceX(width / 2).strength(0.05))
    .force('y', forceY(height / 2).strength(0.05))
    .stop();

  for (let i = 0; i < 500; i++) {
    simulation.tick();
  }

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

const CanvasControls = ({ nodes, edges, setNodes, containerRef }) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const handleArrangeAndFit = useCallback(() => {
    if (nodes.length === 0) {
      fitView({ padding: 0.1, duration: 200 });
      return;
    }
    const width = containerRef.current?.offsetWidth || 1200;
    const height = containerRef.current?.offsetHeight || 800;
    const newNodes = applyForceLayout(nodes, edges, width, height);
    setNodes(newNodes);
    requestAnimationFrame(() => {
      fitView({ padding: 0.1, duration: 200 });
    });
  }, [nodes, edges, setNodes, fitView, containerRef]);

  return (
    <Panel position="bottom-left" className={canvasStyles.controlsPanel}>
      <div className={canvasStyles.controlsStack}>
        <button className={canvasStyles.controlButton} onClick={() => zoomIn()} title="Zoom in">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className={canvasStyles.controlButton} onClick={() => zoomOut()} title="Zoom out">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className={canvasStyles.controlButton} onClick={handleArrangeAndFit} title="Arrange nodes and fit view">
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
 * Read-only canvas viewer for file-based .canvas.json artifacts.
 * Renders the same React Flow graph as the main Canvas component
 * but sources data from a JSON content string instead of SQLite command state.
 */
const CanvasViewerInner = memo(({ content }) => {
  const containerRef = useRef(null);
  const [instance, setInstance] = useState(null);

  const parsed = useMemo(() => {
    try {
      const data = JSON.parse(content);
      return {
        nodes: (data.nodes || []).map((n) => ({
          ...n,
          position: n.position || { x: 0, y: 0 },
        })),
        edges: (data.edges || []).map((e) => ({
          ...e,
          type: e.type || 'smoothstep',
          animated: false,
        })),
      };
    } catch {
      return null;
    }
  }, [content]);

  const [nodes, setNodes, onNodesChange] = useNodesState(parsed?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed?.edges || []);

  useEffect(() => {
    setNodes(parsed?.nodes || []);
    setEdges(parsed?.edges || []);
  }, [parsed, setEdges, setNodes]);

  useEffect(() => {
    if (!instance || !parsed) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      instance.fitView({ padding: 0.15, duration: 250 });
    });

    return () => cancelAnimationFrame(frame);
  }, [instance, parsed]);

  if (!parsed) {
    return <JsonFallback content={content} />;
  }

  return (
    <div className={canvasStyles.canvasWrapper} ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnDoubleClick={false}
        defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
        onInit={setInstance}
      >
        <CanvasControls nodes={nodes} edges={edges} setNodes={setNodes} containerRef={containerRef} />
        <Background variant="dots" gap={12} size={1} color="#ddd" />
      </ReactFlow>
    </div>
  );
});

CanvasViewerInner.displayName = 'CanvasViewerInner';

/**
 * Fallback: show raw JSON when parsing fails.
 */
const JsonFallback = ({ content }) => {
  let formatted = content;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    // keep raw
  }
  return <MarkdownMessage content={`\`\`\`json\n${formatted}\n\`\`\``} />;
};

/**
 * Wrapper that provides ReactFlowProvider for the canvas.
 * The slide-out panel has `position: relative` + `overflow: auto` on its body,
 * so we set a fixed height to give React Flow a concrete container.
 */
const CanvasViewer = memo(({ content }) => {
  return (
    <div style={{ height: '70vh', minHeight: 400 }}>
      <ReactFlowProvider>
        <CanvasViewerInner content={content} />
      </ReactFlowProvider>
    </div>
  );
});

CanvasViewer.displayName = 'CanvasViewer';

export default CanvasViewer;
