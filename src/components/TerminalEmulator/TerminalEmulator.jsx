import React, { useState, useRef, useEffect } from 'react';
import { useSpaceRoom } from '../../contexts/SpaceRoomContext';
import styles from './TerminalEmulator.module.css';

const TerminalEmulator = ({ userInfo }) => {
  const { spaces, selectedSpace, selectedRoom, rooms, loading, changeSpace, changeRoom } = useSpaceRoom();
  const [isSpaceDropdownOpen, setIsSpaceDropdownOpen] = useState(false);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const spaceDropdownRef = useRef(null);
  const roomDropdownRef = useRef(null);

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

        {/* Terminal Prompt Symbol and Blinking Cursor */}
        <span className={styles.terminalPrompt}>%</span>
        <span className={styles.blinkingCursor}>_</span>
      </div>
    </div>
  );
};

export default TerminalEmulator;

