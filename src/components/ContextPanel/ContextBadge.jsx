/**
 * ContextBadge Component
 *
 * Displays individual context items as clean, minimalistic badges.
 * Used within the ContextPanel to show space, room, and custom key-value pairs.
 */

import React from 'react';
import styles from './ContextBadge.module.css';

/**
 * SVG Icon Components - Simple, monochromatic icons that inherit color
 */
const SpaceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const RoomIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CustomIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
  </svg>
);

/**
 * ContextBadge displays a single context item
 *
 * @param {Object} props
 * @param {string} props.type - Type of badge: 'space', 'room', or 'custom'
 * @param {string} props.label - Label to display (for custom badges, this is the key)
 * @param {string} props.value - Value to display
 * @param {Function} props.onClick - Optional click handler for interactive badges
 * @param {boolean} props.clickable - Whether the badge is clickable (default: false)
 */
const ContextBadge = ({ type = 'custom', label, value, onClick, clickable = false }) => {
  // Determine badge style based on type
  const badgeClass = `${styles.badge} ${styles[`badge${type.charAt(0).toUpperCase() + type.slice(1)}`] || ''} ${clickable ? styles.clickable : ''}`;

  // Select the appropriate icon based on type
  const IconComponent = type === 'space' ? SpaceIcon : type === 'room' ? RoomIcon : CustomIcon;

  // For space and room, we show just the value
  // For custom, we show key=value
  const displayText = type === 'space' || type === 'room'
    ? value
    : `${label}=${value}`;

  // Handle click if clickable
  const handleClick = (e) => {
    if (clickable && onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <div
      className={badgeClass}
      title={`${label}: ${value}`}
      onClick={handleClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      } : undefined}
    >
      <span className={styles.icon}>
        <IconComponent />
      </span>
      <span className={styles.text}>{displayText}</span>
    </div>
  );
};

export default ContextBadge;

