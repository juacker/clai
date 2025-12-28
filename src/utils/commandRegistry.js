/**
 * Command Registry
 *
 * Simple, lightweight command registration system.
 * Maps command names to their React components.
 *
 * To add a new command:
 * 1. Create your component
 * 2. Add it to COMMAND_COMPONENTS below
 * 3. That's it! No other files need to be updated.
 */

import Echo from '../components/Echo';
import Anomalies from '../components/Anomalies/Anomalies';
import Canvas from '../components/Canvas/Canvas';
import Help from '../components/Help/Help';

/**
 * Command Component Registry
 * Maps command names to their React components
 */
export const COMMAND_COMPONENTS = {
  echo: Echo,
  anomalies: Anomalies,
  canvas: Canvas,
  help: Help,
};

/**
 * Check if a command is supported (has a component)
 * @param {string} commandName - Command name to check
 * @returns {boolean} True if command is supported
 */
export const isCommandSupported = (commandName) => {
  return commandName in COMMAND_COMPONENTS;
};

/**
 * Get the component for a command
 * @param {string} commandName - Command name
 * @returns {React.Component|null} Component or null if not found
 */
export const getCommandComponent = (commandName) => {
  return COMMAND_COMPONENTS[commandName] || null;
};

/**
 * Get all supported command names
 * @returns {string[]} Array of supported command names
 */
export const getSupportedCommands = () => {
  return Object.keys(COMMAND_COMPONENTS);
};

