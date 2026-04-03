/**
 * Help Component
 *
 * Displays available commands and shortcuts in a compact format.
 * Shows platform-appropriate keyboard shortcuts (Cmd on Mac, Ctrl on Windows/Linux).
 */

import React from 'react';
import { usePlatform } from '../../hooks/usePlatform';
import styles from './Help.module.css';

const Help = () => {
  const { os } = usePlatform();
  const mod = os === 'macos' ? 'Cmd' : 'Ctrl';

  return (
    <div className={styles.helpContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}>Commands & Shortcuts</h2>
      </div>

      <div className={styles.content}>
        <div className={styles.columns}>
          {/* Left column - Commands */}
          <div className={styles.column}>
            <h3 className={styles.sectionTitle}>Terminal</h3>
            <div className={styles.chatRow}><span className={styles.chatHighlight}>Just type to chat with the assistant</span></div>
            <div className={styles.commandRow}><code>/ctx</code> <span>Show current tab context</span></div>
            <div className={styles.commandRow}><code>/ctx set &lt;key&gt; &lt;value&gt;</code> <span>Set custom tab context</span></div>
            <div className={styles.commandRow}><code>/ctx add &lt;key&gt; &lt;value&gt;</code> <span>Add to a context value or list</span></div>
            <div className={styles.commandRow}><code>/ctx del &lt;key&gt; [value]</code> <span>Delete a context key or list item</span></div>
            <div className={styles.commandRow}><code>/echo &lt;text&gt;</code> <span>Display text</span></div>
            <div className={styles.commandRow}><code>/help</code> <span>This reference</span></div>
            <div className={styles.commandRow}><code>/dashboard</code> <span>Open a dashboard tile</span></div>
            <div className={styles.commandRow}><code>/canvas</code> <span>Open a canvas tile</span></div>
            <div className={styles.commandRow}><code>/anomalies --spaceId=&lt;id&gt; --roomId=&lt;id&gt;</code> <span>Open anomalies for an explicit target when Netdata Cloud MCP is attached</span></div>
            <div className={styles.commandRow}><code>/reset-all</code> <span>Reset the current workspace layout</span></div>
            <div className={styles.commandRow}><code>/tab</code> <span>New tab</span></div>
            <div className={styles.commandRow}><code>/tab close</code> / <code>rename</code> / <code>next</code> / <code>prev</code> / <code>list</code></div>
            <div className={styles.commandRow}><code>/tile split-v</code> <span>left|right</span></div>
            <div className={styles.commandRow}><code>/tile split-h</code> <span>top/bottom</span></div>
            <div className={styles.commandRow}><code>/tile close</code> / <code>next</code> / <code>prev</code></div>
            <div className={styles.commandRow}><span>MCP servers are attached from the context bar, not through terminal commands.</span></div>
          </div>

          {/* Right column - Shortcuts */}
          <div className={styles.column}>
            <h3 className={styles.sectionTitle}>Shortcuts</h3>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>L</kbd> <span>Focus terminal</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>Shift</kbd><kbd>C</kbd> <span>Toggle chat</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>T</kbd> <span>New tab</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>W</kbd> <span>Close tab</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>Tab</kbd> <span>Next tab</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>Shift</kbd><kbd>Tab</kbd> <span>Prev tab</span></div>
            <div className={styles.shortcutRow}><kbd>Alt</kbd><kbd>1-9</kbd> <span>Go to tab</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>Shift</kbd><kbd>V</kbd> <span>Split left|right</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>-</kbd> <span>Split top/bottom</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>Shift</kbd><kbd>W</kbd> <span>Close tile</span></div>
            <div className={styles.shortcutRow}><kbd>{mod}</kbd><kbd>]</kbd> / <kbd>[</kbd> <span>Next/prev tile</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
