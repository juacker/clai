import React, { useState } from 'react';
import MarkdownMessage from '../Chat/MarkdownMessage';
import styles from './ToolCallBlock.module.css';

/**
 * ToolCallBlock Component
 *
 * Displays a single tool call from an agent. Renders differently based on tool type:
 * - chat.message: Agent text message to user
 * - netdata.query: Shows query params and streaming/final response
 * - canvas.*: Shows what was added to canvas
 * - dashboard.*: Shows what was added to dashboard
 * - Generic: Shows tool name, params, and result
 */
const ToolCallBlock = ({ toolCall }) => {
  const { tool, params, status, result, error, streamingContent } = toolCall;

  // Route to specific block type
  switch (tool) {
    case 'chat.message':
      return <ChatMessageBlock toolCall={toolCall} />;
    case 'netdata.query':
      return <NetdataQueryBlock toolCall={toolCall} />;
    case 'canvas.addChart':
    case 'canvas.addMarkdown':
    case 'canvas.addStatusBadge':
    case 'canvas.addEdge':
    case 'canvas.removeNode':
    case 'canvas.updateNode':
    case 'canvas.clear':
      return <CanvasToolBlock toolCall={toolCall} />;
    case 'dashboard.addChart':
    case 'dashboard.removeChart':
    case 'dashboard.setTimeRange':
      return <DashboardToolBlock toolCall={toolCall} />;
    case 'tabs.splitTile':
    case 'tabs.removeTile':
    case 'tabs.getTileLayout':
    case 'tabs.getCommandContent':
      return <TabsToolBlock toolCall={toolCall} />;
    default:
      return <GenericToolBlock toolCall={toolCall} />;
  }
};

/**
 * ChatMessageBlock - Displays agent text messages
 *
 * This is used when the agent calls chat.message to communicate
 * directly with the user. Renders as a distinct message block.
 */
const ChatMessageBlock = ({ toolCall }) => {
  const { params, status, result } = toolCall;
  // Message content comes from params (during call) or result (after completion)
  const message = params?.message || result?.message || '';
  const messageType = params?.messageType || result?.messageType || 'info';

  // Get icon based on message type
  const getIcon = () => {
    switch (messageType) {
      case 'question':
        return '❓';
      case 'result':
        return '✨';
      case 'error':
        return '⚠️';
      case 'info':
      default:
        return '💬';
    }
  };

  return (
    <div className={`${styles.agentMessage} ${styles[`messageType_${messageType}`] || ''}`}>
      <div className={styles.agentMessageHeader}>
        <span className={styles.agentMessageIcon}>{getIcon()}</span>
        <span className={styles.agentMessageRole}>Clai</span>
        {status === 'pending' && <span className={styles.compactSpinner}></span>}
      </div>
      <div className={styles.agentMessageContent}>
        <MarkdownMessage content={message} isStreaming={status === 'pending'} />
      </div>
    </div>
  );
};

/**
 * NetdataQueryBlock - Shows Netdata AI query and response
 */
const NetdataQueryBlock = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { params, status, result, streamingContent } = toolCall;

  const displayContent = streamingContent || result?.response || result;

  return (
    <div className={styles.toolBlock}>
      <div
        className={styles.toolHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIcon}>🔍</span>
          <span className={styles.toolName}>Netdata Query</span>
          <StatusIndicator status={status} />
        </div>
        <div className={styles.toolHeaderRight}>
          <span
            className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
          >
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.toolContent}>
          {/* Query */}
          {params?.query && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Query</div>
              <div className={styles.queryText}>{params.query}</div>
            </div>
          )}

          {/* Response */}
          {displayContent && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Response</div>
              <div className={styles.responseContent}>
                <MarkdownMessage
                  content={typeof displayContent === 'string' ? displayContent : JSON.stringify(displayContent, null, 2)}
                  isStreaming={status === 'pending'}
                />
              </div>
            </div>
          )}

          {/* Loading state */}
          {status === 'pending' && !displayContent && (
            <div className={styles.loadingState}>
              <span className={styles.spinner}></span>
              <span>Querying Netdata...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * CanvasToolBlock - Shows canvas operations
 */
const CanvasToolBlock = ({ toolCall }) => {
  const { tool, params, status, result, error } = toolCall;

  const getDescription = () => {
    switch (tool) {
      case 'canvas.addChart':
        return `Added chart: ${params?.title || params?.context || 'Chart'}`;
      case 'canvas.addMarkdown':
        return `Added text: ${(params?.content || '').substring(0, 50)}${(params?.content || '').length > 50 ? '...' : ''}`;
      case 'canvas.addStatusBadge':
        return `Added badge: ${params?.label || 'Status'}`;
      case 'canvas.addEdge':
        return 'Added connection';
      case 'canvas.removeNode':
        return `Removed node: ${params?.nodeId || 'node'}`;
      case 'canvas.updateNode':
        return `Updated node: ${params?.nodeId || 'node'}`;
      case 'canvas.clear':
        return 'Cleared canvas';
      default:
        return tool;
    }
  };

  return (
    <div className={styles.compactBlock}>
      <span className={styles.compactIcon}>🎨</span>
      <span className={styles.compactText}>{getDescription()}</span>
      <StatusIndicator status={status} compact />
    </div>
  );
};

/**
 * DashboardToolBlock - Shows dashboard operations
 */
const DashboardToolBlock = ({ toolCall }) => {
  const { tool, params, status } = toolCall;

  const getDescription = () => {
    switch (tool) {
      case 'dashboard.addChart':
        return `Added chart: ${params?.config?.title || params?.config?.context || 'Chart'}`;
      case 'dashboard.removeChart':
        return `Removed chart: ${params?.chartId || 'chart'}`;
      case 'dashboard.setTimeRange':
        return 'Updated time range';
      default:
        return tool;
    }
  };

  return (
    <div className={styles.compactBlock}>
      <span className={styles.compactIcon}>📊</span>
      <span className={styles.compactText}>{getDescription()}</span>
      <StatusIndicator status={status} compact />
    </div>
  );
};

/**
 * TabsToolBlock - Shows tab operations
 */
const TabsToolBlock = ({ toolCall }) => {
  const { tool, params, status } = toolCall;

  const getDescription = () => {
    switch (tool) {
      case 'tabs.splitTile':
        return `Split tile ${params?.direction || ''}`;
      case 'tabs.removeTile':
        return 'Removed tile';
      case 'tabs.getTileLayout':
        return 'Retrieved layout';
      case 'tabs.getCommandContent':
        return 'Retrieved content';
      default:
        return tool;
    }
  };

  return (
    <div className={styles.compactBlock}>
      <span className={styles.compactIcon}>📑</span>
      <span className={styles.compactText}>{getDescription()}</span>
      <StatusIndicator status={status} compact />
    </div>
  );
};

/**
 * GenericToolBlock - Fallback for unknown tools
 */
const GenericToolBlock = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { tool, params, status, result, error } = toolCall;

  return (
    <div className={styles.toolBlock}>
      <div
        className={styles.toolHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIcon}>⚙</span>
          <span className={styles.toolName}>{tool}</span>
          <StatusIndicator status={status} />
        </div>
        <div className={styles.toolHeaderRight}>
          <span
            className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
          >
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.toolContent}>
          {/* Params */}
          {params && Object.keys(params).length > 0 && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Parameters</div>
              <pre className={styles.jsonDisplay}>
                <code>{JSON.stringify(params, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Result</div>
              <pre className={styles.jsonDisplay}>
                <code>{JSON.stringify(result, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Error</div>
              <div className={styles.errorText}>{error}</div>
            </div>
          )}

          {/* Loading state */}
          {status === 'pending' && !result && (
            <div className={styles.loadingState}>
              <span className={styles.spinner}></span>
              <span>Executing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * StatusIndicator - Shows pending/success/error status
 */
const StatusIndicator = ({ status, compact = false }) => {
  if (compact) {
    switch (status) {
      case 'pending':
        return <span className={styles.compactSpinner}></span>;
      case 'success':
        return <span className={styles.compactSuccess}>✓</span>;
      case 'error':
        return <span className={styles.compactError}>✗</span>;
      default:
        return null;
    }
  }

  switch (status) {
    case 'pending':
      return (
        <span className={styles.statusPending}>
          <span className={styles.spinner}></span>
          Running...
        </span>
      );
    case 'success':
      return (
        <span className={styles.statusSuccess}>
          <span className={styles.successIcon}>✓</span>
          Complete
        </span>
      );
    case 'error':
      return (
        <span className={styles.statusError}>
          <span className={styles.errorIcon}>✗</span>
          Failed
        </span>
      );
    default:
      return null;
  }
};

export default ToolCallBlock;
