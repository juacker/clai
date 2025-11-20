import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { useCommand } from '../../contexts/CommandContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useChatManager } from '../../contexts/ChatManagerContext';
import TabContext from '../../contexts/TabContext';
import { parseCommand, isLayoutCommand } from '../../utils/commandParser';
import { handleContextCommand, isContextCommand } from '../../utils/contextCommandHandler';
import { isCommandSupported } from '../../utils/commandRegistry';
import ContextPanel from '../ContextPanel/ContextPanel';
import UserAvatar from '../UserAvatar';
import styles from './TerminalEmulator.module.css';

const TerminalEmulator = ({ userInfo, onSendToChat }) => {
  const { executeCommand, commandHistory } = useCommand();
  const { handleLayoutCommand, getActiveTab } = useTabManager();
  const { setActiveContext, toggleChat, isCurrentChatOpen } = useChatManager();
  // Try to get tab context, but don't throw error if not available
  const tabContext = useContext(TabContext);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputMessages, setOutputMessages] = useState([]);
  const [isOutputVisible, setIsOutputVisible] = useState(true);
  const [isHoveringOutput, setIsHoveringOutput] = useState(false);
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const autoCollapseTimerRef = useRef(null);
  // CHANGED: Ref for the wrapper element instead of display to handle scrolling
  const inputWrapperRef = useRef(null);

  // Check if desktop chat panel is open
  const isChatOpen = isCurrentChatOpen();

  // Maximum number of messages to keep
  const MAX_MESSAGES = 5;
  // Auto-collapse delay in milliseconds
  const AUTO_COLLAPSE_DELAY = 5000; // 10 seconds

  // UPDATED: Function to scroll the wrapper to keep cursor visible
  const scrollToCursor = useCallback(() => {
    if (inputWrapperRef.current) {
      // Scroll to the far right to show the cursor
      inputWrapperRef.current.scrollLeft = inputWrapperRef.current.scrollWidth;
    }
  }, []);

  // UPDATED: Effect to scroll when input value changes
  useEffect(() => {
    scrollToCursor();
  }, [inputValue, scrollToCursor]);

  // Reset auto-collapse timer - memoized to avoid recreating on every render
  const resetAutoCollapseTimer = useCallback(() => {
    // Clear existing timer
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }
    // Set new timer
    autoCollapseTimerRef.current = setTimeout(() => {
      setIsOutputVisible(false);
    }, AUTO_COLLAPSE_DELAY);
  }, [AUTO_COLLAPSE_DELAY]);

  // Helper function to add output messages
  const addOutputMessage = useCallback((message, type = 'info') => {
    const newMessage = {
      id: Date.now() + Math.random(),
      text: message,
      type, // 'info', 'success', 'error', 'warning'
      timestamp: new Date()
    };
    setOutputMessages(prev => {
      const updated = [...prev, newMessage];
      // Keep only the last MAX_MESSAGES messages
      return updated.slice(-MAX_MESSAGES);
    });
    // Only show output area and reset auto-collapse timer for error/warning messages
    // Success messages are added to the list but don't expand the panel
    if (type === 'error' || type === 'warning') {
      setIsOutputVisible(true);
      resetAutoCollapseTimer();
    }
  }, [resetAutoCollapseTimer, MAX_MESSAGES]);

  // Clear auto-collapse timer on unmount
  useEffect(() => {
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
      }
    };
  }, []);

  // Handle hover state changes - restart timer when user stops hovering
  useEffect(() => {
    if (!isHoveringOutput && isOutputVisible && outputMessages.length > 0) {
      resetAutoCollapseTimer();
    } else if (isHoveringOutput && autoCollapseTimerRef.current) {
      // Clear timer while hovering to prevent collapse
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
  }, [isHoveringOutput, isOutputVisible, outputMessages.length, resetAutoCollapseTimer]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputMessages]);

  // Sync chat context with active tab's space/room
  useEffect(() => {
    const activeTab = getActiveTab();
    if (activeTab?.context?.spaceRoom) {
      const { selectedSpaceId, selectedRoomId } = activeTab.context.spaceRoom;
      setActiveContext(selectedSpaceId, selectedRoomId);
    }
  }, [getActiveTab, setActiveContext]);

  // Handle command execution
  const handleCommandExecution = async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Clear input immediately
    setInputValue('');
    setHistoryIndex(-1);

    // Check if chat is open - if so, forward the input to chat instead of processing as command
    if (isChatOpen && onSendToChat) {
      onSendToChat(trimmed);
      return;
    }

    // Parse the command
    const command = parseCommand(trimmed);

    // Check if it's a context command (ctx)
    if (isContextCommand(command)) {
      // Check if TabContext is available
      if (!tabContext) {
        addOutputMessage('Context commands are not available yet. Please wait for the tab to load.', 'error');
        return;
      }

      try {
        const result = await handleContextCommand(command, tabContext);
        if (result.success) {
          addOutputMessage(result.message, 'success');
        } else {
          addOutputMessage(result.message, 'error');
        }
      } catch (error) {
        addOutputMessage(`Context command error: ${error.message}`, 'error');
      }
    }
    // Check if it's a layout command (tab/tile management)
    else if (isLayoutCommand(command)) {
      const result = handleLayoutCommand(command);
      if (result && !result.success) {
        addOutputMessage(result.message || 'Layout command failed', 'error');
      } else if (result && result.message) {
        addOutputMessage(result.message, 'success');
      }
    }
    // Execute visualization/action command with CommandContext
    else {
      // Validate command type using registry - no hardcoded list needed!
      if (!isCommandSupported(command.type)) {
        addOutputMessage(`Unknown command: ${trimmed}`, 'error');
        return;
      }
      executeCommand(command);
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommandExecution(inputValue);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Navigate command history backwards
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]?.raw || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Navigate command history forwards
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInputValue('');
        } else {
          setHistoryIndex(newIndex);
          setInputValue(commandHistory[newIndex]?.raw || '');
        }
      }
    } else if (e.key === 'Escape') {
      // Clear output on Escape
      setOutputMessages([]);
    }
  };

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Global keyboard shortcut to focus terminal (Ctrl+L or Cmd+L)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+L (Windows/Linux) or Cmd+L (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    };

    // Add global event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className={`${styles.terminal} ${isChatOpen ? styles.chatOpen : ''}`} onClick={handleTerminalClick}>
      {/* Context Panel - shows space/room badges */}
      <div className={styles.contextPanelWrapper}>
        <ContextPanel />
      </div>

      {/* Input Line - Now at the top for better UX */}
      <div className={styles.terminalContent}>
        {/* Chat Toggle Button - Positioned at the left for always-visible access */}
        <button
          className={styles.chatToggleButtonInline}
          onClick={(e) => {
            e.stopPropagation();
            toggleChat();
          }}
          aria-label="Toggle chat"
          title="Toggle chat"
        >
          <span className={styles.chatToggleIconInline}>
            💬
          </span>
        </button>

        {/* User Avatar - positioned at the left */}
        <div className={styles.terminalAvatar}>
          <UserAvatar
            avatarUrl={userInfo?.avatarUrl}
            userName={userInfo?.name || userInfo?.email}
            size="small"
            showMenu={true}
          />
        </div>

        {/* Terminal Prompt Symbol */}
        <span className={styles.terminalPrompt}>%</span>

        {/* Terminal Input - SIMPLIFIED: Just the input, no display span */}
        <div className={styles.terminalInputWrapper} ref={inputWrapperRef}>
          <input
            ref={inputRef}
            type="text"
            className={styles.terminalInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type a command..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {/* Output Messages Area - Now BELOW the input for better UX */}
      {outputMessages.length > 0 && (
        <div
          className={`${styles.outputArea} ${!isOutputVisible ? styles.outputAreaCollapsed : ''}`}
          ref={outputRef}
          onMouseEnter={() => setIsHoveringOutput(true)}
          onMouseLeave={() => setIsHoveringOutput(false)}
        >
          {outputMessages.map((msg) => (
            <div key={msg.id} className={`${styles.outputMessage} ${styles[`outputMessage${msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}`]}`}>
              <span className={styles.outputMessageText}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TerminalEmulator;
