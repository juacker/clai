import React, { useState, useRef, useEffect } from 'react';
import { useSpaceRoom } from '../../contexts/SpaceRoomContext';
import { useCommand } from '../../contexts/CommandContext';
import { parseCommand, isNavigationCommand, extractNavigationTarget } from '../../utils/commandParser';
import { COMMAND_TYPES } from '../../utils/commandTypes';
import styles from './TerminalEmulator.module.css';

const TerminalEmulator = ({ userInfo }) => {
  const { spaces, selectedSpace, selectedRoom, rooms, loading, changeSpace, changeRoom } = useSpaceRoom();
  const { executeCommand, commandHistory } = useCommand();
  const [isSpaceDropdownOpen, setIsSpaceDropdownOpen] = useState(false);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const spaceDropdownRef = useRef(null);
  const roomDropdownRef = useRef(null);
  const inputRef = useRef(null);

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

  // Handle command execution
  const handleCommandExecution = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Parse the command
    const command = parseCommand(trimmed);

    // Check if it's a navigation command
    if (isNavigationCommand(command)) {
      handleNavigationCommand(command);
    } else {
      // Execute visualization/action command with CommandContext
      executeCommand(command);
    }

    // Clear input
    setInputValue('');
    setHistoryIndex(-1);
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
              }
            }
          } else {
            console.warn(`Space not found: ${spaceName}`);
          }
        }
        break;
      }
      case 'ls': {
        // For now, just log the spaces/rooms
        // In the future, you could show a modal or output
        console.log('Available spaces:', spaces.map(s => s.name));
        if (selectedSpace) {
          console.log('Available rooms:', rooms.map(r => r.name));
        }
        break;
      }
      case 'pwd': {
        // Print current working directory (space/room)
        console.log(`Current location: ${selectedSpace?.name}/${selectedRoom?.name || 'no-room'}`);
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
    }
  };

  // Focus input on mount and when clicking terminal
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
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
    <div className={styles.terminal}>
      <div className={styles.terminalContent}>
        {/* Shell Prompt with User and Path */}
        <div className={styles.shellPrompt}>
          <span className={styles.userHost}>{userInfo?.email || 'user@netdata'}</span>
          <div className={styles.pathSegments}>
            {/* Space Segment */}
            <div className={styles.pathSegmentWrapper} ref={spaceDropdownRef}>
              <button
                className={styles.pathSegment}
                onClick={() => setIsSpaceDropdownOpen(!isSpaceDropdownOpen)}
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
                onClick={() => setIsRoomDropdownOpen(!isRoomDropdownOpen)}
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

