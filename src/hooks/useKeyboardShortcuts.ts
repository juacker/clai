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

export interface KeyboardShortcutHandlers {
  /** Called with tab index (1-9) when Alt+Number is pressed */
  onSwitchTab?: (index: number) => void;
  /** Ctrl/Cmd+T */
  onNewTab?: () => void;
  /** Ctrl/Cmd+W */
  onCloseTab?: () => void;
  /** Ctrl/Cmd+Tab */
  onNextTab?: () => void;
  /** Ctrl/Cmd+Shift+Tab */
  onPrevTab?: () => void;
  /** Ctrl/Cmd+Shift+T */
  onReopenTab?: () => void;
  /** Ctrl/Cmd+Shift+V (vim-style: side by side) */
  onSplitVertical?: () => void;
  /** Ctrl/Cmd+- (vim-style: stacked) */
  onSplitHorizontal?: () => void;
  /** Ctrl/Cmd+Shift+W */
  onCloseTile?: () => void;
  /** Ctrl/Cmd+] */
  onNextTile?: () => void;
  /** Ctrl/Cmd+[ */
  onPrevTile?: () => void;
  /** Ctrl/Cmd+Shift+C */
  onToggleChat?: () => void;
}

export interface ShortcutCategory {
  category: string;
  items: { keys: string[]; description: string }[];
}

export interface KeyboardShortcutsInfo {
  shortcuts: ShortcutCategory[];
}

/**
 * Normalize key names across browsers
 */
const normalizeKey = (key: string): string => {
  return key.toLowerCase();
};

/**
 * Check if the primary modifier key is pressed
 * (Cmd on Mac, Ctrl on Windows/Linux)
 */
const isPrimaryModifier = (event: KeyboardEvent, os: string): boolean => {
  if (os === 'macos') {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
};

/**
 * Check if only Alt key is pressed (no other modifiers)
 */
const isOnlyAlt = (event: KeyboardEvent): boolean => {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
};

/**
 * Hook to manage global keyboard shortcuts
 */
export const useKeyboardShortcuts = (
  handlers: KeyboardShortcutHandlers = {},
  enabled = true
): KeyboardShortcutsInfo => {
  const { os } = usePlatform();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Get normalized key
    const key = normalizeKey(event.key);

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
        ],
      },
      {
        category: 'Tab Management',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'T'], description: 'New tab' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'W'], description: 'Close tab' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'T'], description: 'Reopen closed tab' },
        ],
      },
      {
        category: 'Tile Management',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'V'], description: 'Split tile (left|right)' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', '-'], description: 'Split tile (top/bottom)' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'W'], description: 'Close current tile' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', ']'], description: 'Next tile' },
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', '['], description: 'Previous tile' },
        ],
      },
      {
        category: 'Terminal',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'L'], description: 'Focus terminal input' },
        ],
      },
      {
        category: 'Chat',
        items: [
          { keys: [os === 'macos' ? 'Cmd' : 'Ctrl', 'Shift', 'C'], description: 'Toggle chat panel' },
        ],
      },
    ],
  };
};

export default useKeyboardShortcuts;
