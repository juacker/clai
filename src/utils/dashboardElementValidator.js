/**
 * Dashboard Element Validator
 *
 * Validates element configurations before they are added to Dashboard.
 * Each element type has specific requirements that must be met.
 *
 * Element Structure:
 * {
 *   id: string (required) - Unique identifier for the element
 *   type: string (required) - Element type (e.g., 'context-chart')
 *   config: object (required) - Type-specific configuration
 * }
 */

/**
 * Supported element types and their config requirements
 */
const ELEMENT_TYPES = {
  'context-chart': {
    required: ['context', 'spaceId', 'roomId'],
    optional: ['groupBy', 'filterBy', 'valueAgg', 'timeAgg', 'customTimeRange'],
    validate: (config) => {
      if (typeof config.context !== 'string' || config.context.trim() === '') {
        return { valid: false, error: 'context-chart requires a non-empty context string' };
      }
      if (config.mcpServerId !== undefined && (typeof config.mcpServerId !== 'string' || config.mcpServerId.trim() === '')) {
        return { valid: false, error: 'context-chart requires a non-empty mcpServerId' };
      }
      if (typeof config.spaceId !== 'string' || config.spaceId.trim() === '') {
        return { valid: false, error: 'context-chart requires a non-empty spaceId' };
      }
      if (typeof config.roomId !== 'string' || config.roomId.trim() === '') {
        return { valid: false, error: 'context-chart requires a non-empty roomId' };
      }
      if (config.groupBy && !Array.isArray(config.groupBy)) {
        return { valid: false, error: 'groupBy must be an array' };
      }
      if (config.filterBy && typeof config.filterBy !== 'object') {
        return { valid: false, error: 'filterBy must be an object' };
      }
      return { valid: true };
    }
  },
  // Future types can be added here:
  // 'timeseries-chart': { ... },
  // 'bar-chart': { ... },
};

/**
 * Validates a dashboard element configuration
 * @param {Object} element - The element to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateDashboardElement = (element) => {
  // Check basic structure
  if (!element || typeof element !== 'object') {
    return { valid: false, error: 'Element must be an object' };
  }

  // Check required fields
  if (!element.id || typeof element.id !== 'string') {
    return { valid: false, error: 'Element must have a string id' };
  }

  if (!element.type || typeof element.type !== 'string') {
    return { valid: false, error: 'Element must have a string type' };
  }

  if (!element.config || typeof element.config !== 'object') {
    return { valid: false, error: 'Element must have a config object' };
  }

  // Check if type is supported
  const typeValidator = ELEMENT_TYPES[element.type];
  if (!typeValidator) {
    return { valid: false, error: `Unsupported element type: ${element.type}` };
  }

  // Check required config fields for this type
  for (const field of typeValidator.required) {
    if (!(field in element.config)) {
      return { valid: false, error: `${element.type} requires config.${field}` };
    }
  }

  // Run type-specific validation
  if (typeValidator.validate) {
    return typeValidator.validate(element.config);
  }

  return { valid: true };
};

/**
 * Get list of supported element types
 * @returns {string[]}
 */
export const getSupportedDashboardElementTypes = () => Object.keys(ELEMENT_TYPES);

/**
 * Check if an element type is supported
 * @param {string} type
 * @returns {boolean}
 */
export const isDashboardElementTypeSupported = (type) => type in ELEMENT_TYPES;
