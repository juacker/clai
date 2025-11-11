import React, { useState, useEffect, useRef } from 'react';
import {
  listConversations,
  getConversation,
  deleteConversation,
  createConversation,
  createChatCompletion,
} from '../../api/client';
import MarkdownMessage from './MarkdownMessage';
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
 *
 * Props:
 * - space: The space object with id and name
 * - room: The room object with id and name
 * - message: New message from terminal emulator (triggers completion)
 * - onMessageProcessed: Callback when message processing is complete
 */

const Chat = ({ space, room, message, onMessageProcessed }) => {
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

  // Load conversations list when in list mode
  useEffect(() => {
    if (space?.id && room?.id && mode === 'list') {
      loadConversations();
    }
  }, [space?.id, room?.id, mode]);

  // Process incoming messages from terminal emulator
  useEffect(() => {
    // Only process if we have a message and it's different from the last processed one
    if (!message || !space?.id || !room?.id || message === lastProcessedMessageRef.current) {
      return;
    }

    // Prevent duplicate processing
    lastProcessedMessageRef.current = message;

    // Process the message
    processIncomingMessage(message);
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

    setConversationLoading(true);
    setConversationError(null);

    try {
      const data = await getConversation(token, space.id, room.id, conversationId);
      setCurrentConversation(data);
      setMode('conversation');
      // Scroll to bottom after loading conversation
      setTimeout(scrollToBottom, 100);
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

  // Process incoming message from terminal emulator
  const processIncomingMessage = async (userMessage) => {
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

      // If in list mode, create a new conversation
      if (mode === 'list') {
        const newConversation = await createConversation(token, space.id, room.id, {
          title: `Chat ${new Date().toLocaleString()}`,
        });
        conversationId = newConversation.id;

        // Load the newly created conversation
        await loadConversation(conversationId);
      }

      // Get parent message ID (last message in conversation if exists)
      const parentMessageId = currentConversation?.messages?.length > 0
        ? currentConversation.messages[currentConversation.messages.length - 1].id
        : undefined;

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

      // Reload conversation to get final state from API
      await loadConversation(conversationId);

      // Clear streaming messages
      setStreamingMessages([]);

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
              content: '',
              isStreaming: true,
              created_at: new Date().toISOString(),
            };

            setStreamingMessages(prev => [...prev, newMessage]);

            // Auto-scroll to bottom
            setTimeout(scrollToBottom, 50);
          }
          break;

        case 'content_block_start':
          // Content block started (prepare for text streaming)
          break;

        case 'content_block_delta':
          // Incremental text content received
          if (chunk.delta?.text) {
            setStreamingMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0) {
                const lastMessage = updated[updated.length - 1];
                lastMessage.content += chunk.delta.text;
              }
              return updated;
            });

            // Auto-scroll to bottom as content arrives
            setTimeout(scrollToBottom, 50);
          }
          break;

        case 'content_block_stop':
          // Content block complete
          break;

        case 'message_stop':
          // Message complete
          setStreamingMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              const lastMessage = updated[updated.length - 1];
              lastMessage.isStreaming = false;
            }
            return updated;
          });
          break;

        default:
          // Unknown chunk type, ignore
          break;
      }
    } catch (error) {
      console.error('Error processing SSE chunk:', error);
    }
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
              <div className={styles.loadingSpinner}></div>
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
                  <button
                    className={styles.deleteButton}
                    onClick={(e) => handleDeleteConversation(conversation.id, e)}
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    ✕
                  </button>
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
    return (
      <>
        <div className={styles.chatHeader}>
          <button className={styles.backButton} onClick={handleBackToList}>
            <span className={styles.backIcon}>←</span>
          </button>
          <div className={styles.chatTitle}>
            <span className={styles.chatIcon}>💬</span>
            <span className={styles.chatTitleText}>
              {currentConversation?.title || 'Conversation'}
            </span>
          </div>
        </div>

        <div className={styles.chatBody}>
          {conversationLoading && (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner}></div>
              <div className={styles.loadingText}>Loading conversation...</div>
            </div>
          )}

          {conversationError && (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorText}>{conversationError}</div>
              <button className={styles.retryButton} onClick={() => loadConversation(currentConversation?.id)}>
                Retry
              </button>
            </div>
          )}

          {!conversationLoading && !conversationError && currentConversation && (
            <div className={styles.messagesContainer}>
              {currentConversation.messages && currentConversation.messages.length > 0 ? (
                <>
                  {currentConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageWrapper} ${
                        message.role === 'user' ? styles.messageWrapperOwn : ''
                      }`}
                    >
                      <div
                        className={`${styles.messageBubble} ${
                          message.role === 'user' ? styles.messageBubbleOwn : ''
                        }`}
                      >
                        {message.role !== 'user' && (
                          <div className={styles.messageSender}>Netdata AI</div>
                        )}
                        <MarkdownMessage
                          content={extractMessageText(message.content)}
                          isStreaming={false}
                        />
                        <div className={styles.messageTimestamp}>
                          {formatTimestamp(message.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Render streaming messages in real-time */}
                  {streamingMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageWrapper} ${
                        message.role === 'user' ? styles.messageWrapperOwn : ''
                      }`}
                    >
                      <div
                        className={`${styles.messageBubble} ${
                          message.role === 'user' ? styles.messageBubbleOwn : ''
                        }`}
                      >
                        {message.role !== 'user' && (
                          <div className={styles.messageSender}>Netdata AI</div>
                        )}
                        <MarkdownMessage
                          content={message.content}
                          isStreaming={message.isStreaming}
                        />
                        <div className={styles.messageTimestamp}>
                          {formatTimestamp(message.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div ref={messagesEndRef} />
                </>
              ) : (
                <>
                  {/* Show streaming messages even if no conversation messages yet */}
                  {streamingMessages.length > 0 ? (
                    <>
                      {streamingMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`${styles.messageWrapper} ${
                            message.role === 'user' ? styles.messageWrapperOwn : ''
                          }`}
                        >
                          <div
                            className={`${styles.messageBubble} ${
                              message.role === 'user' ? styles.messageBubbleOwn : ''
                            }`}
                          >
                            {message.role !== 'user' && (
                              <div className={styles.messageSender}>Netdata AI</div>
                            )}
                            <div className={styles.messageText}>
                              {message.content}
                              {message.isStreaming && <span className={styles.streamingCursor}>▊</span>}
                            </div>
                            <div className={styles.messageTimestamp}>
                              {formatTimestamp(message.created_at)}
                            </div>
                          </div>
                        </div>
                      ))}
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

  return (
    <div className={styles.chatContainer}>
      {mode === 'list' ? renderConversationsList() : renderConversation()}
    </div>
  );
};

export default Chat;

