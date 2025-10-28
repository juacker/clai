/**
 * Echo Component
 *
 * Displays text passed as arguments to the echo command.
 * Shows only the text, as large as possible to fill all available space.
 * Example: "echo hello world" will display "hello world"
 */

import React from 'react';
import styles from './Echo.module.css';

const Echo = ({ command }) => {
  // Extract the text from command arguments
  const text = command?.args?.positional?.join(' ') || '';

  return (
    <div className={styles.echoContainer}>
      <span className={styles.echoText}>{text}</span>
    </div>
  );
};

export default Echo;

