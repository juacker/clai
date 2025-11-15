import React from 'react';
import styles from './NetdataSpinner.module.css';

/**
 * Netdata Icon Component
 *
 * Optimized Netdata logo mark - only the semicircle logo for spinner use.
 * Spins around the center of the semicircle (approximately x=33, y=34).
 *
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS class names
 * @param {number} props.size - Size of the icon in pixels (default: 40)
 */
const NetdataIcon = ({ className = "", size = 40 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 65 65"
      fill="none"
      className={className}
      style={{
        transformOrigin: '50% 52%' // Adjusted to center on the semicircle
      }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M40.7084 59.5833H27.5225L0.5 8.125H38.8578C53.7729 8.15204 65.858 20.0767 65.8659 34.7873C65.8419 48.4964 54.5902 59.5833 40.7084 59.5833Z"
        fill="currentColor"
      />
    </svg>
  );
};

/**
 * NetdataSpinner Component
 *
 * A loading spinner using the Netdata logo with smooth rotation animation.
 * Provides consistent branding across all loading states in the application.
 *
 * @param {Object} props - Component props
 * @param {number} props.size - Size of the spinner in pixels (default: 40)
 * @param {string} props.className - Additional CSS class names
 */
const NetdataSpinner = ({ size = 40, className = "" }) => {
  return (
    <div className={`${styles.netdataSpinnerWrapper} ${className}`}>
      <NetdataIcon
        size={size}
        className={styles.netdataSpinner}
      />
    </div>
  );
};

export default NetdataSpinner;

