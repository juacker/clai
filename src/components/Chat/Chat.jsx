import React, { useState, useEffect, useRef } from 'react';
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  createChatCompletion,
} from '../../api/client';
import styles from './Chat.module.css';

/**
 * Chat Component
 *
 * A chat component with two modes:
 * 1. List Mode: Display all conversations for the current space/room
 * 2. Single Conversation Mode: Display a specific conversation with messages
 *
 * This component is designed to be shown/hidden based on the active space-room context.
 * Multiple instances are kept in memory to preserve state when switching between contexts.
 *
 * The input is handled by the Terminal Emulator component and forwarded to this component
 * via the message prop. When a message is received:
 * - In list mode: Creates a new conversation and sends the message
 * - In conversation mode: Sends the message to the active conversation
 *
 * Props:
 * - space: The space object with id and name
 * - room: The room object with id and name
 * - isOpen: Whether the chat is currently open/visible
 * - message: Message to send (forwarded from Terminal Emulator)
 * - onMessageProcessed: Callback to notify parent that message was processed
 */

const Chat = ({ space, room, isOpen, message, onMessageProcessed }) => {
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

  // Message sending state
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');

  // Ref to track if we're already processing a message
  const processingMessageRef = useRef(false);
  const messagesEndRef = useRef(null);

  // Get token from localStorage
  const getToken = () => {
    return localStorage.getItem('netdata_token');
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle incoming messages from Terminal Emulator
  useEffect(() => {
    // Only process messages when chat is open and we have a valid message
    if (!isOpen || !message || !message.trim() || processingMessageRef.current) {
      return;
    }

    // Only process if we have space and room context
    if (!space?.id || !room?.id) {
      console.warn('Cannot send message: Missing space or room context');
      return;
    }

    processingMessageRef.current = true;
    handleIncomingMessage(message.trim());
  }, [message, isOpen, space?.id, room?.id]);

  // Handle incoming message based on current mode
  const handleIncomingMessage = async (messageText) => {
    if (mode === 'list') {
      // In list mode: Create new conversation and send message
      await createConversationAndSendMessage(messageText);
    } else if (mode === 'conversation' && currentConversation?.id) {
      // In conversation mode: Send message to active conversation
      await sendMessageToConversation(messageText);
    }

    // Notify parent that message was processed
    if (onMessageProcessed) {
      onMessageProcessed();
    }

    processingMessageRef.current = false;
  };

  // Create a new conversation and send the first message
  const createConversationAndSendMessage = async (messageText) => {
    const token = getToken();
    if (!token) {
      setConversationsError('Authentication token not found');
      return;
    }

    setConversationsLoading(true);
    setConversationsError(null);

    try {
      // Create new conversation
      const data = await createConversation(token, space.id, room.id, {});

      // Load the conversation
      const conversationData = await getConversation(token, space.id, room.id, data.id);
      setCurrentConversation(conversationData);
      setMode('conversation');

      // Send the message
      await sendMessageToConversation(messageText, data.id);
    } catch (error) {
      console.error('Failed to create conversation and send message:', error);
      setConversationsError(error.message);
    } finally {
      setConversationsLoading(false);
    }
  };

  // Send message to the current conversation
  const sendMessageToConversation = async (messageText, conversationId = null) => {
    const token = getToken();
    if (!token) {
      setConversationError('Authentication token not found');
      return;
    }

    const targetConversationId = conversationId || currentConversation?.id;
    if (!targetConversationId) {
      console.error('No conversation ID available');
      return;
    }

    setIsSendingMessage(true);
    setStreamingMessage('');
    setConversationError(null);

    try {
      // Add user message to the conversation optimistically
      const userMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: messageText,
        created_at: new Date().toISOString(),
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), userMessage],
      }));

      // Scroll to bottom after adding user message
      setTimeout(scrollToBottom, 100);

      // Create a temporary assistant message for streaming
      const assistantMessageId = `temp-assistant-${Date.now()}`;
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), assistantMessage],
      }));

      // Send completion request with streaming
      let fullResponse = '';
      await createChatCompletion(
        token,
        space.id,
        room.id,
        targetConversationId,
        messageText,
        (chunk) => {
          // Handle SSE chunks
          if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
            fullResponse += chunk.delta.text;
            setStreamingMessage(fullResponse);

            // Update the assistant message with streamed content
            setCurrentConversation((prev) => {
              const messages = [...(prev?.messages || [])];
              const lastMessageIndex = messages.findIndex(m => m.id === assistantMessageId);
              if (lastMessageIndex !== -1) {
                messages[lastMessageIndex] = {
                  ...messages[lastMessageIndex],
                  content: fullResponse,
                };
              }
              return { ...prev, messages };
            });

            // Scroll to bottom during streaming
            scrollToBottom();
          } else if (chunk.type === 'message_stop') {
            // Message completed
            console.log('Message completed');
          } else if (chunk.type === 'error') {
            console.error('Stream error:', chunk.error);
            setConversationError(chunk.error?.message || 'An error occurred');
          }
        }
      );

      // Reload conversation to get the actual server data
      const updatedConversation = await getConversation(token, space.id, room.id, targetConversationId);
      setCurrentConversation(updatedConversation);

      // Scroll to bottom after loading updated conversation
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      setConversationError(error.message);
    } finally {
      setIsSendingMessage(false);
      setStreamingMessage('');
    }
  };

  // Load conversations list when component mounts or space/room changes
  useEffect(() => {
    if (space?.id && room?.id && mode === 'list') {
      loadConversations();
    }
  }, [space?.id, room?.id, mode]);

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
      setConversations(data.conversations || []);
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
    } catch (error) {
      console.error('Failed to load conversation:', error);
      setConversationError(error.message);
    } finally {
      setConversationLoading(false);
    }
  };

  // Create a new conversation
  const handleCreateConversation = async () => {
    const token = getToken();
    if (!token) {
      setConversationsError('Authentication token not found');
      return;
    }

    setConversationsLoading(true);
    setConversationsError(null);

    try {
      const data = await createConversation(token, space.id, room.id, {});
      // After creating, load the new conversation
      await loadConversation(data.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setConversationsError(error.message);
    } finally {
      setConversationsLoading(false);
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
                      {conversation.title || 'Untitled Conversation'}
                    </div>
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => handleDeleteConversation(conversation.id, e)}
                      title="Delete conversation"
                    >
                      🗑️
                    </button>
                  </div>
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

        <div className={styles.chatFooter}>
          <button
            className={styles.newConversationButton}
            onClick={handleCreateConversation}
            disabled={conversationsLoading}
          >
            <span className={styles.buttonIcon}>➕</span>
            <span className={styles.buttonText}>New Conversation</span>
          </button>
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
                        <div className={styles.messageText}>{message.content || message.text}</div>
                        <div className={styles.messageTimestamp}>
                          {formatTimestamp(message.created_at || message.timestamp)}
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

