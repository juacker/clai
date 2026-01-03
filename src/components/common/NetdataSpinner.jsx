import React from 'react';
import styles from './NetdataSpinner.module.css';

/**
 * CLAI Icon Component
 *
 * The CLAI logo - a C shape with an eye/circle element.
 * Designed to spin smoothly around its center.
 *
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS class names
 * @param {number} props.size - Size of the icon in pixels (default: 40)
 */
const ClaiIcon = ({ className = "", size = 40 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      style={{
        transformOrigin: '50% 50%'
      }}
    >
      <defs>
        <linearGradient id="spinnerIndigo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#818CF8' }} />
          <stop offset="100%" style={{ stopColor: '#6366F1' }} />
        </linearGradient>
        <linearGradient id="spinnerGreen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#00C49A' }} />
          <stop offset="100%" style={{ stopColor: '#00AB94' }} />
        </linearGradient>
      </defs>

      {/* C shape */}
      <path
        d="M380 95 C200 70 70 140 70 256 C70 372 200 442 380 417"
        fill="none"
        stroke="url(#spinnerIndigo)"
        strokeWidth="52"
        strokeLinecap="round"
      />

      {/* Green circle */}
      <circle cx="256" cy="256" r="70" fill="url(#spinnerGreen)" />

      {/* White reflection */}
      <circle cx="235" cy="235" r="12" fill="#fff" opacity="0.9" />
    </svg>
  );
};

/**
 * NetdataSpinner Component (now using CLAI icon)
 *
 * A loading spinner using the CLAI logo with smooth rotation animation.
 * Provides consistent branding across all loading states in the application.
 *
 * @param {Object} props - Component props
 * @param {number} props.size - Size of the spinner in pixels (default: 40)
 * @param {string} props.className - Additional CSS class names
 */
const NetdataSpinner = ({ size = 40, className = "" }) => {
  return (
    <div className={`${styles.netdataSpinnerWrapper} ${className}`}>
      <ClaiIcon
        size={size}
        className={styles.netdataSpinner}
      />
    </div>
  );
};

export default NetdataSpinner;
