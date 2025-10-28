import React, { useState, useRef, useEffect } from 'react';
import { useSpaceRoom } from '../../contexts/SpaceRoomContext';
import { useCommand } from '../../contexts/CommandContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import { parseCommand, isNavigationCommand, isLayoutCommand, extractNavigationTarget } from '../../utils/commandParser';
import styles from './TerminalEmulator.module.css';

const TerminalEmulator = ({ userInfo }) => {
  const { spaces, selectedSpace, selectedRoom, rooms, loading, changeSpace, changeRoom } = useSpaceRoom();
  const { executeCommand, commandHistory } = useCommand();
  const { handleLayoutCommand, tabs } = useTabManager();
  const [isSpaceDropdownOpen, setIsSpaceDropdownOpen] = useState(false);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputMessages, setOutputMessages] = useState([]);
  const [isOutputVisible, setIsOutputVisible] = useState(true);
  const [isHoveringOutput, setIsHoveringOutput] = useState(false);
  const spaceDropdownRef = useRef(null);
  const roomDropdownRef = useRef(null);
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const autoCollapseTimerRef = useRef(null);

  // Maximum number of messages to keep
  const MAX_MESSAGES = 5;
  // Auto-collapse delay in milliseconds
  const AUTO_COLLAPSE_DELAY = 10000; // 10 seconds

  // Helper function to add output messages
  const addOutputMessage = (message, type = 'info') => {
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
    // Show output area and reset auto-collapse timer
    setIsOutputVisible(true);
    resetAutoCollapseTimer();
  };

  // Reset auto-collapse timer
  const resetAutoCollapseTimer = () => {
    // Clear existing timer
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }
    // Set new timer
    autoCollapseTimerRef.current = setTimeout(() => {
      // Only collapse if not hovering
      if (!isHoveringOutput && outputMessages.length > 0) {
        setIsOutputVisible(false);
      }
    }, AUTO_COLLAPSE_DELAY);
  };

  // Clear auto-collapse timer on unmount
  useEffect(() => {
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputMessages]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (spaceDropdownRef.current && !spaceDropdownRef.current.contains(event.target)) {
        setIsSpaceDropdownOpen(false);
      }
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(event.target)) {
        setIsRoomDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSpaceSelect = (space) => {
    changeSpace(space);
    setIsSpaceDropdownOpen(false);
  };

  const handleRoomSelect = (room) => {
    changeRoom(room);
    setIsRoomDropdownOpen(false);
  };

  // Supported visualization command types
  const SUPPORTED_COMMAND_TYPES = ['echo'];

  // Handle command execution
  const handleCommandExecution = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Clear input immediately
    setInputValue('');
    setHistoryIndex(-1);

    // Parse the command
    const command = parseCommand(trimmed);

    // Check if it's a layout command (tab/tile management)
    if (isLayoutCommand(command)) {
      const result = handleLayoutCommand(command);
      if (result && !result.success) {
        addOutputMessage(result.message || 'Layout command failed', 'error');
      } else if (result && result.message) {
        addOutputMessage(result.message, 'success');
      }
    }
    // Check if it's a navigation command
    else if (isNavigationCommand(command)) {
      handleNavigationCommand(command);
    }
    // Execute visualization/action command with CommandContext
    else {
      // Validate command type before executing
      if (!SUPPORTED_COMMAND_TYPES.includes(command.type)) {
        addOutputMessage(`Unknown command: ${trimmed}`, 'error');
        return;
      }
      executeCommand(command);
    }
  };

  // Handle navigation commands (cd, ls, pwd)
  const handleNavigationCommand = (command) => {
    switch (command.type) {
      case 'cd': {
        const { space: spaceName, room: roomName } = extractNavigationTarget(command);
        if (spaceName) {
          const space = spaces.find(s => s.name.toLowerCase() === spaceName.toLowerCase());
          if (space) {
            changeSpace(space);
            if (roomName) {
              const room = rooms.find(r => r.name.toLowerCase() === roomName.toLowerCase());
              if (room) {
                changeRoom(room);
                addOutputMessage(`Changed to ${space.name}/${room.name}`, 'success');
              } else {
                addOutputMessage(`Room not found: ${roomName}`, 'error');
              }
            } else {
              addOutputMessage(`Changed to space: ${space.name}`, 'success');
            }
          } else {
            addOutputMessage(`Space not found: ${spaceName}`, 'error');
          }
        }
        break;
      }
      case 'ls': {
        // List spaces and rooms
        const spacesList = spaces.map(s => s.name).join(', ');
        addOutputMessage(`Available spaces: ${spacesList}`, 'info');
        if (selectedSpace && rooms.length > 0) {
          const roomsList = rooms.map(r => `${r.name} (${r.nodeCount || 0} nodes)`).join(', ');
          addOutputMessage(`Available rooms in ${selectedSpace.name}: ${roomsList}`, 'info');
        }
        break;
      }
      case 'pwd': {
        // Print current working directory (space/room)
        const location = `${selectedSpace?.name}/${selectedRoom?.name || 'no-room'}`;
        addOutputMessage(`Current location: ${location}`, 'info');
        break;
      }
      default:
        break;
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

  if (loading) {
    return (
      <div className={styles.terminal}>
        <div className={styles.terminalContent}>
          <span className={styles.loadingText}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!selectedSpace) {
    return null;
  }

  return (
    <div className={styles.terminal} onClick={handleTerminalClick}>
      {/* Output Messages Area - Expands upward */}
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

      {/* Input Line */}
      <div className={styles.terminalContent}>
        {/* Shell Prompt with User and Path */}
        <div className={styles.shellPrompt}>
          <span className={styles.userHost}>{userInfo?.email || 'user@netdata'}</span>
          <div className={styles.pathSegments}>
            {/* Space Segment */}
            <div className={styles.pathSegmentWrapper} ref={spaceDropdownRef}>
              <button
                className={styles.pathSegment}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSpaceDropdownOpen(!isSpaceDropdownOpen);
                }}
                aria-expanded={isSpaceDropdownOpen}
                aria-haspopup="true"
                title="Click to change space"
              >
                {selectedSpace.name}
              </button>

              {isSpaceDropdownOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>Select Space</div>
                  <div className={styles.dropdownList}>
                    {spaces.map((space) => (
                      <button
                        key={space.id}
                        className={`${styles.dropdownItem} ${space.id === selectedSpace.id ? styles.dropdownItemActive : ''}`}
                        onClick={() => handleSpaceSelect(space)}
                      >
                        <div className={styles.dropdownItemContent}>
                          <span className={styles.dropdownItemName}>{space.name}</span>
                          {space.description && (
                            <span className={styles.dropdownItemDesc}>{space.description}</span>
                          )}
                        </div>
                        {space.id === selectedSpace.id && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M13.3333 4L6 11.3333L2.66666 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className={styles.pathSeparator}>/</span>

            {/* Room Segment */}
            <div className={styles.pathSegmentWrapper} ref={roomDropdownRef}>
              <button
                className={styles.pathSegment}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRoomDropdownOpen(!isRoomDropdownOpen);
                }}
                aria-expanded={isRoomDropdownOpen}
                aria-haspopup="true"
                disabled={rooms.length === 0}
                title="Click to change room"
              >
                {selectedRoom ? selectedRoom.name : 'select-room'}
              </button>

              {isRoomDropdownOpen && rooms.length > 0 && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownHeader}>Select Room</div>
                  <div className={styles.dropdownList}>
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        className={`${styles.dropdownItem} ${room.id === selectedRoom?.id ? styles.dropdownItemActive : ''}`}
                        onClick={() => handleRoomSelect(room)}
                      >
                        <div className={styles.dropdownItemContent}>
                          <span className={styles.dropdownItemName}>{room.name}</span>
                          {room.nodeCount !== undefined && (
                            <span className={styles.dropdownItemDesc}>{room.nodeCount} nodes</span>
                          )}
                        </div>
                        {room.id === selectedRoom?.id && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M13.3333 4L6 11.3333L2.66666 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Prompt Symbol */}
        <span className={styles.terminalPrompt}>%</span>

        {/* Terminal Input Wrapper with Custom Cursor */}
        <div className={styles.terminalInputWrapper}>
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
          <span className={styles.terminalInputDisplay} aria-hidden="true">
            {inputValue}
            <span className={styles.fatCursor}>█</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default TerminalEmulator;

