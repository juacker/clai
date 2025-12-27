/**
 * Tile Command Handler
 *
 * Handles all tile command operations for managing tile layouts including:
 * - Splitting tiles (vertical and horizontal)
 * - Navigating between tiles
 * - Closing tiles
 * - Resizing tiles
 * - Focusing tiles
 */

/**
 * Handle tile command execution
 *
 * @param {Object} command - Parsed command object
 * @param {Object} tileManager - Tile manager from TabManagerContext
 * @returns {Object} Result with success status and message
 */
export function handleTileCommand(command, tileManager) {
  const { args } = command;
  const { positional } = args;

  // If no arguments, show current tile info
  if (positional.length === 0) {
    return handleTileInfo(tileManager);
  }

  const firstArg = positional[0].toLowerCase();

  // Check if first arg is a subcommand
  const subcommands = ['split-v', 'split-h', 'close', 'resize', 'next', 'prev', 'focus', 'list'];

  if (subcommands.includes(firstArg)) {
    const subcommand = firstArg;

    switch (subcommand) {
      case 'split-v':
        return handleSplitVertical(positional.slice(1), tileManager);

      case 'split-h':
        return handleSplitHorizontal(positional.slice(1), tileManager);

      case 'close':
        return handleCloseTile(positional.slice(1), tileManager);

      case 'resize':
        return handleResizeTile(positional.slice(1), tileManager);

      case 'next':
        return handleNextTile(tileManager);

      case 'prev':
        return handlePrevTile(tileManager);

      case 'focus':
        return handleFocusTile(positional.slice(1), tileManager);

      case 'list':
        return handleListTiles(tileManager);

      default:
        return {
          success: false,
          message: `Unknown tile subcommand: ${subcommand}\nUsage: tile [split-v|split-h|close|resize|next|prev|focus|list] [args...]`
        };
    }
  }

  // Check if it's a numeric index for focusing tiles
  const index = parseInt(firstArg, 10);
  if (!isNaN(index)) {
    return handleFocusTileByIndex(index, tileManager);
  }

  // If not a subcommand or number, show error
  return {
    success: false,
    message: `Invalid tile command. Use "tile split-v" or "tile split-h" to split tiles.\nUsage: tile [split-v|split-h|close|resize|next|prev|focus|list|<index>] [args...]`
  };
}

/**
 * Handle tile (no args)
 * Show current tile information
 */
function handleTileInfo(tileManager) {
  const { tabs, activeTabId, activeTileId } = tileManager;
  const currentTab = tabs.find(t => t.id === activeTabId);

  if (!currentTab) {
    return {
      success: false,
      message: 'No active tab found'
    };
  }

  const tileCount = countTiles(currentTab.rootTile);
  const tileIndex = findTileIndex(currentTab.rootTile, activeTileId);

  return {
    success: true,
    message: `Current tile: ${tileIndex !== -1 ? tileIndex + 1 : 'unknown'} of ${tileCount}\nUse "tile list" to see all tiles`
  };
}

/**
 * Handle tile split-v [command]
 * Vim-style vertical split: creates a vertical divider (panes side by side)
 */
function handleSplitVertical(args, tileManager) {
  const { activeTileId, splitTile } = tileManager;

  if (!activeTileId) {
    return {
      success: false,
      message: 'No active tile found'
    };
  }

  // Get optional command to execute in new tile
  const commandText = args.join(' ') || null;

  try {
    // Vim-style: vertical split = horizontal panel direction (side by side)
    const result = splitTile(activeTileId, 'horizontal', commandText);
    if (result.success) {
      return {
        success: true,
        message: commandText
          ? `Split tile (left|right) and executed: ${commandText}`
          : 'Split tile (left|right)'
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      message: `Failed to split tile: ${error.message}`
    };
  }
}

/**
 * Handle tile split-h [command]
 * Vim-style horizontal split: creates a horizontal divider (panes stacked)
 */
function handleSplitHorizontal(args, tileManager) {
  const { activeTileId, splitTile } = tileManager;

  if (!activeTileId) {
    return {
      success: false,
      message: 'No active tile found'
    };
  }

  // Get optional command to execute in new tile
  const commandText = args.join(' ') || null;

  try {
    // Vim-style: horizontal split = vertical panel direction (stacked)
    const result = splitTile(activeTileId, 'vertical', commandText);
    if (result.success) {
      return {
        success: true,
        message: commandText
          ? `Split tile (top/bottom) and executed: ${commandText}`
          : 'Split tile (top/bottom)'
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      message: `Failed to split tile: ${error.message}`
    };
  }
}

/**
 * Handle tile close [index]
 * Close current tile or specified tile by index
 */
function handleCloseTile(args, tileManager) {
  const { tabs, activeTabId, activeTileId, closeTile } = tileManager;
  const currentTab = tabs.find(t => t.id === activeTabId);

  if (!currentTab) {
    return {
      success: false,
      message: 'No active tab found'
    };
  }

  const tileCount = countTiles(currentTab.rootTile);

  // No arguments - close current tile
  if (args.length === 0) {
    if (tileCount === 1) {
      return {
        success: false,
        message: 'Cannot close the last tile'
      };
    }

    try {
      const result = closeTile(activeTileId);
      if (result.success) {
        return {
          success: true,
          message: 'Closed current tile'
        };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Failed to close tile: ${error.message}`
      };
    }
  }

  // Close tile by index
  const indexStr = args.join(' ');
  const index = parseInt(indexStr, 10);

  if (isNaN(index)) {
    return {
      success: false,
      message: 'Usage: tile close [index]'
    };
  }

  if (index < 1 || index > tileCount) {
    return {
      success: false,
      message: `Tile index out of range. Valid range: 1-${tileCount}`
    };
  }

  if (tileCount === 1) {
    return {
      success: false,
      message: 'Cannot close the last tile'
    };
  }

  const targetTileId = getTileIdByIndex(currentTab.rootTile, index - 1);
  if (!targetTileId) {
    return {
      success: false,
      message: `Could not find tile at index ${index}`
    };
  }

  try {
    const result = closeTile(targetTileId);
    if (result.success) {
      return {
        success: true,
        message: `Closed tile ${index}`
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      message: `Failed to close tile: ${error.message}`
    };
  }
}

/**
 * Handle tile resize <percentage>
 * Resize current tile
 */
function handleResizeTile(args, tileManager) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: tile resize <percentage>'
    };
  }

  const { activeTileId, resizeTile } = tileManager;

  if (!activeTileId) {
    return {
      success: false,
      message: 'No active tile found'
    };
  }

  const percentage = parseInt(args[0], 10);

  if (isNaN(percentage) || percentage < 10 || percentage > 90) {
    return {
      success: false,
      message: 'Percentage must be between 10 and 90'
    };
  }

  try {
    const result = resizeTile(activeTileId, percentage);
    if (result.success) {
      return {
        success: true,
        message: `Resized tile to ${percentage}%`
      };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      message: `Failed to resize tile: ${error.message}`
    };
  }
}

/**
 * Handle tile next
 * Navigate to next tile
 */
function handleNextTile(tileManager) {
  const { focusNextTile } = tileManager;

  try {
    const result = focusNextTile();
    if (result) {
      return {
        success: true,
        message: 'Focused next tile'
      };
    }
    return {
      success: false,
      message: 'Already at the last tile'
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to focus next tile: ${error.message}`
    };
  }
}

/**
 * Handle tile prev
 * Navigate to previous tile
 */
function handlePrevTile(tileManager) {
  const { focusPrevTile } = tileManager;

  try {
    const result = focusPrevTile();
    if (result) {
      return {
        success: true,
        message: 'Focused previous tile'
      };
    }
    return {
      success: false,
      message: 'Already at the first tile'
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to focus previous tile: ${error.message}`
    };
  }
}

/**
 * Handle tile focus <index>
 * Focus a specific tile by index
 */
function handleFocusTile(args, tileManager) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: tile focus <index>'
    };
  }

  const index = parseInt(args[0], 10);
  return handleFocusTileByIndex(index, tileManager);
}

/**
 * Handle tile <index>
 * Focus a specific tile by index (shorthand)
 */
function handleFocusTileByIndex(index, tileManager) {
  const { tabs, activeTabId, focusTile } = tileManager;
  const currentTab = tabs.find(t => t.id === activeTabId);

  if (!currentTab) {
    return {
      success: false,
      message: 'No active tab found'
    };
  }

  const tileCount = countTiles(currentTab.rootTile);

  if (index < 1 || index > tileCount) {
    return {
      success: false,
      message: `Tile index out of range. Valid range: 1-${tileCount}`
    };
  }

  const targetTileId = getTileIdByIndex(currentTab.rootTile, index - 1);
  if (!targetTileId) {
    return {
      success: false,
      message: `Could not find tile at index ${index}`
    };
  }

  try {
    focusTile(targetTileId);
    return {
      success: true,
      message: `Focused tile ${index}`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to focus tile: ${error.message}`
    };
  }
}

/**
 * Handle tile list
 * List all tiles in current tab
 */
function handleListTiles(tileManager) {
  const { tabs, activeTabId, activeTileId } = tileManager;
  const currentTab = tabs.find(t => t.id === activeTabId);

  if (!currentTab) {
    return {
      success: false,
      message: 'No active tab found'
    };
  }

  const tiles = getAllTiles(currentTab.rootTile);

  if (tiles.length === 0) {
    return {
      success: true,
      message: 'No tiles in current tab'
    };
  }

  const lines = [];
  lines.push('=== Tiles ===');
  lines.push('');

  tiles.forEach((tile, index) => {
    const isActive = tile.id === activeTileId;
    const marker = isActive ? '* ' : '  ';
    const number = `${index + 1}.`;
    const commandInfo = tile.commandId ? 'has command' : 'empty';
    lines.push(`${marker}${number.padEnd(4)} Tile ${index + 1} (${commandInfo})`);
  });

  lines.push('');
  lines.push(`Total: ${tiles.length} tile${tiles.length !== 1 ? 's' : ''}`);

  return {
    success: true,
    message: lines.join('\n')
  };
}

/**
 * Helper: Count total number of tiles in layout
 */
function countTiles(layout) {
  if (!layout) return 0;
  if (layout.type === 'leaf') return 1;
  if (layout.type === 'split') {
    return layout.children.reduce((sum, child) => sum + countTiles(child), 0);
  }
  return 0;
}

/**
 * Helper: Find index of a tile by its ID
 */
function findTileIndex(layout, tileId) {
  const tiles = getAllTiles(layout);
  return tiles.findIndex(tile => tile.id === tileId);
}

/**
 * Helper: Get all leaf tiles from layout
 */
function getAllTiles(layout, tiles = []) {
  if (!layout) return tiles;
  if (layout.type === 'leaf') {
    tiles.push(layout);
  } else if (layout.type === 'split') {
    layout.children.forEach(child => getAllTiles(child, tiles));
  }
  return tiles;
}

/**
 * Helper: Get tile ID by index
 */
function getTileIdByIndex(layout, index) {
  const tiles = getAllTiles(layout);
  return tiles[index]?.id || null;
}

/**
 * Check if a command is a tile command
 */
export function isTileCommand(command) {
  return command.type === 'tile' || command.name === 'tile';
}

