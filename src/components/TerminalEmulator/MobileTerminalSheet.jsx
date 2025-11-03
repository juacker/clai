/**
 * MobileTerminalSheet
 *
 * A draggable bottom sheet for mobile devices that wraps the terminal emulator.
 * - Collapsed state: Shows only the context panel
 * - Expanded state: Shows context panel + input prompt
 * - Supports touch drag gestures for smooth transitions
 */

import React, { useState, useRef, useEffect } from 'react';
import styles from './MobileTerminalSheet.module.css';

const MobileTerminalSheet = ({ children }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragStartY, setDragStartY] = useState(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const dragHandleRef = useRef(null);

  // Threshold for snapping to expanded/collapsed state (in pixels)
  const SNAP_THRESHOLD = 50;

  // Height of the collapsed state (context panel only)
  const COLLAPSED_HEIGHT = 60;

  // Height of the expanded state (context + input)
  const EXPANDED_HEIGHT = 200;

  // Handle touch start
  const handleTouchStart = (e) => {
    setIsDragging(true);
    setDragStartY(e.touches[0].clientY);
  };

  // Handle touch move
  const handleTouchMove = (e) => {
    if (!isDragging || dragStartY === null) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartY;

    // Only allow dragging within bounds
    if (isExpanded) {
      // When expanded, only allow dragging down
      if (deltaY > 0) {
        setCurrentTranslateY(Math.min(deltaY, EXPANDED_HEIGHT - COLLAPSED_HEIGHT));
      }
    } else {
      // When collapsed, only allow dragging up
      if (deltaY < 0) {
        setCurrentTranslateY(Math.max(deltaY, -(EXPANDED_HEIGHT - COLLAPSED_HEIGHT)));
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);

    // Determine if we should snap to expanded or collapsed
    if (isExpanded) {
      // If dragged down more than threshold, collapse
      if (currentTranslateY > SNAP_THRESHOLD) {
        setIsExpanded(false);
      }
    } else {
      // If dragged up more than threshold, expand
      if (Math.abs(currentTranslateY) > SNAP_THRESHOLD) {
        setIsExpanded(true);
      }
    }

    // Reset translate
    setCurrentTranslateY(0);
    setDragStartY(null);
  };

  // Handle tap on drag handle to toggle
  const handleDragHandleTap = () => {
    if (!isDragging) {
      setIsExpanded(!isExpanded);
    }
  };

  // Prevent body scroll when sheet is expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  return (
    <>
      {/* Backdrop - only visible when expanded */}
      {isExpanded && (
        <div
          className={styles.backdrop}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${isExpanded ? styles.sheetExpanded : styles.sheetCollapsed}`}
        style={{
          transform: isDragging ? `translateY(${currentTranslateY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drag Handle */}
        <div
          ref={dragHandleRef}
          className={styles.dragHandle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleDragHandleTap}
        >
          <div className={styles.dragHandleBar} />
        </div>

        {/* Terminal Content */}
        <div className={`${styles.sheetContent} ${!isExpanded ? styles.sheetContentHidden : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
};

export default MobileTerminalSheet;

