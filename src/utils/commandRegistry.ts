/**
 * Command Registry
 *
 * Maps terminal command names to the React components that visualize them.
 *
 * The legacy visualization commands (echo, dashboard, canvas, anomalies,
 * help) rendered their component inside a tile via the TabContent/TileView
 * grid. That grid was the pre-workspace Home UI and has been removed, so the
 * registry is now empty: those commands report "Unknown command" and the
 * live terminal commands (/ctx, /tab, /reset-all) are handled upstream as
 * context/layout commands before this registry is ever consulted.
 *
 * `isCommandSupported` is the only consumer that remains (TerminalEmulator);
 * it returns false for every name now. Re-add an entry here if a
 * command-visualization surface is ever reintroduced.
 */

/**
 * Command Component Registry — maps command names to their React components.
 */
export const COMMAND_COMPONENTS: Record<string, unknown> = {};

/**
 * Check if a command is supported (has a component).
 */
export const isCommandSupported = (commandName: string): boolean => {
  return commandName in COMMAND_COMPONENTS;
};
