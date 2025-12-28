import React, { useState, useEffect, useRef } from 'react';
import {
  listConversations,
  getConversation,
  deleteConversation,
  createConversation,
  createChatCompletion,
  createConversationTitle,
} from '../../api/client';
import MarkdownMessage from './MarkdownMessage';
import ToolBlock from './ToolBlock';
import TimeSeriesChartBlock from './TimeSeriesChartBlock';
import BarChartBlock from './BarChartBlock';
import BubbleChartBlock from './BubbleChartBlock';
import LoadChartBlock from './LoadChartBlock';
import NetdataSpinner from '../common/NetdataSpinner';
import styles from './Chat.module.css';

/**
 * Chat Component
 *
 * A chat component with two modes:
 * 1. List Mode: Display all conversations for the current space/room
 * 2. Single Conversation Mode: Display a specific conversation with messages
 *
 * This component handles:
 * - List all conversations in the current space/room
 * - View a specific conversation with its messages
 * - Delete conversations
 * - Process incoming messages from terminal emulator
 * - Real-time streaming of AI responses via SSE
 * - Display tool_use and tool_result content blocks
 *
 * Props:
 * - space: The space object with id and name
 * - room: The room object with id and name
 * - message: New message from terminal emulator (triggers completion)
 * - onMessageProcessed: Callback when message processing is complete
 */

const Chat = ({ space, room, message, onMessageProcessed, aiPermissions = { canRead: true, canCreate: true, canDelete: true } }) => {
  // Mode state: 'list' or 'conversation'
  const [mode, setMode] = useState('list');

  // Conversations list state
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState(null);

  // Current conversation state
  const [currentConversation, setCurrentConversation] = useState(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState(null);

  // Message processing state
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState([]);
  const [processingError, setProcessingError] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const lastProcessedMessageRef = useRef(null);
  // State cache to remember chat state for each space/room combination
  const stateCache = useRef({});

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('netdata_token');
  };

  // Generate cache key for current space/room
  const getCacheKey = (spaceId, roomId) => {
    return `${spaceId}-${roomId}`;
  };

  // Save current state to cache
  const saveStateToCache = (spaceId, roomId) => {
    if (!spaceId || !roomId) return;

    const key = getCacheKey(spaceId, roomId);
    stateCache.current[key] = {
      mode,
      currentConversation,
      conversationId: currentConversation?.id,
    };
  };

  // Restore state from cache
  const restoreStateFromCache = async (spaceId, roomId) => {
    if (!spaceId || !roomId) return;

    const key = getCacheKey(spaceId, roomId);
    const cachedState = stateCache.current[key];

    if (cachedState) {
      // Restore mode
      setMode(cachedState.mode);

      // If in conversation mode, restore the conversation
      if (cachedState.mode === 'conversation' && cachedState.conversationId) {
        await loadConversation(cachedState.conversationId);
      }
    } else {
      // No cached state, reset to list mode
      setMode('list');
      setCurrentConversation(null);
      setConversationError(null);
      setStreamingMessages([]);
      setProcessingError(null);
    }
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Extract text from message content array
  const extractMessageText = (content) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
    }
    return '';
  };

  // Extract tool blocks from message content array
  const extractToolBlocks = (content) => {
    if (!content || !Array.isArray(content)) return [];

    // Filter out tool_use blocks - these have name property
    const toolUses = content.filter(item =>
      (item.type === 'tool_use' || item.name) && item.id
    );

    // Filter out tool_result blocks - these have text but no name
    const toolResults = content.filter(item =>
      (item.type === 'tool_result' || (item.text !== undefined && !item.name)) && item.id
    );

    // Match tool uses with their results by id
    return toolUses.map(toolUse => {
      const result = toolResults.find(r => r.id === toolUse.id);
      return {
        toolUse: {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input || {}
        },
        toolResult: result ? {
          id: result.id,
          text: result.text || ''
        } : null
      };
    });
  };

  // Format conversation title - use title or creation date
  const formatConversationTitle = (conversation) => {
    if (conversation.title) {
      return conversation.title;
    }
    // If no title, show creation date
    return formatTimestamp(conversation.created_at, true);
  };

  // Track previous space/room to detect changes
  const prevSpaceRoomRef = useRef({ spaceId: null, roomId: null });

  // Handle space/room changes: save current state and restore state for new space/room
  useEffect(() => {
    const currentSpaceId = space?.id;
    const currentRoomId = room?.id;
    const prevSpaceId = prevSpaceRoomRef.current.spaceId;
    const prevRoomId = prevSpaceRoomRef.current.roomId;

    // Check if space or room has changed
    const hasChanged = currentSpaceId !== prevSpaceId || currentRoomId !== prevRoomId;

    if (hasChanged && prevSpaceId && prevRoomId) {
      // Save current state before switching
      saveStateToCache(prevSpaceId, prevRoomId);
    }

    if (hasChanged && currentSpaceId && currentRoomId) {
      // Restore state for new space/room
      restoreStateFromCache(currentSpaceId, currentRoomId);
    }

    // Update ref to current space/room
    prevSpaceRoomRef.current = {
      spaceId: currentSpaceId,
      roomId: currentRoomId,
    };
  }, [space?.id, room?.id]);

  // Load conversations list when in list mode (only if user has permission)
  useEffect(() => {
    if (space?.id && room?.id && mode === 'list' && aiPermissions.canRead) {
      loadConversations();
    }
  }, [space?.id, room?.id, mode, aiPermissions.canRead]);

  // Process incoming messages from terminal emulator
  useEffect(() => {
    // Only process if we have a message and it's different from the last processed one
    if (!message || !space?.id || !room?.id || message?.id === lastProcessedMessageRef.current) {
      return;
    }

    // Prevent duplicate processing by tracking the message ID
    lastProcessedMessageRef.current = message.id;

    // Process the message text
    processIncomingMessage(message.text);
  }, [message, space?.id, room?.id]);

  // Load conversations list
  const loadConversations = async () => {
    const token = getToken();
    if (!token) {
      setConversationsError('Authentication token not found');
      return;
    }

    setConversationsLoading(true);
    setConversationsError(null);

    try {
      const data = await listConversations(token, space.id, room.id);
      // API returns array directly, not an object with conversations property
      setConversations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      setConversationsError(error.message);
    } finally {
      setConversationsLoading(false);
    }
  };

  // Load a specific conversation
  const loadConversation = async (conversationId) => {
    const token = getToken();
    if (!token) {
      setConversationError('Authentication token not found');
      return;
    }

    // Switch to conversation mode immediately and clear old data
    setMode('conversation');
    setCurrentConversation(null);
    setConversationLoading(true);
    setConversationError(null);
    setStreamingMessages([]);

    try {
      const data = await getConversation(token, space.id, room.id, conversationId);

      // Set conversation immediately to show it to the user without delay
      setCurrentConversation(data);
      // Scroll to bottom after loading conversation
      setTimeout(scrollToBottom, 100);

      // Generate title in the background if missing or empty (non-blocking)
      if (!data.title || data.title.trim() === '') {
        // Find the first user message
        const firstUserMessage = data.messages?.find(msg => msg.role === 'user');

        if (firstUserMessage) {
          // Extract text content from the message
          let messageContent = '';

          if (typeof firstUserMessage.content === 'string') {
            messageContent = firstUserMessage.content;
          } else if (Array.isArray(firstUserMessage.content)) {
            // Extract text from content blocks
            messageContent = firstUserMessage.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join(' ');
          }

          // Only generate title if we have message content
          if (messageContent && messageContent.trim() !== '') {
            // Run title generation in the background without blocking
            createConversationTitle(
              token,
              space.id,
              room.id,
              conversationId,
              messageContent
            ).then(titleResponse => {
              // Update conversation with new title
              if (titleResponse && titleResponse.title) {
                setCurrentConversation(prevConversation => {
                  // Only update if we're still viewing the same conversation
                  if (prevConversation?.id === conversationId) {
                    return {
                      ...prevConversation,
                      title: titleResponse.title
                    };
                  }
                  return prevConversation;
                });
              }
            }).catch(titleError => {
              // Log error but don't fail the conversation load
              console.error('Failed to generate conversation title:', titleError);
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setConversationError(error.message);
    } finally {
      setConversationLoading(false);
    }
  };

  // Handle conversation selection
  const handleSelectConversation = (conversationId) => {
    loadConversation(conversationId);
  };

  // Handle back to list
  const handleBackToList = () => {
    setMode('list');
    setCurrentConversation(null);
    setConversationError(null);
    // Reload conversations to get any updates
    loadConversations();
  };

  // Handle delete conversation
  const handleDeleteConversation = async (conversationId, event) => {
    // Prevent event bubbling to avoid triggering conversation selection
    if (event) {
      event.stopPropagation();
    }

    const token = getToken();
    if (!token) {
      setConversationsError('Authentication token not found');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      await deleteConversation(token, space.id, room.id, conversationId);
      // Reload conversations list
      await loadConversations();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setConversationsError(error.message);
    }
  };

  // Format timestamp to readable format
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // Less than a week
      return date.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Format microcredits to credits with 2 decimal places
  const formatCredits = (microcredits) => {
    if (microcredits === undefined || microcredits === null) return null;
    const credits = microcredits / 1000000;
    return credits.toFixed(2);
  };

  // Process incoming message from terminal emulator
  const processIncomingMessage = async (userMessage) => {
    // Check if user has permission to create messages
    if (!aiPermissions.canCreate) {
      setProcessingError('You do not have permission to send messages. Please upgrade your plan or contact your administrator.');
      if (onMessageProcessed) {
        onMessageProcessed();
      }
      return;
    }

    const token = getToken();
    if (!token) {
      setProcessingError('Authentication token not found');
      if (onMessageProcessed) {
        onMessageProcessed();
      }
      return;
    }

    setIsProcessingMessage(true);
    setProcessingError(null);
    setStreamingMessages([]);

    try {
      let conversationId = currentConversation?.id;
      let parentMessageId = undefined;

      // If in list mode, create a new conversation
      if (mode === 'list') {
        const newConversation = await createConversation(token, space.id, room.id, {
          title: `Chat ${new Date().toLocaleString()}`,
        });
        conversationId = newConversation.id;

        // Load the newly created conversation
        await loadConversation(conversationId);

        // For a new conversation, there are no messages yet, so parentMessageId is undefined
        parentMessageId = undefined;
      } else {
        // In conversation mode, get parent message ID from current conversation
        parentMessageId = currentConversation?.messages?.length > 0
          ? currentConversation.messages[currentConversation.messages.length - 1].id
          : undefined;
      }

      // Create chat completion with SSE streaming
      await createChatCompletion(
        token,
        space.id,
        room.id,
        conversationId,
        userMessage,
        handleSSEChunk,
        parentMessageId
      );

      // Clear streaming messages before reloading to prevent duplicates
      setStreamingMessages([]);

      // Reload conversation to get final state from API
      await loadConversation(conversationId);

      // Trigger credits refresh
      window.dispatchEvent(new CustomEvent('credits-refresh'));

    } catch (error) {
      console.error('Failed to process message:', error);
      setProcessingError(error.message || 'Failed to process message');
    } finally {
      setIsProcessingMessage(false);

      // Call callback to notify that message processing is complete
      if (onMessageProcessed) {
        onMessageProcessed();
      }
    }
  };

  // Handle SSE chunks from the API
  const handleSSEChunk = (chunk) => {
    try {
      switch (chunk.type) {
        case 'message_start':
          // New message started (user or assistant)
          if (chunk.message) {
            const newMessage = {
              id: chunk.message.id,
              role: chunk.message.role,
              content: [], // Start with empty content array
              contentBlocks: [], // Track content blocks for streaming
              isStreaming: chunk.message.role === 'assistant',
              created_at: new Date().toISOString(),
            };

            setStreamingMessages(prev => [...prev, newMessage]);
            setTimeout(scrollToBottom, 50);
          }
          break;

        case 'content_block_start':
          // New content block started
          if (chunk.content_block) {
            setStreamingMessages(prev => {
              if (prev.length === 0) return prev;

              const updated = [...prev];
              const lastIndex = updated.length - 1;
              const lastMessage = { ...updated[lastIndex] };

              // DEEP COPY the contentBlocks array
              lastMessage.contentBlocks = lastMessage.contentBlocks ? [...lastMessage.contentBlocks] : [];

              const blockIndex = chunk.index !== undefined ? chunk.index : lastMessage.contentBlocks.length;

              // Create new content block based on type
              if (chunk.content_block.type === 'tool_use') {
                lastMessage.contentBlocks[blockIndex] = {
                  type: 'tool_use',
                  id: chunk.content_block.id,
                  name: chunk.content_block.name,
                  input: chunk.content_block.input || {},
                  partialInput: '', // For building up JSON from deltas
                };
              } else if (chunk.content_block.type === 'tool_result') {
                lastMessage.contentBlocks[blockIndex] = {
                  type: 'tool_result',
                  id: chunk.content_block.id,
                  text: '',
                };
              } else if (chunk.content_block.type === 'text') {
                lastMessage.contentBlocks[blockIndex] = {
                  type: 'text',
                  text: '',
                };
              }

              updated[lastIndex] = lastMessage;
              return updated;
            });
          }
          break;

        case 'content_block_delta':
          // Incremental content received
          setStreamingMessages(prev => {
            if (prev.length === 0) return prev;

            const updated = [...prev];
            const lastIndex = updated.length - 1;
            const lastMessage = { ...updated[lastIndex] };

            // DEEP COPY the contentBlocks array
            lastMessage.contentBlocks = lastMessage.contentBlocks ? [...lastMessage.contentBlocks] : [];

            const blockIndex = chunk.index !== undefined ? chunk.index : 0;

            if (chunk.delta?.type === 'text_delta' && chunk.delta.text) {
              // Text content delta
              if (!lastMessage.contentBlocks[blockIndex]) {
                lastMessage.contentBlocks[blockIndex] = { type: 'text', text: '' };
              } else {
                // Also create a copy of the block we're modifying
                lastMessage.contentBlocks[blockIndex] = {
                  ...lastMessage.contentBlocks[blockIndex]
                };
              }

              lastMessage.contentBlocks[blockIndex].text =
                (lastMessage.contentBlocks[blockIndex].text || '') + chunk.delta.text;

            } else if (chunk.delta?.type === 'input_json_delta' && chunk.delta.partial_json) {
              // Tool input JSON delta
              if (lastMessage.contentBlocks[blockIndex]) {
                // Create a copy of the block
                lastMessage.contentBlocks[blockIndex] = {
                  ...lastMessage.contentBlocks[blockIndex]
                };

                const block = lastMessage.contentBlocks[blockIndex];
                block.partialInput = (block.partialInput || '') + chunk.delta.partial_json;

                // Try to parse the accumulated JSON
                try {
                  block.input = JSON.parse(block.partialInput);
                } catch (e) {
                  // JSON not complete yet, keep accumulating
                }
              }
            }

            updated[lastIndex] = lastMessage;
            setTimeout(scrollToBottom, 50);
            return updated;
          });
          break;

        case 'content_block_stop':
          // Content block complete
          break;

        case 'message_stop':
          // Message complete
          setStreamingMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              const lastMessage = { ...updated[updated.length - 1] };
              lastMessage.isStreaming = false;
              updated[updated.length - 1] = lastMessage;
            }
            return updated;
          });
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Error processing SSE chunk:', error);
    }
  };

  // Render a message with text and tool blocks in their original order
  const renderMessageContent = (message, isStreaming = false) => {
    // For streaming messages, use contentBlocks
    if (isStreaming && message.contentBlocks) {
      // Create a map of tool results by id for quick lookup
      const toolResultsMap = {};
      message.contentBlocks.forEach(block => {
        if (block.type === 'tool_result' && block.id) {
          toolResultsMap[block.id] = block;
        }
      });

      // Render blocks in order, skipping tool_result blocks (they're paired with tool_use)
      return (
        <>
          {message.contentBlocks.map((block, idx) => {
            if (block.type === 'text') {
              return (
                <MarkdownMessage
                  key={`text-${idx}`}
                  content={block.text || ''}
                  isStreaming={message.isStreaming}
                />
              );
            } else if (block.type === 'tool_use') {
              // Find matching tool result
              const toolResult = toolResultsMap[block.id];

              // Check if this is a custom_timeseries_chart_block
              if (block.name === 'custom_timeseries_chart_block') {
                return (
                  <TimeSeriesChartBlock
                    key={`chart-${block.id || idx}`}
                    toolInput={block.input || {}}
                    toolResult={toolResult ? {
                      id: toolResult.id,
                      text: toolResult.text || ''
                    } : null}
                  />
                );
              }

              // Check if this is a custom_bar_chart_block
              if (block.name === 'custom_bar_chart_block') {
                return (
                  <BarChartBlock
                    key={`chart-${block.id || idx}`}
                    toolInput={block.input || {}}
                    toolResult={toolResult ? {
                      id: toolResult.id,
                      text: toolResult.text || ''
                    } : null}
                  />
                );
              }

              // Check if this is a custom_bubble_chart_block
              if (block.name === 'custom_bubble_chart_block') {
                return (
                  <BubbleChartBlock
                    key={`chart-${block.id || idx}`}
                    toolInput={block.input || {}}
                    toolResult={toolResult ? {
                      id: toolResult.id,
                      text: toolResult.text || ''
                    } : null}
                  />
                );
              }

              // Check if this is a load_chart_block
              if (block.name === 'load_chart_block') {
                return (
                  <LoadChartBlock
                    key={`chart-${block.id || idx}`}
                    toolInput={block.input || {}}
                    toolResult={toolResult ? {
                      id: toolResult.id,
                      text: toolResult.text || ''
                    } : null}
                    space={space}
                    room={room}
                  />
                );
              }

              // Default: render ToolBlock for other tools
              return (
                <ToolBlock
                  key={`tool-${block.id || idx}`}
                  toolUse={{
                    id: block.id,
                    name: block.name,
                    input: block.input || {}
                  }}
                  toolResult={toolResult ? {
                    id: toolResult.id,
                    text: toolResult.text || ''
                  } : null}
                />
              );
            }
            // Skip tool_result blocks as they're rendered with their tool_use
            return null;
          })}
        </>
      );
    }

    // For complete messages from API, use content array
    if (!message.content || !Array.isArray(message.content)) {
      return null;
    }

    // Create a map of tool results by id for quick lookup
    const toolResultsMap = {};
    message.content.forEach(block => {
      if ((block.type === 'tool_result' || (block.text !== undefined && !block.name)) && block.id) {
        toolResultsMap[block.id] = block;
      }
    });

    // Render blocks in order, skipping tool_result blocks (they're paired with tool_use)
    return (
      <>
        {message.content.map((block, idx) => {
          if (block.type === 'text') {
            return (
              <MarkdownMessage
                key={`text-${idx}`}
                content={block.text || ''}
                isStreaming={false}
              />
            );
          } else if (block.type === 'tool_use' || (block.name && block.id)) {
            // Find matching tool result
            const toolResult = toolResultsMap[block.id];

            // Check if this is a custom_timeseries_chart_block
            if (block.name === 'custom_timeseries_chart_block') {
              return (
                <TimeSeriesChartBlock
                  key={`chart-${block.id || idx}`}
                  toolInput={block.input || {}}
                  toolResult={toolResult ? {
                    id: toolResult.id,
                    text: toolResult.text || ''
                  } : null}
                />
              );
            }

            // Check if this is a custom_bar_chart_block
            if (block.name === 'custom_bar_chart_block') {
              return (
                <BarChartBlock
                  key={`chart-${block.id || idx}`}
                  toolInput={block.input || {}}
                  toolResult={toolResult ? {
                    id: toolResult.id,
                    text: toolResult.text || ''
                  } : null}
                />
              );
            }

            // Check if this is a custom_bubble_chart_block
            if (block.name === 'custom_bubble_chart_block') {
              return (
                <BubbleChartBlock
                  key={`chart-${block.id || idx}`}
                  toolInput={block.input || {}}
                  toolResult={toolResult ? {
                    id: toolResult.id,
                    text: toolResult.text || ''
                  } : null}
                />
              );
            }

            // Check if this is a load_chart_block
            if (block.name === 'load_chart_block') {
              return (
                <LoadChartBlock
                  key={`chart-${block.id || idx}`}
                  toolInput={block.input || {}}
                  toolResult={toolResult ? {
                    id: toolResult.id,
                    text: toolResult.text || ''
                  } : null}
                  space={space}
                  room={room}
                />
              );
            }

            // Default: render ToolBlock for other tools
            return (
              <ToolBlock
                key={`tool-${block.id || idx}`}
                toolUse={{
                  id: block.id,
                  name: block.name,
                  input: block.input || {}
                }}
                toolResult={toolResult ? {
                  id: toolResult.id,
                  text: toolResult.text || ''
                } : null}
              />
            );
          }
          // Skip tool_result blocks as they're rendered with their tool_use
          return null;
        })}
      </>
    );
  };

  // Render conversation list mode
  const renderConversationsList = () => {
    return (
      <>
        <div className={styles.chatHeader}>
          <div className={styles.chatTitle}>
            <span className={styles.chatIcon}>💬</span>
            <span className={styles.chatTitleText}>Conversations</span>
          </div>
          <div className={styles.chatContext}>
            <span className={styles.contextLabel}>Space:</span>
            <span className={styles.contextValue}>{space?.name || 'No Space'}</span>
            <span className={styles.contextSeparator}>•</span>
            <span className={styles.contextLabel}>Room:</span>
            <span className={styles.contextValue}>{room?.name || 'No Room'}</span>
          </div>
        </div>

        <div className={styles.chatBody}>
          {conversationsLoading && (
            <div className={styles.loadingContainer}>
              <NetdataSpinner size={40} />
              <div className={styles.loadingText}>Loading conversations...</div>
            </div>
          )}

          {conversationsError && (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorText}>{conversationsError}</div>
              <button className={styles.retryButton} onClick={loadConversations}>
                Retry
              </button>
            </div>
          )}

          {!conversationsLoading && !conversationsError && conversations.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💭</div>
              <div className={styles.emptyTitle}>No conversations yet</div>
              <div className={styles.emptyDescription}>
                Start a new conversation to chat with Netdata AI
              </div>
            </div>
          )}

          {!conversationsLoading && !conversationsError && conversations.length > 0 && (
            <div className={styles.conversationsList}>
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={styles.conversationItem}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className={styles.conversationHeader}>
                    <div className={styles.conversationTitle}>
                      {formatConversationTitle(conversation)}
                    </div>
                  </div>
                  {aiPermissions.canDelete && (
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => handleDeleteConversation(conversation.id, e)}
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      ✕
                    </button>
                  )}
                  <div className={styles.conversationMeta}>
                    <span className={styles.conversationTimestamp}>
                      {formatTimestamp(conversation.updated_at || conversation.created_at)}
                    </span>
                    {conversation.message_count && (
                      <>
                        <span className={styles.conversationSeparator}>•</span>
                        <span className={styles.conversationMessageCount}>
                          {conversation.message_count} messages
                        </span>
                      </>
                    )}
                    {conversation.metadata?.usage?.amount_microcredits && (
                      <>
                        <span className={styles.conversationSeparator}>•</span>
                        <span className={styles.conversationCredits}>
                          {formatCredits(conversation.metadata.usage.amount_microcredits)} credits
                        </span>
                      </>
                    )}
                  </div>
                  {conversation.last_message && (
                    <div className={styles.conversationPreview}>
                      {conversation.last_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  // Render single conversation mode
  const renderConversation = () => {
    // If loading, show only the spinner - no content
    if (conversationLoading) {
      return (
        <>
          <div className={styles.chatHeader}>
            <div className={styles.conversationHeaderRow}>
              <button className={styles.backButton} onClick={handleBackToList} title="Back to conversations">
                <span className={styles.backIcon}>←</span>
              </button>
              <div className={styles.conversationTitleContainer}>
                <span className={styles.conversationTitleText}>Loading...</span>
              </div>
            </div>
          </div>

          <div className={styles.chatBody}>
            <div className={styles.loadingContainer}>
              <NetdataSpinner size={40} />
              <div className={styles.loadingText}>Loading conversation...</div>
            </div>
          </div>
        </>
      );
    }

    // Create a Set of message IDs from currentConversation to avoid rendering duplicates
    const conversationMessageIds = new Set(
      currentConversation?.messages?.map(msg => msg.id) || []
    );

    // Filter out streaming messages that are already in the conversation
    const uniqueStreamingMessages = streamingMessages.filter(
      msg => !conversationMessageIds.has(msg.id)
    );

    // Check if any message is currently streaming
    const isStreaming = uniqueStreamingMessages.some(msg => msg.isStreaming);

    return (
      <>
        <div className={styles.chatHeader}>
          <div className={styles.conversationHeaderRow}>
            <button className={styles.backButton} onClick={handleBackToList} title="Back to conversations">
              <span className={styles.backIcon}>←</span>
            </button>
            <div className={styles.conversationTitleContainer}>
              <span className={styles.conversationTitleText}>
                {currentConversation?.title || 'Conversation'}
              </span>
            </div>
            {currentConversation?.metadata?.usage?.amount_microcredits && (
              <span className={styles.conversationHeaderCredits}>
                {formatCredits(currentConversation.metadata.usage.amount_microcredits)} credits
              </span>
            )}
          </div>
        </div>

        <div className={styles.chatBody}>
          {conversationError && (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorText}>{conversationError}</div>
              <button className={styles.retryButton} onClick={() => loadConversation(currentConversation?.id)}>
                Retry
              </button>
            </div>
          )}

          {!conversationError && currentConversation && (
            <div className={styles.messagesContainer}>
              {currentConversation.messages && currentConversation.messages.length > 0 ? (
                <>
                  {/* Render conversation messages */}
                  {currentConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageWrapper} ${message.role === 'user' ? styles.messageWrapperOwn : ''
                        }`}
                    >
                      <div
                        className={`${styles.messageBubble} ${message.role === 'user' ? styles.messageBubbleOwn : ''
                          }`}
                      >
                        {message.role !== 'user' && (
                          <div className={styles.messageSender}>Netdata AI</div>
                        )}
                        {renderMessageContent(message, false)}
                        <div className={styles.messageTimestamp}>
                          {formatTimestamp(message.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Render only unique streaming messages (not already in conversation) */}
                  {uniqueStreamingMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageWrapper} ${message.role === 'user' ? styles.messageWrapperOwn : ''
                        }`}
                    >
                      <div
                        className={`${styles.messageBubble} ${message.role === 'user' ? styles.messageBubbleOwn : ''
                          }`}
                      >
                        {message.role !== 'user' && (
                          <div className={styles.messageSender}>Netdata AI</div>
                        )}
                        {renderMessageContent(message, true)}
                        <div className={styles.messageTimestamp}>
                          {formatTimestamp(message.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Show streaming spinner when AI is generating response */}
                  {isStreaming && (
                    <div className={styles.streamingSpinnerContainer}>
                      <NetdataSpinner size={24} />
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              ) : (
                <>
                  {/* Show streaming messages even if no conversation messages yet */}
                  {uniqueStreamingMessages.length > 0 ? (
                    <>
                      {uniqueStreamingMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`${styles.messageWrapper} ${message.role === 'user' ? styles.messageWrapperOwn : ''
                            }`}
                        >
                          <div
                            className={`${styles.messageBubble} ${message.role === 'user' ? styles.messageBubbleOwn : ''
                              }`}
                          >
                            {message.role !== 'user' && (
                              <div className={styles.messageSender}>Netdata AI</div>
                            )}
                            {renderMessageContent(message, true)}
                            <div className={styles.messageTimestamp}>
                              {formatTimestamp(message.created_at)}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Show streaming spinner when AI is generating response */}
                      {isStreaming && (
                        <div className={styles.streamingSpinnerContainer}>
                          <NetdataSpinner size={24} />
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>💭</div>
                      <div className={styles.emptyTitle}>No messages yet</div>
                      <div className={styles.emptyDescription}>
                        Type a message in the terminal to start chatting with Netdata AI
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Show processing error if any */}
          {processingError && (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorText}>{processingError}</div>
            </div>
          )}
        </div>
      </>
    );
  };

  // Render no permissions state
  const renderNoPermissions = () => {
    const handleUpgradeClick = () => {
      if (space?.slug) {
        const baseUrl = localStorage.getItem('netdata_base_url') || 'https://app.netdata.cloud';
        window.open(`${baseUrl}/spaces/${space.slug}/settings/billing`, '_blank');
      }
    };

    return (
      <>
        <div className={styles.chatHeader}>
          <div className={styles.chatTitle}>
            <span className={styles.chatIcon}>💬</span>
            <span className={styles.chatTitleText}>Conversations</span>
          </div>
          <div className={styles.chatContext}>
            <span className={styles.contextLabel}>Space:</span>
            <span className={styles.contextValue}>{space?.name || 'No Space'}</span>
            <span className={styles.contextSeparator}>•</span>
            <span className={styles.contextLabel}>Room:</span>
            <span className={styles.contextValue}>{room?.name || 'No Room'}</span>
          </div>
        </div>

        <div className={styles.chatBody}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔒</div>
            <div className={styles.emptyTitle}>AI Features Not Available</div>
            <div className={styles.emptyDescription}>
              Your current space plan does not include AI features.
              Please upgrade your plan or contact your administrator to enable AI capabilities.
            </div>
            {space?.slug && (
              <button className={styles.upgradeButton} onClick={handleUpgradeClick}>
                View Billing & Upgrade
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  // Determine what to render based on permissions and mode
  const renderContent = () => {
    // If user doesn't have read permission, show no permissions state
    if (!aiPermissions.canRead) {
      return renderNoPermissions();
    }

    // Otherwise render based on mode
    return mode === 'list' ? renderConversationsList() : renderConversation();
  };

  return (
    <div className={styles.chatContainer}>
      {renderContent()}
    </div>
  );
};

export default Chat;
