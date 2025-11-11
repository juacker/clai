import React, { useState } from 'react';
import MarkdownMessage from './MarkdownMessage';
import styles from './ToolBlock.module.css';

/**
 * ToolBlock Component
 *
 * Displays tool_use and tool_result content blocks in a collapsible format.
 * Similar to claude.ai's tool visualization.
 *
 * Props:
 * - toolUse: Object containing tool_use data { id, name, input }
 * - toolResult: Object containing tool_result data { id, text } (optional)
 * - isStreaming: Boolean indicating if the tool is currently streaming
 */

const ToolBlock = ({ toolUse, toolResult, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Format JSON input for display
  const formatJsonInput = (input) => {
    try {
      return JSON.stringify(input, null, 2);
    } catch (error) {
      return String(input);
    }
  };

  return (
    <div className={styles.toolBlock}>
      <div className={styles.toolHeader} onClick={toggleExpanded}>
        <div className={styles.toolHeaderLeft}>
          <span className={styles.toolIcon}>⚙</span>
          <span className={styles.toolName}>{toolUse.name}</span>
          {isStreaming && (
            <span className={styles.streamingIndicator}>
              <span className={styles.streamingDot}></span>
              Running...
            </span>
          )}
          {!isStreaming && toolResult && (
            <span className={styles.completedIndicator}>
              <span className={styles.completedIcon}>✓</span>
              Complete
            </span>
          )}
        </div>
        <div className={styles.toolHeaderRight}>
          <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.toolContent}>
          {/* Tool Input */}
          {toolUse.input && Object.keys(toolUse.input).length > 0 && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Input</div>
              <div className={styles.toolSectionContent}>
                <pre className={styles.jsonDisplay}>
                  <code>{formatJsonInput(toolUse.input)}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Tool Result */}
          {toolResult && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Result</div>
              <div className={styles.toolSectionContent}>
                <div className={styles.toolResult}>
                  <MarkdownMessage
                    content={toolResult.text || ''}
                    isStreaming={false}
                  />
                </div>
              </div>
            </div>
          )}

          {/* No result yet */}
          {!toolResult && !isStreaming && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionContent}>
                <div className={styles.noResult}>No result available</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolBlock;

