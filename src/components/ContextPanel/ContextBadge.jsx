/**
 * ContextBadge Component
 *
 * Displays individual context items as clean, minimalistic badges.
 * Used within the ContextPanel to show space, room, and custom key-value pairs.
 */

import React from 'react';
import styles from './ContextBadge.module.css';

/**
 * ContextBadge displays a single context item
 *
 * @param {Object} props
 * @param {string} props.type - Type of badge: 'space', 'room', or 'custom'
 * @param {string} props.label - Label to display (for custom badges, this is the key)
 * @param {string} props.value - Value to display
 * @param {string} [props.icon] - Optional icon to display
 */
const ContextBadge = ({ type = 'custom', label, value, icon }) => {
  // Determine badge style based on type
  const badgeClass = `${styles.badge} ${styles[`badge${type.charAt(0).toUpperCase() + type.slice(1)}`] || ''}`;

  // For space and room, we show just the value
  // For custom, we show key=value
  const displayText = type === 'space' || type === 'room'
    ? value
    : `${label}=${value}`;

  return (
    <div className={badgeClass} title={`${label}: ${value}`}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>{displayText}</span>
    </div>
  );
};

export default ContextBadge;

