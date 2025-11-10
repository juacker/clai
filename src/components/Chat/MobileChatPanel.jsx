/**
 * MobileChatPanel
 *
 * A draggable chat panel for mobile devices that appears above the terminal.
 * - Collapsed state: Hidden (height: 0)
 * - Expanded state: Shows chat interface (height: 50vh)
 * - Supports touch drag gestures for smooth transitions
 * - Positioned above the terminal emulator
 */

import React, { useState, useRef, useEffect } from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import Chat from './Chat';
import styles from './MobileChatPanel.module.css';

const MobileChatPanel = () => {
  const { isCurrentChatOpen, toggleChat, getCurrentChatInstance } = useChatManager();
  const [dragStartY, setDragStartY] = useState(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const dragHandleRef = useRef(null);

  // Threshold for snapping to expanded/collapsed state (in pixels)
  const SNAP_THRESHOLD = 50;

  // Maximum height of the chat panel (50vh)
  const MAX_HEIGHT_VH = 50;

  // Get current chat instance and open state
  const chatInstance = getCurrentChatInstance();
  const isChatOpen = isCurrentChatOpen();

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

    // Calculate max translate based on viewport height
    const maxTranslate = (window.innerHeight * MAX_HEIGHT_VH) / 100;

    // Only allow dragging within bounds
    if (isChatOpen) {
      // When expanded, only allow dragging down (closing)
      if (deltaY > 0) {
        setCurrentTranslateY(Math.min(deltaY, maxTranslate));
      }
    } else {
      // When collapsed, only allow dragging up (opening)
      if (deltaY < 0) {
        setCurrentTranslateY(Math.max(deltaY, -maxTranslate));
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);

    // Determine if we should snap to expanded or collapsed
    if (isChatOpen) {
      // If dragged down more than threshold, collapse
      if (currentTranslateY > SNAP_THRESHOLD) {
        toggleChat();
      }
    } else {
      // If dragged up more than threshold, expand
      if (Math.abs(currentTranslateY) > SNAP_THRESHOLD) {
        toggleChat();
      }
    }

    // Reset translate
    setCurrentTranslateY(0);
    setDragStartY(null);
  };

  // Handle tap on drag handle to toggle
  const handleDragHandleTap = () => {
    if (!isDragging) {
      toggleChat();
    }
  };

  // Prevent body scroll when chat is expanded
  useEffect(() => {
    if (isChatOpen) {
      // Store original overflow style
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isChatOpen]);

  // Don't render if no chat instance
  if (!chatInstance) {
    return null;
  }

  return (
    <>
      {/* Backdrop - only visible when expanded */}
      {isChatOpen && (
        <div
          className={styles.backdrop}
          onClick={toggleChat}
        />
      )}

      {/* Chat Panel */}
      <div
        ref={panelRef}
        className={`${styles.panel} ${isChatOpen ? styles.panelExpanded : styles.panelCollapsed}`}
        style={{
          transform: isDragging ? `translateY(${currentTranslateY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
          <div className={styles.dragHandleLabel}>
            {isChatOpen ? 'Desliza hacia abajo para cerrar' : 'Desliza hacia arriba para abrir chat'}
          </div>
        </div>

        {/* Chat Content */}
        <div className={styles.chatContent}>
          <Chat
            space={chatInstance.space}
            room={chatInstance.room}
            isOpen={isChatOpen}
          />
        </div>
      </div>
    </>
  );
};

export default MobileChatPanel;

