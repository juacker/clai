/**
 * Example Plugin Template
 *
 * This is a template/example showing how to implement a plugin.
 * Copy this file and modify it to create your own plugin.
 */

import { PluginInterface, PLUGIN_CAPABILITIES } from './PluginInterface';

export class ExamplePlugin extends PluginInterface {
  // ============================================================================
  // PLUGIN METADATA
  // ============================================================================

  static id = 'example';
  static name = 'Example Plugin';
  static version = '1.0.0';
  static description = 'An example plugin showing the basic structure';

  // Define what capabilities this plugin supports
  static capabilities = [
    PLUGIN_CAPABILITIES.DATA,
    PLUGIN_CAPABILITIES.AUTH,
    PLUGIN_CAPABILITIES.CONTEXT,
  ];

  // Define configuration schema (JSON Schema format)
  // @deprecated Use getRegistrationSchema() and getInstanceParametersSchema() instead
  static configSchema = {
    type: 'object',
    properties: {
      apiUrl: {
        type: 'string',
        title: 'API URL',
        description: 'The API endpoint URL',
      },
      apiKey: {
        type: 'string',
        title: 'API Key',
        description: 'Your API key',
        format: 'password',
      },
      timeout: {
        type: 'number',
        title: 'Timeout (ms)',
        description: 'Request timeout in milliseconds',
        default: 30000,
      },
    },
    required: ['apiUrl', 'apiKey'],
  };

  // ============================================================================
  // TWO-LEVEL ARCHITECTURE
  // ============================================================================

  // Level 1: Registration schema (credentials entered in settings)
  static getRegistrationSchema() {
    return {
      type: 'object',
      properties: {
        apiUrl: {
          type: 'string',
          title: 'API URL',
          description: 'The API endpoint URL',
        },
        apiKey: {
          type: 'string',
          title: 'API Key',
          description: 'Your API key',
          format: 'password',
        },
      },
      required: ['apiUrl', 'apiKey'],
    };
  }

  // Level 2: Instance parameters schema (context selected when adding to tab)
  static async getInstanceParametersSchema(registrationConfig) {
    return {
      type: 'object',
      properties: {
        environment: {
          type: 'string',
          title: 'Environment',
          enum: ['production', 'staging', 'development'],
        },
        region: {
          type: 'string',
          title: 'Region',
          enum: ['us-east-1', 'us-west-2', 'eu-west-1'],
        },
      },
      required: ['environment', 'region'],
    };
  }

  // Fetch available contexts (to populate dropdowns)
  static async fetchAvailableContexts(registrationConfig) {
    // Example: Fetch from API using registrationConfig.apiKey
    return {
      environments: [
        { id: 'production', name: 'Production' },
        { id: 'staging', name: 'Staging' },
        { id: 'development', name: 'Development' },
      ],
      regions: [
        { id: 'us-east-1', name: 'US East 1' },
        { id: 'us-west-2', name: 'US West 2' },
        { id: 'eu-west-1', name: 'EU West 1' },
      ],
    };
  }

  // Validate instance parameters
  static async validateInstanceParameters(registrationConfig, instanceParams) {
    const { environment, region } = instanceParams;
    return !!(environment && region);
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  async initialize() {
    console.log(`[ExamplePlugin] Initializing ${this.instanceName}...`);

    // Validate configuration
    if (!this.validateConfig()) {
      throw new Error('Invalid configuration');
    }

    // Initialize API client, connections, etc.
    this.apiUrl = this.config.apiUrl;
    this.apiKey = this.config.apiKey;
    this.timeout = this.config.timeout || 30000;

    // Test connection
    try {
      await this.testConnection();
      console.log(`[ExamplePlugin] Initialized successfully`);
    } catch (error) {
      console.error(`[ExamplePlugin] Initialization failed:`, error);
      this.setError(error);
      throw error;
    }
  }

  async activate() {
    await super.activate();
    console.log(`[ExamplePlugin] Activated ${this.instanceName}`);
  }

  async deactivate() {
    await super.deactivate();
    console.log(`[ExamplePlugin] Deactivated ${this.instanceName}`);
  }

  async destroy() {
    await super.destroy();
    console.log(`[ExamplePlugin] Destroyed ${this.instanceName}`);
    // Clean up resources, close connections, etc.
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  async authenticate(credentials) {
    // Implement authentication logic
    // This might involve exchanging credentials for a token, etc.
    console.log(`[ExamplePlugin] Authenticating...`);

    // Example: Make an auth request
    // const response = await fetch(`${this.apiUrl}/auth`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(credentials)
    // });

    return {
      success: true,
      token: 'example_token',
    };
  }

  async isAuthenticated() {
    // Check if currently authenticated
    return !!this.apiKey;
  }

  // ============================================================================
  // DATA CAPABILITY
  // ============================================================================

  async queryData(params) {
    console.log(`[ExamplePlugin] Querying data:`, params);

    // Implement data query logic
    // This is provider-specific - could be PromQL, SQL, etc.

    // Example:
    // const response = await fetch(`${this.apiUrl}/query`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(params)
    // });
    //
    // return await response.json();

    // Mock data for example
    return {
      metric: params.metric,
      data: [
        { timestamp: Date.now() - 3600000, value: 42 },
        { timestamp: Date.now() - 1800000, value: 45 },
        { timestamp: Date.now(), value: 48 },
      ],
    };
  }

  async getMetadata(params) {
    console.log(`[ExamplePlugin] Getting metadata:`, params);

    // Return available metrics, labels, etc.
    return {
      metrics: ['cpu.usage', 'memory.usage', 'disk.io'],
      labels: ['host', 'region', 'environment'],
    };
  }

  async getAvailableContexts() {
    console.log(`[ExamplePlugin] Getting available contexts`);

    // Return hierarchical contexts (spaces, rooms, namespaces, etc.)
    // This is provider-specific
    return [
      {
        id: 'context_1',
        name: 'Production',
        type: 'environment',
        children: [
          { id: 'context_1_1', name: 'US-East', type: 'region' },
          { id: 'context_1_2', name: 'EU-West', type: 'region' },
        ],
      },
      {
        id: 'context_2',
        name: 'Staging',
        type: 'environment',
      },
    ];
  }

  // ============================================================================
  // CONTEXT DISPLAY
  // ============================================================================

  getContextDisplay() {
    return {
      label: this.instanceName,
      value: this.instanceId,
      details: {
        apiUrl: this.apiUrl,
      },
    };
  }

  getContextInfo() {
    return {
      'API URL': this.apiUrl,
      'Instance': this.instanceName,
      'Status': this.status,
    };
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  getStatus() {
    return {
      ...super.getStatus(),
      apiUrl: this.apiUrl,
      connected: this.status === 'active',
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  async testConnection() {
    // Test connection to the API
    console.log(`[ExamplePlugin] Testing connection to ${this.apiUrl}...`);

    // Example:
    // const response = await fetch(`${this.apiUrl}/health`, {
    //   headers: { 'Authorization': `Bearer ${this.apiKey}` }
    // });
    //
    // if (!response.ok) {
    //   throw new Error('Connection test failed');
    // }

    return true;
  }
}

export default ExamplePlugin;

