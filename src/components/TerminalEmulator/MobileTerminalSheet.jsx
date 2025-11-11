/**
 * MobileTerminalSheet
 *
 * A unified draggable bottom sheet for mobile devices that contains the terminal.
 * Chat appears as an overlay on top when opened via the conversation button.
 * - Collapsed state: Shows only the context panel
 * - Expanded state: Shows terminal with optional chat overlay
 * - Supports touch drag gestures for smooth transitions
 * - Terminal input will be used as chat input when chat is visible
 * - Supports forwarding messages from terminal to chat
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Terminal component to render
 * @param {string} props.message - Message to forward to chat (from terminal)
 * @param {function} props.onMessageProcessed - Callback when message is processed
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useChatManager } from '../../contexts/ChatManagerContext';
import { useSharedSpaceRoomData } from '../../contexts/SharedSpaceRoomDataContext';
import Chat from '../Chat/Chat';
import styles from './MobileTerminalSheet.module.css';

const MobileTerminalSheet = ({ children, message, onMessageProcessed }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragStartY, setDragStartY] = useState(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const dragHandleRef = useRef(null);

  const { isCurrentChatOpen, closeChat, openChat, getCurrentChatInstance } = useChatManager();
  const { getSpaceById, getRoomById } = useSharedSpaceRoomData();

  // Threshold for snapping to expanded/collapsed state (in pixels)
  const SNAP_THRESHOLD = 50;

  // Height of the collapsed state (context panel only)
  const COLLAPSED_HEIGHT = 60;

  // Height of the expanded state
  const EXPANDED_HEIGHT = 200;

  // Get current chat instance
  const chatInstance = getCurrentChatInstance();
  const isChatOpen = isCurrentChatOpen();

  // Resolve space and room IDs to full objects
  const space = useMemo(() => {
    if (!chatInstance?.space) return null;
    return getSpaceById(chatInstance.space);
  }, [chatInstance?.space, getSpaceById]);

  const room = useMemo(() => {
    if (!chatInstance?.space || !chatInstance?.room) return null;
    return getRoomById(chatInstance.space, chatInstance.room);
  }, [chatInstance?.space, chatInstance?.room, getRoomById]);

  // Auto-open chat when sheet is expanded on mobile
  useEffect(() => {
    if (isExpanded && !isChatOpen) {
      // Open chat when sheet is expanded
      openChat();
    }
  }, [isExpanded, isChatOpen, openChat]);

  // Sync chat open state - expand panel when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      setIsExpanded(true);
    }
  }, [isChatOpen]);

  // Calculate max translate based on whether chat is open
  const getMaxTranslate = () => {
    if (isChatOpen) {
      // For chat overlay, use more height (85vh for better chat experience)
      return (window.innerHeight * 85) / 100;
    } else {
      // For terminal only, use fixed height
      return EXPANDED_HEIGHT - COLLAPSED_HEIGHT;
    }
  };

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
    const maxTranslate = getMaxTranslate();

    // Only allow dragging within bounds
    if (isExpanded) {
      // When expanded, only allow dragging down
      if (deltaY > 0) {
        setCurrentTranslateY(Math.min(deltaY, maxTranslate));
      }
    } else {
      // When collapsed, only allow dragging up
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
    if (isExpanded) {
      // If dragged down more than threshold, collapse
      if (currentTranslateY > SNAP_THRESHOLD) {
        setIsExpanded(false);
        // If chat was open, close it
        if (isChatOpen) {
          closeChat();
        }
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
      const newExpandedState = !isExpanded;
      setIsExpanded(newExpandedState);

      // If collapsing and chat is open, close it
      if (!newExpandedState && isChatOpen) {
        closeChat();
      }
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

  // Calculate dynamic height based on whether chat is open
  const getSheetHeight = () => {
    if (!isExpanded) return 'auto';
    if (isChatOpen) return '85vh';
    return `${EXPANDED_HEIGHT}px`;
  };

  return (
    <>
      {/* Backdrop - only visible when expanded */}
      {isExpanded && (
        <div
          className={styles.backdrop}
          onClick={() => {
            setIsExpanded(false);
            if (isChatOpen) {
              closeChat();
            }
          }}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${isExpanded ? styles.sheetExpanded : styles.sheetCollapsed} ${isChatOpen ? styles.sheetWithChat : ''}`}
        style={{
          transform: isDragging ? `translateY(${currentTranslateY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          height: getSheetHeight(),
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

        {/* Chat Section - Appears on top when open */}
        {chatInstance && isChatOpen && isExpanded && (
          <div className={styles.chatSection}>
            <Chat
              space={space}
              room={room}
              isOpen={isChatOpen}
              message={message}
              onMessageProcessed={onMessageProcessed}
            />
          </div>
        )}

        {/* Terminal Content - Always visible at bottom */}
        <div className={`${styles.terminalContent} ${!isExpanded ? styles.contentHidden : ''} ${isChatOpen ? styles.terminalWithChat : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
};

export default MobileTerminalSheet;

