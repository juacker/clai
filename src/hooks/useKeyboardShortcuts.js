/**
 * useKeyboardShortcuts Hook
 *
 * Centralized keyboard shortcut management for global shortcuts.
 * Handles platform-specific modifiers (Cmd on Mac, Ctrl on Windows/Linux).
 *
 * Usage:
 *   const shortcuts = useKeyboardShortcuts({
 *     onSwitchTab: (index) => console.log(`Switch to tab ${index}`),
 *     onNewTab: () => console.log('New tab'),
 *     // ... other handlers
 *   });
 *
 * Component-specific shortcuts (like terminal focus) should remain
 * in their respective components.
 */

import { useEffect, useCallback } from 'react';
import { usePlatform } from './usePlatform';

/**
 * Normalize key names across browsers
 * @param {string} key - Event key
 * @returns {string} Normalized key
 */
const normalizeKey = (key) => {
  return key.toLowerCase();
};

/**
 * Check if the primary modifier key is pressed
 * (Cmd on Mac, Ctrl on Windows/Linux)
 * @param {KeyboardEvent} event - Keyboard event
 * @param {string} os - Operating system
 * @returns {boolean} True if primary modifier is pressed
 */
const isPrimaryModifier = (event, os) => {
  if (os === 'macos') {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
};

/**
 * Check if only Alt key is pressed (no other modifiers)
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {boolean} True if only Alt is pressed
 */
const isOnlyAlt = (event) => {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
};

/**
 * Hook to manage global keyboard shortcuts
 * @param {Object} handlers - Shortcut handlers
 * @param {Function} handlers.onSwitchTab - Called with tab index (1-9) when Alt+Number is pressed
 * @param {Function} handlers.onNewTab - Called when Ctrl/Cmd+T is pressed
 * @param {Function} handlers.onCloseTab - Called when Ctrl/Cmd+W is pressed
 * @param {Function} handlers.onNextTab - Called when Ctrl/Cmd+Tab is pressed
 * @param {Function} handlers.onPrevTab - Called when Ctrl/Cmd+Shift+Tab is pressed
 * @param {Function} handlers.onReopenTab - Called when Ctrl/Cmd+Shift+T is pressed
 * @param {Function} handlers.onSplitVertical - Called when Ctrl/Cmd+Shift+V is pressed (vim-style: side by side)
 * @param {Function} handlers.onSplitHorizontal - Called when Ctrl/Cmd+- is pressed (vim-style: stacked)
 * @param {Function} handlers.onCloseTile - Called when Ctrl/Cmd+Shift+W is pressed
 * @param {Function} handlers.onNextTile - Called when Ctrl/Cmd+] is pressed
 * @param {Function} handlers.onPrevTile - Called when Ctrl/Cmd+[ is pressed
 * @param {Function} handlers.onToggleChat - Called when Ctrl/Cmd+Shift+C is pressed
 * @param {boolean} enabled - Whether shortcuts are enabled (default: true)
 */
export const useKeyboardShortcuts = (handlers = {}, enabled = true) => {
  const { os } = usePlatform();

  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Ignore shortcuts when typing in input fields (except for specific cases)
    const target = event.target;
    const isInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable;

    // Get normalized key
    const key = normalizeKey(event.key);

    // Debug: Log key presses with modifiers (remove after debugging)
    if (isPrimaryModifier(event, os)) {
      console.log('Key pressed:', {
        key: event.key,
        normalized: key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey
      });
    }

    // Tab switching: Alt+1 through Alt+9
    if (isOnlyAlt(event) && key >= '1' && key <= '9') {
      event.preventDefault();
      const tabIndex = parseInt(key, 10);
      if (handlers.onSwitchTab) {
        handlers.onSwitchTab(tabIndex);
      }
      return;
    }

    // New Tab: Ctrl/Cmd+T
    if (isPrimaryModifier(event, os) && !event.shiftKey && key === 't') {
      event.preventDefault();
      if (handlers.onNewTab) {
        handlers.onNewTab();
      }
      return;
    }

    // Close Tab: Ctrl/Cmd+W
    if (isPrimaryModifier(event, os) && !event.shiftKey && key === 'w') {
      event.preventDefault();
      if (handlers.onCloseTab) {
        handlers.onCloseTab();
      }
      return;
    }

    // Reopen Closed Tab: Ctrl/Cmd+Shift+T
    if (isPrimaryModifier(event, os) && event.shiftKey && key === 't') {
      event.preventDefault();
      if (handlers.onReopenTab) {
        handlers.onReopenTab();
      }
      return;
    }

    // Next Tab: Ctrl/Cmd+Tab
    if (isPrimaryModifier(event, os) && !event.shiftKey && key === 'tab') {
      event.preventDefault();
      if (handlers.onNextTab) {
        handlers.onNextTab();
      }
      return;
    }

    // Previous Tab: Ctrl/Cmd+Shift+Tab
    if (isPrimaryModifier(event, os) && event.shiftKey && key === 'tab') {
      event.preventDefault();
      if (handlers.onPrevTab) {
        handlers.onPrevTab();
      }
      return;
    }

    // Split Vertical (vim-style: side by side): Ctrl/Cmd+Shift+V
    if (isPrimaryModifier(event, os) && event.shiftKey && key === 'v') {
      event.preventDefault();
      if (handlers.onSplitVertical) {
        handlers.onSplitVertical();
      }
      return;
    }

    // Split Horizontal (vim-style: stacked): Ctrl/Cmd+-
    if (isPrimaryModifier(event, os) && !event.shiftKey && (key === '-' || event.code === 'Minus')) {
      event.preventDefault();
      if (handlers.onSplitHorizontal) {
        handlers.onSplitHorizontal();
      }
      return;
    }

    // Close Tile: Ctrl/Cmd+Shift+W
    if (isPrimaryModifier(event, os) && event.shiftKey && key === 'w') {
      event.preventDefault();
      if (handlers.onCloseTile) {
        handlers.onCloseTile();
      }
      return;
    }

    // Next Tile: Ctrl/Cmd+]
    if (isPrimaryModifier(event, os) && !event.shiftKey && (key === ']' || event.code === 'BracketRight')) {
      event.preventDefault();
      if (handlers.onNextTile) {
        handlers.onNextTile();
      }
      return;
    }

    // Previous Tile: Ctrl/Cmd+[
    if (isPrimaryModifier(event, os) && !event.shiftKey && (key === '[' || event.code === 'BracketLeft')) {
      event.preventDefault();
      if (handlers.onPrevTile) {
        handlers.onPrevTile();
      }
      return;
    }

    // Toggle Chat: Ctrl/Cmd+Shift+C
    if (isPrimaryModifier(event, os) && event.shiftKey && key === 'c') {
      event.preventDefault();
      if (handlers.onToggleChat) {
        handlers.onToggleChat();
      }
      return;
    }
  }, [enabled, os, handlers]);

  // Register global keyboard listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  // Return shortcut information for help/documentation
  return {
    shortcuts: [
      {
        category: 'Tab Navigation',
        items: [
          { keys: ['Alt', '1-9'], description: 'Switch to tab by position' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Tab'], description: 'Next tab' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'Tab'], description: 'Previous tab' },
        ]
      },
      {
        category: 'Tab Management',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'T'], description: 'New tab' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'W'], description: 'Close tab' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'T'], description: 'Reopen closed tab' },
        ]
      },
      {
        category: 'Tile Management',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'V'], description: 'Split tile (left|right)' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', '-'], description: 'Split tile (top/bottom)' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'W'], description: 'Close current tile' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', ']'], description: 'Next tile' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', '['], description: 'Previous tile' },
        ]
      },
      {
        category: 'Terminal',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'L'], description: 'Focus terminal input' },
        ]
      },
      {
        category: 'Chat',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'C'], description: 'Toggle chat panel' },
        ]
      }
    ]
  };
};

export default useKeyboardShortcuts;

