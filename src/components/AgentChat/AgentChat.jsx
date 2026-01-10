import React, { useEffect, useRef, useState } from 'react';
import { useAgentActivity } from '../../contexts/AgentActivityContext';
import { getAiProvider } from '../../api/client';
import MarkdownMessage from '../Chat/MarkdownMessage';
import UserAvatar from '../UserAvatar';
import styles from './AgentChat.module.css';

/**
 * AgentChat Component
 *
 * Displays agent activity for a specific tab. Shows:
 * - User messages in chronological order
 * - Assistant messages with text and tool calls
 * - Tool use blocks with their inputs and results
 *
 * The component renders SSE-streamed messages with their content blocks,
 * similar to the Chat component but optimized for agent activity display.
 *
 * This component subscribes to agent activity via AgentActivityContext
 * and updates in real-time as SSE events are processed.
 */
const AgentChat = ({ tabId, userInfo }) => {
  const { getActivity, ensureTabTracked } = useAgentActivity();
  const messagesEndRef = useRef(null);
  const [aiProvider, setAiProvider] = useState(null);

  // Fetch AI provider on mount and when it changes
  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const provider = await getAiProvider();
        setAiProvider(provider);
      } catch (err) {
        console.error('[AgentChat] Failed to get AI provider:', err);
      }
    };

    // Fetch on mount
    fetchProvider();

    // Listen for provider changes from settings
    const handleProviderChange = () => {
      fetchProvider();
    };
    window.addEventListener('ai-provider-changed', handleProviderChange);

    return () => {
      window.removeEventListener('ai-provider-changed', handleProviderChange);
    };
  }, []);

  // Ensure we're tracking this tab
  useEffect(() => {
    if (tabId) {
      ensureTabTracked(tabId);
    }
  }, [tabId, ensureTabTracked]);

  const activity = getActivity(tabId);
  const { streamingMessages = [], status, error } = activity;

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingMessages]);

  // Empty state
  if (status === 'idle' && streamingMessages.length === 0) {
    return (
      <div className={styles.agentChat}>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No activity yet</div>
          <div className={styles.emptyDescription}>
            Type a message in the terminal to start a conversation.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.agentChat}>
      <div className={styles.activityList}>
        {/* Render all messages */}
        {streamingMessages.map((message) => (
          <MessageBlock
            key={message.id}
            message={message}
            userInfo={userInfo}
            aiProvider={aiProvider}
          />
        ))}

        {/* Running Indicator - show at bottom when agent is running */}
        {status === 'running' && (
          <div className={styles.runningIndicator}>
            <img
              src="/icon.svg"
              alt="Clai"
              className={styles.runningIcon}
            />
          </div>
        )}

        {/* Error Status */}
        {status === 'error' && (
          <ErrorMessage error={error} />
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

/**
 * Get provider icon based on AI provider type
 */
const getProviderIcon = (aiProvider) => {
  const providerType = aiProvider?.provider?.type || aiProvider?.provider;

  if (providerType === 'opencode' || providerType === 'OpenCode') {
    return (
      <img
        src="/icons/opencode.svg"
        alt="OpenCode"
        className={styles.providerIcon}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  if (providerType === 'claude' || providerType === 'Claude') {
    return (
      <img
        src="/icons/claude.svg"
        alt="Claude"
        className={styles.providerIcon}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  if (providerType === 'gemini' || providerType === 'Gemini') {
    return (
      <img
        src="/icons/gemini.svg"
        alt="Gemini"
        className={styles.providerIcon}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  if (providerType === 'openai' || providerType === 'OpenAI') {
    return (
      <img
        src="/icons/openai.svg"
        alt="OpenAI"
        className={styles.providerIcon}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    );
  }

  // Default Clai icon
  return (
    <img
      src="/icon.svg"
      alt="Clai"
      className={styles.providerIcon}
    />
  );
};

/**
 * Netdata icon component
 */
const NetdataIcon = () => (
  <img
    src="/icons/netdata.svg"
    alt="Netdata"
    className={styles.providerIcon}
    onError={(e) => { e.target.style.display = 'none'; }}
  />
);

/**
 * Format timestamp for display
 */
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * MessageBlock - Renders a single message (user or assistant) with its content blocks
 */
const MessageBlock = ({ message, userInfo, aiProvider }) => {
  const { role, contentBlocks = [], isStreaming, timestamp } = message;

  // Build a map of tool results by ID for quick lookup
  const toolResultsMap = {};
  contentBlocks.forEach(block => {
    if (block.type === 'tool_result' && block.id) {
      toolResultsMap[block.id] = block;
    }
  });

  // For user messages, check if it's a [@clai] message (agent-initiated query)
  if (role === 'user') {
    const textContent = contentBlocks
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!textContent) return null;

    // Check if message starts with [@clai] - this is an agent-initiated query
    const isAgentQuery = textContent.startsWith('[@clai]');
    const displayText = isAgentQuery ? textContent.replace(/^\[@clai\]\s*/, '') : textContent;

    if (isAgentQuery) {
      // Show as internal communication: AI provider querying Netdata (white background)
      // e.g., "Gemini → Netdata" - same styling as Netdata responses
      return (
        <div className={styles.assistantMessage}>
          <div className={styles.messageHeader}>
            {getProviderIcon(aiProvider)}
            <span className={styles.messageRoleText}>{aiProvider?.name || 'AI Agent'}</span>
            <span className={styles.queryArrow}>→</span>
            <NetdataIcon />
            <span className={styles.messageRoleText}>Netdata</span>
            {timestamp && <span className={styles.messageTimestamp}>{formatTimestamp(timestamp)}</span>}
          </div>
          <div className={styles.messageContent}>{displayText}</div>
        </div>
      );
    }

    // Regular user message - show avatar
    return (
      <div className={styles.userMessage}>
        <div className={styles.messageHeader}>
          <UserAvatar
            avatarUrl={userInfo?.avatarURL}
            userName={userInfo?.name || userInfo?.email}
            size="small"
          />
          <span className={styles.messageRoleText}>{userInfo?.name || 'You'}</span>
          {timestamp && <span className={styles.messageTimestamp}>{formatTimestamp(timestamp)}</span>}
        </div>
        <div className={styles.messageContent}>{textContent}</div>
      </div>
    );
  }

  // Check if this is a chat.message (agent's direct message) vs netdata.query response
  // chat.message IDs start with "chat_msg_"
  const isChatMessage = message.id?.startsWith('chat_msg_');

  // For assistant messages, show appropriate branding and styling
  // - chat.message: AI provider with purple background (agent talking to user)
  // - netdata.query: Netdata with white background (data response)
  return (
    <div className={isChatMessage ? styles.agentQueryMessage : styles.assistantMessage}>
      <div className={styles.messageHeader}>
        {isChatMessage ? getProviderIcon(aiProvider) : <NetdataIcon />}
        <span className={styles.messageRoleText}>
          {isChatMessage ? (aiProvider?.name || 'AI Agent') : 'Netdata'}
        </span>
        {timestamp && <span className={styles.messageTimestamp}>{formatTimestamp(timestamp)}</span>}
      </div>
      <div className={styles.messageContent}>
        {contentBlocks.map((block, idx) => {
          if (block.type === 'text') {
            return (
              <MarkdownMessage
                key={`text-${idx}`}
                content={block.text || ''}
                isStreaming={isStreaming}
              />
            );
          }

          if (block.type === 'tool_use') {
            // Find matching tool result
            const toolResult = toolResultsMap[block.id];

            return (
              <ToolBlock
                key={`tool-${block.id}`}
                toolUse={block}
                toolResult={toolResult}
                isStreaming={isStreaming && !toolResult}
              />
            );
          }

          // Skip tool_result blocks - they're rendered with their tool_use
          return null;
        })}
      </div>
    </div>
  );
};

/**
 * Get tool icon based on tool name
 */
const getToolIcon = (toolName) => {
  // Netdata tools
  if (toolName?.includes('netdata') || toolName?.includes('metric') ||
      toolName?.includes('alert') || toolName === 'search_metrics' ||
      toolName === 'get_alerts' || toolName === 'get_metric_data') {
    return <NetdataIcon />;
  }

  // Default gear icon
  return <span className={styles.toolIconEmoji}>⚙</span>;
};

/**
 * ToolBlock - Renders a tool use with its result
 * Collapsed by default to reduce visual clutter
 */
const ToolBlock = ({ toolUse, toolResult, isStreaming }) => {
  const [isExpanded, setIsExpanded] = React.useState(false); // Collapsed by default
  const { name, input } = toolUse;

  // Determine status based on whether we have a result
  const status = toolResult ? 'success' : (isStreaming ? 'pending' : 'pending');

  return (
    <div className={styles.toolBlock}>
      <div
        className={styles.toolHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.toolHeaderLeft}>
          {getToolIcon(name)}
          <span className={styles.toolName}>{name}</span>
          <StatusIndicator status={status} />
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
          {input && Object.keys(input).length > 0 && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Input</div>
              <pre className={styles.jsonDisplay}>
                <code>{JSON.stringify(input, null, 2)}</code>
              </pre>
            </div>
          )}

          {/* Tool Result */}
          {toolResult && toolResult.text && (
            <div className={styles.toolSection}>
              <div className={styles.toolSectionTitle}>Result</div>
              <div className={styles.toolResult}>
                <MarkdownMessage content={toolResult.text} isStreaming={false} />
              </div>
            </div>
          )}

          {/* Loading state */}
          {!toolResult && isStreaming && (
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
const StatusIndicator = ({ status }) => {
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

/**
 * ErrorMessage component - shows when agent encountered an error
 */
const ErrorMessage = ({ error }) => {
  return (
    <div className={styles.errorMessage}>
      <span className={styles.errorIcon}>⚠</span>
      <div className={styles.errorContent}>
        <div className={styles.errorTitle}>Agent error</div>
        {error && <div className={styles.errorText}>{error}</div>}
      </div>
    </div>
  );
};

export default AgentChat;
