import axios from 'axios';

const NETDATA_CLOUD_BASE_URL = 'https://testing.netdata.cloud/api/v2';

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
    const response = await client.get('/accounts/me', {
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

export default client;

