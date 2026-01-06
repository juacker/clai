/**
 * DashboardPicker Component
 *
 * A simple picker UI for selecting which dashboard to send a chart to.
 * Rendered as a portal to position correctly relative to the viewport.
 * Supports hover highlighting to show which dashboard corresponds to each option.
 */

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import styles from './DashboardPicker.module.css';

const DashboardPicker = ({ dashboards, onSelect, onCancel, onHighlight, position }) => {
  const pickerRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!position || !pickerRef.current) return;

    const picker = pickerRef.current;
    const rect = picker.getBoundingClientRect();
    const padding = 8;

    let { top, left } = position;

    // Adjust if overflowing right
    if (left + rect.width + padding > window.innerWidth) {
      left = window.innerWidth - rect.width - padding;
    }

    // Adjust if overflowing left
    if (left < padding) {
      left = padding;
    }

    // Adjust if overflowing bottom - show above instead
    if (top + rect.height + padding > window.innerHeight) {
      top = position.top - rect.height - 8;
    }

    // Adjust if overflowing top
    if (top < padding) {
      top = padding;
    }

    setAdjustedPosition({ top, left });
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onHighlight?.(null); // Clear highlight on close
        onCancel();
      }
    };

    // Close on Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onHighlight?.(null); // Clear highlight on close
        onCancel();
      }
    };

    // Small delay to prevent immediate closing from the triggering click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      onHighlight?.(null); // Clear highlight on unmount
    };
  }, [onCancel, onHighlight]);

  const handleMouseEnter = (dashboardId) => {
    onHighlight?.(dashboardId);
  };

  const handleMouseLeave = () => {
    onHighlight?.(null);
  };

  const handleSelect = (dashboardId) => {
    onHighlight?.(null); // Clear highlight before selecting
    onSelect(dashboardId);
  };

  const content = (
    <div
      ref={pickerRef}
      className={styles.picker}
      style={adjustedPosition ? { top: adjustedPosition.top, left: adjustedPosition.left } : undefined}
    >
      <div className={styles.header}>Select Dashboard</div>
      <div className={styles.options}>
        {dashboards.map((dashboard, index) => (
          <button
            key={dashboard.id}
            className={styles.option}
            onClick={() => handleSelect(dashboard.id)}
            onMouseEnter={() => handleMouseEnter(dashboard.id)}
            onMouseLeave={handleMouseLeave}
          >
            <span className={styles.label}>{dashboard.label}</span>
            <span className={styles.chartCount}>
              {dashboard.chartCount} chart{dashboard.chartCount !== 1 ? 's' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // Render as portal to document.body for correct positioning
  return ReactDOM.createPortal(content, document.body);
};

export default DashboardPicker;
