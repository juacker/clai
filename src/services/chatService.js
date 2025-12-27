import { invoke } from '@tauri-apps/api/core';

/**
 * Chat Service
 *
 * Provides a unified interface for chat operations using Tauri backend.
 * All methods call Rust commands via Tauri's invoke API.
 */

/**
 * List all conversations
 * @returns {Promise<Array>} Array of conversations
 * @throws {Error} If the request fails
 */
export const listChats = async () => {
  try {
    const conversations = await invoke('list_chats');
    return conversations;
  } catch (error) {
    console.error('Failed to list chats:', error);
    throw new Error(`Failed to list chats: ${error}`);
  }
};

/**
 * Get a specific conversation by ID
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} Conversation object with messages
 * @throws {Error} If the request fails
 */
export const getChat = async (conversationId) => {
  try {
    const conversation = await invoke('get_chat', { conversationId });
    return conversation;
  } catch (error) {
    console.error('Failed to get chat:', error);
    throw new Error(`Failed to get chat: ${error}`);
  }
};

/**
 * Create a new conversation
 * @param {Object} data - Conversation data
 * @param {string} [data.title] - Optional conversation title
 * @returns {Promise<Object>} Created conversation
 * @throws {Error} If the request fails
 */
export const createChat = async (data = {}) => {
  try {
    const conversation = await invoke('create_chat', {
      request: {
        title: data.title || '',
      },
    });
    return conversation;
  } catch (error) {
    console.error('Failed to create chat:', error);
    throw new Error(`Failed to create chat: ${error}`);
  }
};

/**
 * Delete a conversation
 * @param {string} conversationId - The conversation ID to delete
 * @returns {Promise<void>}
 * @throws {Error} If the request fails
 */
export const deleteChat = async (conversationId) => {
  try {
    await invoke('delete_chat', { conversationId });
  } catch (error) {
    console.error('Failed to delete chat:', error);
    throw new Error(`Failed to delete chat: ${error}`);
  }
};

/**
 * Update conversation title based on message content
 * @param {string} conversationId - The conversation ID
 * @param {string} messageContent - The message content to generate title from
 * @returns {Promise<Object>} Object with the generated title
 * @throws {Error} If the request fails
 */
export const updateChatTitle = async (conversationId, messageContent) => {
  try {
    const result = await invoke('update_chat_title', {
      conversationId,
      request: {
        message_content: messageContent,
      },
    });
    return result;
  } catch (error) {
    console.error('Failed to update chat title:', error);
    throw new Error(`Failed to update chat title: ${error}`);
  }
};

/**
 * Send a message in a conversation and get a response
 *
 * Note: This is a stub implementation. In the future, this will support
 * streaming responses via SSE or similar mechanism.
 *
 * @param {string} conversationId - The conversation ID
 * @param {string} message - The message to send
 * @param {Object} options - Additional options
 * @param {string} [options.parentMessageId] - Optional parent message ID
 * @param {Function} [options.onChunk] - Callback for streaming chunks (not yet implemented)
 * @returns {Promise<Object>} The assistant's response message
 * @throws {Error} If the request fails
 */
export const sendMessage = async (conversationId, message, options = {}) => {
  try {
    const response = await invoke('send_message', {
      conversationId,
      request: {
        message,
        parent_message_id: options.parentMessageId || null,
      },
    });

    // TODO: Implement streaming support
    // For now, we just return the complete response
    // In the future, we'll need to handle SSE-style streaming

    return response;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw new Error(`Failed to send message: ${error}`);
  }
};

/**
 * Send a message with streaming support (stub - to be implemented)
 *
 * This is a placeholder for future streaming implementation.
 * Currently it just calls sendMessage and simulates streaming.
 *
 * @param {string} conversationId - The conversation ID
 * @param {string} message - The message to send
 * @param {Function} onChunk - Callback for each chunk
 * @param {string} [parentMessageId] - Optional parent message ID
 * @returns {Promise<void>}
 */
export const sendMessageStreaming = async (
  conversationId,
  message,
  onChunk,
  parentMessageId
) => {
  try {
    // For now, get the complete response and simulate streaming
    const response = await sendMessage(conversationId, message, { parentMessageId });

    // Simulate streaming by sending the response in chunks
    if (onChunk && response) {
      // Send message_start event
      onChunk({
        type: 'message_start',
        message: {
          id: response.id,
          role: response.role,
        },
      });

      // Send content blocks
      if (response.content && Array.isArray(response.content)) {
        for (let i = 0; i < response.content.length; i++) {
          const block = response.content[i];

          // Send content_block_start
          onChunk({
            type: 'content_block_start',
            index: i,
            content_block: block,
          });

          // If it's a text block, send deltas
          if (block.type === 'text' && block.text) {
            // Split text into chunks to simulate streaming
            const chunkSize = 10;
            for (let j = 0; j < block.text.length; j += chunkSize) {
              const textChunk = block.text.substring(j, j + chunkSize);
              onChunk({
                type: 'content_block_delta',
                index: i,
                delta: {
                  type: 'text_delta',
                  text: textChunk,
                },
              });
              // Small delay to simulate streaming
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }

          // Send content_block_stop
          onChunk({
            type: 'content_block_stop',
            index: i,
          });
        }
      }

      // Send message_stop event
      onChunk({
        type: 'message_stop',
      });
    }
  } catch (error) {
    console.error('Failed to send message with streaming:', error);
    throw error;
  }
};

export default {
  listChats,
  getChat,
  createChat,
  deleteChat,
  updateChatTitle,
  sendMessage,
  sendMessageStreaming,
};

