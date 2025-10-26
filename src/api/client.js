import axios from 'axios';

const NETDATA_CLOUD_BASE_URL = 'https://testing.netdata.cloud/api/v2';

const client = axios.create({
  baseURL: NETDATA_CLOUD_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

