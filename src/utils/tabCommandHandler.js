/**
 * Tab Command Handler
 *
 * Handles all tab command operations for managing tabs including:
 * - Creating and switching tabs
 * - Closing tabs
 * - Renaming tabs
 * - Listing tabs
 * - Resetting tab layout
 * - Duplicating tabs
 */

/**
 * Handle tab command execution
 *
 * @param {Object} command - Parsed command object
 * @param {Object} tabManager - Tab manager from useTabManager hook
 * @returns {Object} Result with success status and message
 */
export function handleTabCommand(command, tabManager) {
  const { args } = command;
  const { positional } = args;

  // If no arguments, create a new tab with default title
  if (positional.length === 0) {
    return handleNewTab([], tabManager);
  }

  const firstArg = positional[0].toLowerCase();

  // Check if first arg is a subcommand
  const subcommands = ['new', 'close', 'rename', 'list', 'reset', 'duplicate', 'next', 'prev'];

  if (subcommands.includes(firstArg)) {
    const subcommand = firstArg;

    switch (subcommand) {
      case 'new':
        return handleNewTab(positional.slice(1), tabManager);

      case 'close':
        return handleCloseTab(positional.slice(1), tabManager);

      case 'rename':
        return handleRenameTab(positional.slice(1), tabManager);

      case 'list':
        return handleListTabs(tabManager);

      case 'reset':
        return handleResetTab(tabManager);

      case 'duplicate':
        return handleDuplicateTab(tabManager);

      case 'next':
        return handleNextTab(tabManager);

      case 'prev':
        return handlePrevTab(tabManager);

      default:
        return {
          success: false,
          message: `Unknown tab subcommand: ${subcommand}\nUsage: tab [new|close|rename|list|reset|duplicate|next|prev] [args...]`
        };
    }
  }

  // Check if it's a numeric index for switching tabs
  const index = parseInt(firstArg, 10);
  if (!isNaN(index)) {
    return handleSwitchTab(index, tabManager);
  }

  // If not a subcommand or number, show error
  return {
    success: false,
    message: `Invalid tab command. Use "tab new <title>" to create a tab with a custom title.\nUsage: tab [new|close|rename|list|reset|duplicate|next|prev|<index>] [args...]`
  };
}

/**
 * Handle tab new <title>
 * Create a new tab with custom title or default title
 */
function handleNewTab(args, tabManager) {
  const { createTab } = tabManager;

  // If no title provided, create with default
  if (args.length === 0) {
    const newTab = createTab();
    return {
      success: true,
      message: `Created new tab: ${newTab.title}`
    };
  }

  // Create with custom title
  const title = args.join(' ');
  const newTab = createTab(title);
  return {
    success: true,
    message: `Created new tab: ${newTab.title}`
  };
}

/**
 * Handle tab <index>
 * Switch to tab by numeric index (1-based)
 */
function handleSwitchTab(index, tabManager) {
  const { tabs, switchToTab } = tabManager;

  if (index < 1 || index > tabs.length) {
    return {
      success: false,
      message: `Tab index out of range. Valid range: 1-${tabs.length}`
    };
  }

  const targetTab = tabs[index - 1];
  switchToTab(targetTab.id);
  return {
    success: true,
    message: `Switched to tab ${index}: ${targetTab.title}`
  };
}

/**
 * Handle tab next
 * Navigate to next tab
 */
function handleNextTab(tabManager) {
  const { tabs, switchToNextTab } = tabManager;

  const result = switchToNextTab();
  if (result) {
    const tab = tabs.find(t => t.id === result);
    return {
      success: true,
      message: `Switched to next tab: ${tab?.title || result}`
    };
  }
  return {
    success: false,
    message: 'Already at the last tab'
  };
}

/**
 * Handle tab prev
 * Navigate to previous tab
 */
function handlePrevTab(tabManager) {
  const { tabs, switchToPrevTab } = tabManager;

  const result = switchToPrevTab();
  if (result) {
    const tab = tabs.find(t => t.id === result);
    return {
      success: true,
      message: `Switched to previous tab: ${tab?.title || result}`
    };
  }
  return {
    success: false,
    message: 'Already at the first tab'
  };
}

/**
 * Handle tab close [index]
 * Close current tab or specified tab by index
 */
function handleCloseTab(args, tabManager) {
  const { tabs, activeTabId, closeTab } = tabManager;

  // No arguments - close current tab
  if (args.length === 0) {
    const currentTab = tabs.find(t => t.id === activeTabId);

    if (tabs.length === 1) {
      return {
        success: false,
        message: 'Cannot close the last tab'
      };
    }

    closeTab(activeTabId);
    return {
      success: true,
      message: `Closed tab: ${currentTab?.title || activeTabId}`
    };
  }

  // Close tab by index
  const indexStr = args.join(' ');
  const index = parseInt(indexStr, 10);

  if (isNaN(index)) {
    return {
      success: false,
      message: 'Usage: tab close [index]'
    };
  }

  if (index < 1 || index > tabs.length) {
    return {
      success: false,
      message: `Tab index out of range. Valid range: 1-${tabs.length}`
    };
  }

  if (tabs.length === 1) {
    return {
      success: false,
      message: 'Cannot close the last tab'
    };
  }

  const targetTab = tabs[index - 1];
  closeTab(targetTab.id);

  return {
    success: true,
    message: `Closed tab ${index}: ${targetTab.title}`
  };
}

/**
 * Handle tab rename <title>
 * Rename current tab
 */
function handleRenameTab(args, tabManager) {
  if (args.length === 0) {
    return {
      success: false,
      message: 'Usage: tab rename <title>'
    };
  }

  const { tabs, activeTabId, renameTab } = tabManager;
  const newTitle = args.join(' ');

  const currentTab = tabs.find(t => t.id === activeTabId);
  const oldTitle = currentTab?.title || 'Untitled';

  renameTab(activeTabId, newTitle);

  return {
    success: true,
    message: `Renamed tab from "${oldTitle}" to "${newTitle}"`
  };
}

/**
 * Handle tab list
 * List all tabs with their indices
 */
function handleListTabs(tabManager) {
  const { tabs, activeTabId } = tabManager;

  if (tabs.length === 0) {
    return {
      success: true,
      message: 'No tabs available'
    };
  }

  const lines = [];
  lines.push('=== Tabs ===');
  lines.push('');

  tabs.forEach((tab, index) => {
    const isActive = tab.id === activeTabId;
    const marker = isActive ? '* ' : '  ';
    const number = `${index + 1}.`;
    lines.push(`${marker}${number.padEnd(4)} ${tab.title}`);
  });

  lines.push('');
  lines.push(`Total: ${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`);

  return {
    success: true,
    message: lines.join('\n')
  };
}

/**
 * Handle tab reset
 * Reset current tab layout (clear tiles)
 */
function handleResetTab(tabManager) {
  const { tabs, activeTabId, resetTab } = tabManager;

  const currentTab = tabs.find(t => t.id === activeTabId);
  resetTab(activeTabId);

  return {
    success: true,
    message: `Reset tab layout: ${currentTab?.title || activeTabId}`
  };
}

/**
 * Handle tab duplicate
 * Duplicate current tab
 */
function handleDuplicateTab(tabManager) {
  const { tabs, activeTabId, duplicateTab } = tabManager;

  const currentTab = tabs.find(t => t.id === activeTabId);
  const newTab = duplicateTab(activeTabId);

  return {
    success: true,
    message: `Duplicated tab "${currentTab?.title || 'Untitled'}" as "${newTab.title}"`
  };
}

/**
 * Check if a command is a tab command
 */
export function isTabCommand(command) {
  return command.type === 'tab' || command.name === 'tab';
}

