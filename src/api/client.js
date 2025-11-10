import axios from 'axios';

const NETDATA_CLOUD_BASE_URL = 'https://testing.netdata.cloud/api';

const client = axios.create({
  baseURL: NETDATA_CLOUD_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor to handle authentication errors globally
client.interceptors.response.use(
  (response) => {
    // If the response is successful, just return it
    return response;
  },
  (error) => {
    // Check if the error is an authentication error (401 Unauthorized or 403 Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Clear the stored token
      localStorage.removeItem('netdata_token');
      // Redirect to login page
      window.location.href = '/login';
    }
    // Return the error to be handled by the calling code
    return Promise.reject(error);
  }
);

/**
 * Get user information from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @returns {Promise<Object>} User information
 * @throws {Error} If the request fails
 */
export const getUserInfo = async (token) => {
  try {
    const response = await client.get('/v2/accounts/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get user info: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get user info: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }
};

/**
 * Get spaces from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @returns {Promise<Object>} Spaces information
 * @throws {Error} If the request fails
 */
export const getSpaces = async (token) => {
  try {
    const response = await client.get('/v3/spaces', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get spaces: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get spaces: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get spaces: ${error.message}`);
    }
  }
};

/**
 * Get rooms from a specific space in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @returns {Promise<Object>} Rooms information
 * @throws {Error} If the request fails
 */
export const getRooms = async (token, spaceId) => {
  try {
    const response = await client.get(`/v2/spaces/${spaceId}/rooms`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      params: {
        show_all: true,
        default: false,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get rooms: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get rooms: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get rooms: ${error.message}`);
    }
  }
};

/**
 * Create a new conversation in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {Object} data - Conversation data (optional body for POST request)
 * @returns {Promise<Object>} Created conversation information
 * @throws {Error} If the request fails
 */
export const createConversation = async (token, spaceId, roomId, data = {}) => {
  try {
    const response = await client.post(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to create conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to create conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  }
};

/**
 * Get a specific conversation from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation information
 * @throws {Error} If the request fails
 */
export const getConversation = async (token, spaceId, roomId, conversationId) => {
  try {
    const response = await client.get(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to get conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to get conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }
};

/**
 * List all conversations from a specific room in Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} List of conversations
 * @throws {Error} If the request fails
 */
export const listConversations = async (token, spaceId, roomId) => {
  try {
    const response = await client.get(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to list conversations: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to list conversations: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  }
};

/**
 * Delete a specific conversation from Netdata Cloud
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {Error} If the request fails
 */
export const deleteConversation = async (token, spaceId, roomId, conversationId) => {
  try {
    const response = await client.delete(
      `/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error status
      throw new Error(
        `Failed to delete conversation: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      );
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Failed to delete conversation: No response from server');
    } else {
      // Error setting up the request
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }
};

/**
 * Create a chat completion in a conversation with SSE streaming support
 * @param {string} token - Authentication token (Bearer token)
 * @param {string} spaceId - Space ID
 * @param {string} roomId - Room ID
 * @param {string} conversationId - Conversation ID
 * @param {string} message - The new user message in the conversation (mandatory)
 * @param {Function} onChunk - Callback function that receives each SSE chunk as it arrives
 * @param {string} [parentMessageId] - Optional parent message ID
 * @returns {Promise<void>} Resolves when the stream is complete
 * @throws {Error} If the request fails
 *
 * @example
 * await createChatCompletion(token, spaceId, roomId, convId, "Hello", (chunk) => {
 *   if (chunk.type === 'content_block_delta') {
 *     console.log(chunk.delta.text);
 *   }
 * });
 */
export const createChatCompletion = async (token, spaceId, roomId, conversationId, message, onChunk, parentMessageId) => {
  try {
    // Build request body, only include parent_message_id if provided
    const requestBody = { message };
    if (parentMessageId) {
      requestBody.parent_message_id = parentMessageId;
    }

    const url = `${NETDATA_CLOUD_BASE_URL}/v1/spaces/${spaceId}/rooms/${roomId}/insights/conversations/${conversationId}/completion`;

    // Use Fetch API for SSE streaming support
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create chat completion: ${response.status} - ${errorText}`
      );
    }

    // Read the response as a stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
            onChunk(data);
          } catch (parseError) {
            console.error('Failed to parse SSE chunk:', parseError, line);
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        onChunk(data);
      } catch (parseError) {
        console.error('Failed to parse final SSE chunk:', parseError);
      }
    }
  } catch (error) {
    if (error.message.includes('Failed to create chat completion')) {
      throw error;
    } else {
      throw new Error(`Failed to create chat completion: ${error.message}`);
    }
  }
};

export default client;

