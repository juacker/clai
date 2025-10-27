/**
 * Echo Component
 *
 * Displays text passed as arguments to the echo command.
 * Example: "echo hello world" will display "hello world"
 */

import React, { useEffect } from 'react';
import { useCommand } from '../contexts/CommandContext';
import styles from './Echo.module.css';

const Echo = ({ command }) => {
  const { setOutput } = useCommand();

  useEffect(() => {
    // Mark the command as complete with output
    if (command) {
      const text = command.args.positional.join(' ');
      setOutput({ text, timestamp: Date.now() });
    }
  }, [command, setOutput]);

  // Extract the text from command arguments
  const text = command?.args?.positional?.join(' ') || '';

  return (
    <div className={styles.echoContainer}>
      <div className={styles.echoOutput}>
        <span className={styles.echoPrompt}>$</span>
        <span className={styles.echoText}>{text}</span>
      </div>

      <div className={styles.echoMeta}>
        <span className={styles.echoCommand}>
          Command: {command?.raw}
        </span>
        <span className={styles.echoTimestamp}>
          {new Date(command?.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default Echo;

