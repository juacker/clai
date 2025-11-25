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
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <circle cx="7" cy="12" r="0.5" fill="currentColor" />
  </svg>
);

const CustomIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
  </svg>
);

const PluginIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M15 2v2m-6 0V2m-2 7H2m0 6h5m15-6h-5m0 6h5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * ContextBadge displays a single context item
 *
 * @param {Object} props
 * @param {string} props.type - Type of badge: 'space', 'room', 'custom', or 'plugin'
 * @param {string} props.label - Label to display (for custom badges, this is the key)
 * @param {string} props.value - Value to display
 * @param {Function} props.onClick - Optional click handler for interactive badges
 * @param {boolean} props.clickable - Whether the badge is clickable (default: false)
 * @param {Function} props.onRemove - Optional remove handler for removable badges
 * @param {boolean} props.removable - Whether the badge can be removed (default: false)
 */
const ContextBadge = ({ type = 'custom', label, value, onClick, clickable = false, onRemove, removable = false }) => {
  // Determine badge style based on type
  const badgeClass = `${styles.badge} ${styles[`badge${type.charAt(0).toUpperCase() + type.slice(1)}`] || ''} ${clickable ? styles.clickable : ''} ${removable ? styles.removable : ''}`;

  // Select the appropriate icon based on type
  const IconComponent = type === 'space' ? SpaceIcon : type === 'room' ? RoomIcon : type === 'plugin' ? PluginIcon : CustomIcon;

  // For space and room, we show just the value
  // For custom, we show key=value
  // For plugin, we show the value (display name)
  const displayText = type === 'space' || type === 'room' || type === 'plugin'
    ? value
    : `${label}=${value}`;

  // Handle click if clickable
  const handleClick = (e) => {
    if (clickable && onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  // Handle remove if removable
  const handleRemove = (e) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
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
      {removable && (
        <button
          className={styles.removeButton}
          onClick={handleRemove}
          aria-label={`Remove ${label}`}
          title="Remove"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
};

export default ContextBadge;

