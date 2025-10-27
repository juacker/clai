/**
 * Echo Component
 *
 * Displays text passed as arguments to the echo command.
 * Shows only the text, as large as possible to fill all available space.
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
      <span className={styles.echoText}>{text}</span>
    </div>
  );
};

export default Echo;

