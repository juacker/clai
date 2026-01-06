/**
 * CommandRegistry - Manages command instances for a tab
 *
 * Commands are the logical entities that produce UI content.
 * Each content command (canvas, dashboard, anomalies, help, echo)
 * creates an entry in the registry when executed.
 *
 * Key concepts:
 * - Commands are independent of tiles (tiles are "views" into commands)
 * - Components register APIs with the registry to enable external access
 * - Commands persist with the tab and restore on reload
 */

/**
 * Generate a unique command ID
 * @returns {string} Unique command ID
 */
const generateCommandId = () =>
  `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * CommandRegistry manages command instances for a single tab.
 *
 * Usage:
 * - create(type, args) - Create a new command, returns commandId
 * - delete(commandId) - Remove a command
 * - get(commandId) - Get command entry
 * - assignToTile(commandId, tileId) - Associate command with a tile
 * - registerApi(commandId, api) - Register component API
 */
export class CommandRegistry {
  constructor() {
    /** @type {Map<string, CommandEntry>} */
    this.commands = new Map();
  }

  /**
   * Create a new command entry
   * @param {string} type - Command type (canvas, dashboard, etc.)
   * @param {object} args - Command arguments
   * @returns {string} The new command ID
   */
  create(type, args = {}) {
    const id = generateCommandId();
    const entry = {
      id,
      type,
      args,
      tileId: null,
      api: null,
      createdAt: Date.now(),
    };
    this.commands.set(id, entry);
    return id;
  }

  /**
   * Delete a command
   * @param {string} commandId - Command ID to delete
   * @returns {boolean} True if deleted, false if not found
   */
  delete(commandId) {
    return this.commands.delete(commandId);
  }

  /**
   * Get a command entry
   * @param {string} commandId - Command ID
   * @returns {CommandEntry|undefined} Command entry or undefined
   */
  get(commandId) {
    return this.commands.get(commandId);
  }

  /**
   * Get all command entries
   * @returns {CommandEntry[]} Array of all commands
   */
  getAll() {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by type
   * @param {string} type - Command type to filter by
   * @returns {CommandEntry[]} Commands matching the type
   */
  getByType(type) {
    return this.getAll().filter((cmd) => cmd.type === type);
  }

  /**
   * Get command assigned to a specific tile
   * @param {string} tileId - Tile ID to look up
   * @returns {CommandEntry|undefined} Command in that tile
   */
  getByTile(tileId) {
    return this.getAll().find((cmd) => cmd.tileId === tileId);
  }

  /**
   * Assign a command to a tile
   * @param {string} commandId - Command ID
   * @param {string} tileId - Tile ID to assign to
   */
  assignToTile(commandId, tileId) {
    const entry = this.commands.get(commandId);
    if (entry) {
      entry.tileId = tileId;
    }
  }

  /**
   * Unassign a command from its tile
   * @param {string} commandId - Command ID
   */
  unassignFromTile(commandId) {
    const entry = this.commands.get(commandId);
    if (entry) {
      entry.tileId = null;
    }
  }

  /**
   * Register a component API for a command
   * Called by components when they mount
   * @param {string} commandId - Command ID
   * @param {object} api - API object with methods
   */
  registerApi(commandId, api) {
    const entry = this.commands.get(commandId);
    if (entry) {
      entry.api = api;
    }
  }

  /**
   * Unregister a component API
   * Called by components when they unmount
   * @param {string} commandId - Command ID
   */
  unregisterApi(commandId) {
    const entry = this.commands.get(commandId);
    if (entry) {
      entry.api = null;
    }
  }

  /**
   * Check if a command exists
   * @param {string} commandId - Command ID
   * @returns {boolean} True if exists
   */
  has(commandId) {
    return this.commands.has(commandId);
  }

  /**
   * Get the number of commands
   * @returns {number} Command count
   */
  get size() {
    return this.commands.size;
  }

  /**
   * Serialize registry for persistence
   * Excludes api (will be re-registered on component mount)
   * @returns {SerializedCommand[]} Serializable command data
   */
  toJSON() {
    return this.getAll().map(({ id, type, args, tileId, createdAt }) => ({
      id,
      type,
      args,
      tileId,
      createdAt,
    }));
  }

  /**
   * Create a registry from serialized data
   * @param {SerializedCommand[]} data - Serialized commands
   * @returns {CommandRegistry} New registry with restored commands
   */
  static fromJSON(data) {
    const registry = new CommandRegistry();
    for (const cmd of data || []) {
      registry.commands.set(cmd.id, {
        ...cmd,
        api: null, // API will be registered when component mounts
      });
    }
    return registry;
  }

  /**
   * Clear all commands
   */
  clear() {
    this.commands.clear();
  }
}

/**
 * @typedef {Object} CommandEntry
 * @property {string} id - Unique command ID
 * @property {string} type - Command type (canvas, dashboard, etc.)
 * @property {object} args - Original command arguments
 * @property {string|null} tileId - Tile displaying this command (null if not assigned)
 * @property {object|null} api - Registered API from component (null until mounted)
 * @property {number} createdAt - Timestamp of creation
 */

/**
 * @typedef {Object} SerializedCommand
 * @property {string} id - Command ID
 * @property {string} type - Command type
 * @property {object} args - Command arguments
 * @property {string|null} tileId - Tile ID
 * @property {number} createdAt - Timestamp
 */

export default CommandRegistry;
