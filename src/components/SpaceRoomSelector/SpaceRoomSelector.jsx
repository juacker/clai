import React, { useState, useRef, useEffect } from 'react';
import { useSpaceRoom } from '../../contexts/SpaceRoomContext';
import styles from './SpaceRoomSelector.module.css';

const SpaceRoomSelector = ({ userInfo }) => {
  const { spaces, selectedSpace, selectedRoom, rooms, loading, changeSpace, changeRoom } = useSpaceRoom();
  const [isSpaceDropdownOpen, setIsSpaceDropdownOpen] = useState(false);
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
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

  // Close drawer on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMobileDrawerOpen(false);
      }
    };

    if (isMobileDrawerOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isMobileDrawerOpen]);

  const handleSpaceSelect = (space) => {
    changeSpace(space);
    setIsSpaceDropdownOpen(false);
    setIsMobileDrawerOpen(false);
  };

  const handleRoomSelect = (room) => {
    changeRoom(room);
    setIsRoomDropdownOpen(false);
    setIsMobileDrawerOpen(false);
  };

  if (loading) {
    return (
      <div className={styles.selector}>
        <div className={styles.loading}>Loading spaces...</div>
      </div>
    );
  }

  if (!selectedSpace) {
    return null;
  }

  return (
    <>
      {/* Desktop Version - Shell-like Command Bar */}
      <div className={styles.desktopCommandBar}>
        <div className={styles.commandBarContent}>
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
                  <div className={styles.shellDropdown}>
                    <div className={styles.shellDropdownHeader}>Select Space</div>
                    <div className={styles.shellDropdownList}>
                      {spaces.map((space) => (
                        <button
                          key={space.id}
                          className={`${styles.shellDropdownItem} ${space.id === selectedSpace.id ? styles.shellDropdownItemActive : ''}`}
                          onClick={() => handleSpaceSelect(space)}
                        >
                          <div className={styles.shellDropdownItemContent}>
                            <span className={styles.shellDropdownItemName}>{space.name}</span>
                            {space.description && (
                              <span className={styles.shellDropdownItemDesc}>{space.description}</span>
                            )}
                          </div>
                          {space.id === selectedSpace.id && (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M13.3333 4L6 11.3333L2.66666 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
                  <div className={styles.shellDropdown}>
                    <div className={styles.shellDropdownHeader}>Select Room</div>
                    <div className={styles.shellDropdownList}>
                      {rooms.map((room) => (
                        <button
                          key={room.id}
                          className={`${styles.shellDropdownItem} ${room.id === selectedRoom?.id ? styles.shellDropdownItemActive : ''}`}
                          onClick={() => handleRoomSelect(room)}
                        >
                          <div className={styles.shellDropdownItemContent}>
                            <span className={styles.shellDropdownItemName}>{room.name}</span>
                            {room.nodeCount !== undefined && (
                              <span className={styles.shellDropdownItemDesc}>{room.nodeCount} nodes</span>
                            )}
                          </div>
                          {room.id === selectedRoom?.id && (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M13.3333 4L6 11.3333L2.66666 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

      {/* Mobile Version - Compact Button with Drawer */}
      <button
        className={styles.mobileButton}
        onClick={() => setIsMobileDrawerOpen(true)}
        aria-label="Select space and room"
      >
        <div className={styles.mobileButtonContent}>
          <div className={styles.mobileButtonText}>
            <span className={styles.mobileButtonSpace}>{selectedSpace.name}</span>
            {selectedRoom && (
              <>
                <span className={styles.mobileButtonSeparator}>/</span>
                <span className={styles.mobileButtonRoom}>{selectedRoom.name}</span>
              </>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsMobileDrawerOpen(false)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Select Space & Room</h2>
              <button
                className={styles.drawerClose}
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Close"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <div className={styles.drawerContent}>
              {/* Spaces Section */}
              <div className={styles.drawerSection}>
                <h3 className={styles.drawerSectionTitle}>Space</h3>
                <div className={styles.drawerList}>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      className={`${styles.drawerItem} ${space.id === selectedSpace.id ? styles.drawerItemActive : ''}`}
                      onClick={() => handleSpaceSelect(space)}
                    >
                      <div className={styles.drawerItemContent}>
                        <span className={styles.drawerItemName}>{space.name}</span>
                        {space.description && (
                          <span className={styles.drawerItemDesc}>{space.description}</span>
                        )}
                      </div>
                      {space.id === selectedSpace.id && (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M16.6667 5L7.5 14.1667L3.33334 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rooms Section */}
              {rooms.length > 0 && (
                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>Room</h3>
                  <div className={styles.drawerList}>
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        className={`${styles.drawerItem} ${room.id === selectedRoom?.id ? styles.drawerItemActive : ''}`}
                        onClick={() => handleRoomSelect(room)}
                      >
                        <div className={styles.drawerItemContent}>
                          <span className={styles.drawerItemName}>{room.name}</span>
                          {room.nodeCount !== undefined && (
                            <span className={styles.drawerItemDesc}>{room.nodeCount} nodes</span>
                          )}
                        </div>
                        {room.id === selectedRoom?.id && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M16.6667 5L7.5 14.1667L3.33334 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
      )}
    </>
  );
};

export default SpaceRoomSelector;

