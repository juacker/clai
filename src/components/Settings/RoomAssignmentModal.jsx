/**
 * RoomAssignmentModal Component
 *
 * Modal for assigning an agent to a single optional space/room.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { getSpaces, getRooms, enableAgentForRoom, disableAgentForRoom } from '../../api/client';
import styles from './RoomAssignmentModal.module.css';

/**
 * Close icon
 */
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Loading spinner
 */
const LoadingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinner}>
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

/**
 * Chevron icon for expanding spaces
 */
const ChevronIcon = ({ isOpen }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/**
 * Check icon
 */
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * RoomAssignmentModal - Assign agent to spaces/rooms
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Callback when modal closes
 * @param {Object} props.agent - The agent to assign
 * @param {Function} props.onUpdate - Callback when assignments change
 */
const RoomAssignmentModal = ({ isOpen, onClose, agent, onUpdate }) => {
  const [spaces, setSpaces] = useState([]);
  const [roomsBySpace, setRoomsBySpace] = useState({});
  const [expandedSpaces, setExpandedSpaces] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Track local selection state (single optional assignment)
  const [selectedRoomKey, setSelectedRoomKey] = useState(null);

  // Initialize selected rooms when modal opens or agent changes
  useEffect(() => {
    if (isOpen && agent) {
      const assignment = (agent.enabledRooms || [])[0];
      setSelectedRoomKey(assignment ? `${assignment.space_id}:${assignment.room_id}` : null);
    }
  }, [isOpen, agent]);

  const originalRoomKey = (() => {
    const assignment = (agent?.enabledRooms || [])[0];
    return assignment ? `${assignment.space_id}:${assignment.room_id}` : null;
  })();

  // Check if there are pending changes
  const hasChanges = selectedRoomKey !== originalRoomKey;

  // Fetch spaces on mount
  useEffect(() => {
    if (isOpen) {
      fetchSpaces();
    }
  }, [isOpen]);

  const fetchSpaces = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getSpaces();
      // Sort spaces alphabetically by name
      const sortedSpaces = (result || []).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
      setSpaces(sortedSpaces);

      // Find spaces that have enabled rooms for this agent
      const enabledSpaceIds = new Set(
        (agent?.enabledRooms || []).map(r => r.space_id)
      );

      // Auto-expand spaces with enabled rooms, or first space if only one
      const spacesToExpand = {};
      const roomFetches = [];

      if (enabledSpaceIds.size > 0) {
        // Expand spaces that have enabled rooms
        for (const spaceId of enabledSpaceIds) {
          if (sortedSpaces.some(s => s.id === spaceId)) {
            spacesToExpand[spaceId] = true;
            roomFetches.push(fetchRoomsForSpace(spaceId));
          }
        }
      } else if (sortedSpaces.length === 1) {
        // No enabled rooms, but only one space - expand it
        spacesToExpand[sortedSpaces[0].id] = true;
        roomFetches.push(fetchRoomsForSpace(sortedSpaces[0].id));
      }

      if (Object.keys(spacesToExpand).length > 0) {
        setExpandedSpaces(spacesToExpand);
      }
    } catch (err) {
      console.error('[RoomAssignmentModal] Failed to fetch spaces:', err);
      setError('Failed to load spaces. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomsForSpace = async (spaceId) => {
    if (roomsBySpace[spaceId]) return; // Already fetched

    setLoadingRooms(prev => ({ ...prev, [spaceId]: true }));

    try {
      const result = await getRooms(spaceId);
      // Sort rooms: "All nodes" first, then alphabetically by name
      const sortedRooms = (result || []).sort((a, b) => {
        const aIsAllNodes = a.name.toLowerCase() === 'all nodes';
        const bIsAllNodes = b.name.toLowerCase() === 'all nodes';
        if (aIsAllNodes && !bIsAllNodes) return -1;
        if (!aIsAllNodes && bIsAllNodes) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setRoomsBySpace(prev => ({ ...prev, [spaceId]: sortedRooms }));
    } catch (err) {
      console.error('[RoomAssignmentModal] Failed to fetch rooms:', err);
    } finally {
      setLoadingRooms(prev => ({ ...prev, [spaceId]: false }));
    }
  };

  const toggleSpace = (spaceId) => {
    const isExpanded = !expandedSpaces[spaceId];
    setExpandedSpaces(prev => ({ ...prev, [spaceId]: isExpanded }));

    if (isExpanded && !roomsBySpace[spaceId]) {
      fetchRoomsForSpace(spaceId);
    }
  };

  // Toggle room selection locally (no API call yet)
  const handleRoomToggle = (spaceId, roomId) => {
    const roomKey = `${spaceId}:${roomId}`;
    setSelectedRoomKey(prev => (prev === roomKey ? null : roomKey));
  };

  // Save all changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      if (originalRoomKey && originalRoomKey !== selectedRoomKey) {
        const [spaceId, roomId] = originalRoomKey.split(':');
        await disableAgentForRoom(agent.id, spaceId, roomId);
      }

      if (selectedRoomKey && selectedRoomKey !== originalRoomKey) {
        const [spaceId, roomId] = selectedRoomKey.split(':');
        await enableAgentForRoom(agent.id, spaceId, roomId);
      }

      // Notify parent to refresh agent data
      if (onUpdate) {
        onUpdate();
      }

      onClose();
    } catch (err) {
      console.error('[RoomAssignmentModal] Failed to save assignments:', err);
      setError('Failed to save room assignments. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle close - warn if unsaved changes
  const handleClose = () => {
    if (hasChanges && !saving) {
      // Could add confirmation dialog here, but for now just close
    }
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && !saving) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, saving, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && !saving) {
      handleClose();
    }
  }, [saving, handleClose]);

  if (!isOpen) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Assign Rooms</h2>
            <p className={styles.subtitle}>
              Select one optional room scope for "{agent?.name}"
            </p>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          {loading ? (
            <div className={styles.loadingState}>
              <LoadingIcon />
              <span>Loading spaces...</span>
            </div>
          ) : spaces.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No spaces available.</p>
            </div>
          ) : (
            <div className={styles.spaceList}>
              {spaces.map((space) => {
                const isExpanded = expandedSpaces[space.id];
                const rooms = roomsBySpace[space.id] || [];
                const isLoadingRooms = loadingRooms[space.id];
                const assignedInSpace = rooms.filter(r =>
                  selectedRoomKey === `${space.id}:${r.id}`
                ).length;

                return (
                  <div key={space.id} className={styles.spaceItem}>
                    <button
                      className={styles.spaceHeader}
                      onClick={() => toggleSpace(space.id)}
                    >
                      <ChevronIcon isOpen={isExpanded} />
                      <span className={styles.spaceName}>{space.name}</span>
                      {assignedInSpace > 0 && (
                        <span className={styles.assignedBadge}>
                          {assignedInSpace} assigned
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className={styles.roomList}>
                        {isLoadingRooms ? (
                          <div className={styles.roomLoading}>
                            <LoadingIcon />
                            <span>Loading rooms...</span>
                          </div>
                        ) : rooms.length === 0 ? (
                          <div className={styles.noRooms}>
                            No rooms in this space
                          </div>
                        ) : (
                          rooms.map((room) => {
                            const roomKey = `${space.id}:${room.id}`;
                            const isSelected = selectedRoomKey === roomKey;

                            return (
                              <button
                                key={room.id}
                                className={`${styles.roomItem} ${isSelected ? styles.roomAssigned : ''}`}
                                onClick={() => handleRoomToggle(space.id, room.id)}
                                disabled={saving}
                              >
                                <span className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
                                  {isSelected && <CheckIcon />}
                                </span>
                                <span className={styles.roomName}>{room.name}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.assignedCount}>
            {selectedRoomKey === null
              ? 'No room scope selected. The agent will run without Netdata room context.'
              : '1 room selected'
            }
          </span>
          <div className={styles.footerActions}>
            <button
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? <><LoadingIcon /> Saving...</> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RoomAssignmentModal;
