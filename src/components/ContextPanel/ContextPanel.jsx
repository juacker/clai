/**
 * ContextPanel Component
 *
 * Displays the current tab's context information as a clean panel with badges.
 * Shows space, room, and custom key-value context pairs.
 * Positioned below the TabBar to provide clear context visibility.
 *
 * Note: This component reads from TabManagerContext (not TabContext) because it's
 * rendered at the TabView level, outside of the TabContextProvider.
 */

import React, { useMemo } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useSharedSpaceRoomData } from '../../contexts/SharedSpaceRoomDataContext';
import ContextBadge from './ContextBadge';
import styles from './ContextPanel.module.css';

const ContextPanel = () => {
  const { getActiveTab } = useTabManager();
  const { getSpaceById, getRoomById } = useSharedSpaceRoomData();

  // Get the active tab's context
  const activeTab = getActiveTab();
  const tabContext = activeTab?.context;

  // DEBUG: Log the tab context data
  console.log('[ContextPanel] Debug:', {
    activeTab,
    tabContext,
    selectedSpaceId: tabContext?.spaceRoom?.selectedSpaceId,
    selectedRoomId: tabContext?.spaceRoom?.selectedRoomId,
  });

  // Find the actual space and room objects from the context IDs
  const selectedSpace = useMemo(() => {
    if (!tabContext?.spaceRoom?.selectedSpaceId) return null;
    const space = getSpaceById(tabContext.spaceRoom.selectedSpaceId);
    console.log('[ContextPanel] Selected space:', space);
    return space;
  }, [tabContext?.spaceRoom?.selectedSpaceId, getSpaceById]);

  const selectedRoom = useMemo(() => {
    if (!tabContext?.spaceRoom?.selectedSpaceId || !tabContext?.spaceRoom?.selectedRoomId) return null;
    const room = getRoomById(tabContext.spaceRoom.selectedSpaceId, tabContext.spaceRoom.selectedRoomId);
    console.log('[ContextPanel] Selected room:', room);
    return room;
  }, [tabContext?.spaceRoom?.selectedSpaceId, tabContext?.spaceRoom?.selectedRoomId, getRoomById]);

  const customContext = tabContext?.customContext || {};

  // Check if there's any context to display
  const hasSpaceRoom = selectedSpace || selectedRoom;
  const hasCustomContext = Object.keys(customContext).length > 0;
  const hasAnyContext = hasSpaceRoom || hasCustomContext;

  console.log('[ContextPanel] Has context:', {
    hasSpaceRoom,
    hasCustomContext,
    hasAnyContext,
    selectedSpace,
    selectedRoom,
  });

  // If no context, don't render the panel
  if (!hasAnyContext) {
    return null;
  }

  return (
    <div className={styles.contextPanel}>
      <div className={styles.contextContainer}>
        {/* Space Badge */}
        {selectedSpace && (
          <ContextBadge
            type="space"
            label="Space"
            value={selectedSpace.name}
          />
        )}

        {/* Room Badge */}
        {selectedRoom && (
          <ContextBadge
            type="room"
            label="Room"
            value={selectedRoom.name}
          />
        )}

        {/* Custom Context Badges */}
        {hasCustomContext &&
          Object.entries(customContext).map(([key, value]) => (
            <ContextBadge
              key={key}
              type="custom"
              label={key}
              value={String(value)}
            />
          ))}
      </div>
    </div>
  );
};

export default ContextPanel;

