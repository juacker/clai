/**
 * ContextSelector Component
 *
 * A dropdown selector for choosing spaces or rooms.
 * Appears when clicking on space/room badges in the ContextPanel.
 */

import React, { useEffect, useRef } from 'react';
import styles from './ContextSelector.module.css';

/**
 * ContextSelector displays a dropdown list for selecting spaces or rooms
 *
 * @param {Object} props
 * @param {Array} props.items - Array of items to display (spaces or rooms)
 * @param {string} props.selectedId - Currently selected item ID
 * @param {Function} props.onSelect - Callback when an item is selected
 * @param {Function} props.onClose - Callback when the selector should close
 * @param {string} props.type - Type of selector: 'space' or 'room'
 * @param {Object} props.position - Position object with { top, left, right, bottom }
 */
const ContextSelector = ({ items, selectedId, onSelect, onClose, type, position }) => {
  const selectorRef = useRef(null);

  // Auto-focus the first item when selector opens
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is fully rendered
    const rafId = requestAnimationFrame(() => {
      if (selectorRef.current) {
        // Focus the first item for keyboard navigation
        const firstItem = selectorRef.current.querySelector('button');
        if (firstItem) {
          firstItem.focus();
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, []);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        onClose();
      }
    };

    // Add event listener with a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Handle item selection
  const handleSelect = (item) => {
    onSelect(item);
    onClose();
  };

  // Calculate position styles
  const positionStyles = {};
  if (position) {
    if (position.top !== undefined) positionStyles.top = `${position.top}px`;
    if (position.left !== undefined) positionStyles.left = `${position.left}px`;
    if (position.right !== undefined) positionStyles.right = `${position.right}px`;
    if (position.bottom !== undefined) positionStyles.bottom = `${position.bottom}px`;
  }

  const title = type === 'space' ? 'Select Space' : 'Select Room';

  return (
    <div className={styles.overlay}>
      <div
        ref={selectorRef}
        className={styles.selector}
        style={positionStyles}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close selector"
          >
            ×
          </button>
        </div>

        {/* Items List */}
        <div className={styles.itemsList}>
          {items.length === 0 ? (
            <div className={styles.noResults}>No items available</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                className={`${styles.item} ${item.id === selectedId ? styles.itemSelected : ''}`}
                onClick={() => handleSelect(item)}
              >
                <span className={styles.itemName}>{item.name}</span>
                {item.id === selectedId && (
                  <span className={styles.checkmark}>✓</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ContextSelector;

