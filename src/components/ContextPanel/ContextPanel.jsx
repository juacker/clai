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

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTabManager } from '../../contexts/TabManagerContext';
import { useSharedSpaceRoomData } from '../../contexts/SharedSpaceRoomDataContext';
import { getSpaceBillingPlan } from '../../api/client';
import ContextBadge from './ContextBadge';
import ContextSelector from './ContextSelector';
import styles from './ContextPanel.module.css';

const ContextPanel = () => {
  const { getActiveTab, updateTabContext } = useTabManager();
  const { spaces, getRoomsForSpace, getSpaceById, getRoomById, getSpaceAIPermissions } = useSharedSpaceRoomData();

  // Selector state
  const [showSpaceSelector, setShowSpaceSelector] = useState(false);
  const [showRoomSelector, setShowRoomSelector] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availableCredits, setAvailableCredits] = useState(null);

  // Get the active tab's context
  const activeTab = getActiveTab();
  const tabContext = activeTab?.context;

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

  // Get AI permissions for the selected space
  const aiPermissions = useMemo(() => {
    if (!selectedSpace?.id) return { canRead: false, canCreate: false, canDelete: false };
    return getSpaceAIPermissions(selectedSpace.id);
  }, [selectedSpace?.id, getSpaceAIPermissions]);

  // Fetch billing plan function
  const fetchBillingPlan = useCallback(async () => {
    if (!selectedSpace?.id) {
      setAvailableCredits(null);
      return;
    }

    try {
      const token = localStorage.getItem('netdata_token');
      if (!token) return;

      const billingPlan = await getSpaceBillingPlan(token, selectedSpace.id);
      const microcredits = billingPlan?.ai?.total_available_microcredits || 0;
      const credits = (microcredits / 1000000).toFixed(2);
      setAvailableCredits(credits);
    } catch (error) {
      console.error('[ContextPanel] Failed to fetch billing plan:', error);
      setAvailableCredits(null);
    }
  }, [selectedSpace?.id]);

  // Fetch billing plan when space changes
  useEffect(() => {
    fetchBillingPlan();
  }, [fetchBillingPlan]);

  // Listen for credits refresh event (triggered after chat messages)
  useEffect(() => {
    const handleCreditsRefresh = () => {
      fetchBillingPlan();
    };

    window.addEventListener('credits-refresh', handleCreditsRefresh);
    return () => {
      window.removeEventListener('credits-refresh', handleCreditsRefresh);
    };
  }, [fetchBillingPlan]);

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

  // Load rooms when room selector is opened
  const handleRoomSelectorOpen = useCallback(async () => {
    if (!selectedSpace) return;

    setShowRoomSelector(true);
    const rooms = await getRoomsForSpace(selectedSpace.id);
    setAvailableRooms(rooms || []);
  }, [selectedSpace, getRoomsForSpace]);

  // Handle space selection
  const handleSpaceSelect = useCallback(async (space) => {
    if (!activeTab) return;

    console.log('[ContextPanel] Space selected:', space);

    // Fetch rooms for the new space
    const rooms = await getRoomsForSpace(space.id);

    // Find "All Nodes" room (case-insensitive) or fallback to first room
    const allNodesRoom = rooms.find(room =>
      room.name?.toLowerCase() === 'all nodes'
    ) || rooms[0];

    console.log('[ContextPanel] Auto-selecting room:', allNodesRoom);

    // Update the tab context with new space and room
    updateTabContext(activeTab.id, {
      spaceRoom: {
        selectedSpaceId: space.id,
        selectedRoomId: allNodesRoom?.id || null,
      },
    });
  }, [activeTab, getRoomsForSpace, updateTabContext]);

  // Handle room selection
  const handleRoomSelect = useCallback((room) => {
    if (!activeTab || !selectedSpace) return;

    console.log('[ContextPanel] Room selected:', room);

    // Update the tab context with new room
    updateTabContext(activeTab.id, {
      spaceRoom: {
        selectedSpaceId: selectedSpace.id,
        selectedRoomId: room.id,
      },
    });
  }, [activeTab, selectedSpace, updateTabContext]);

  // If no context, don't render the panel
  if (!hasAnyContext) {
    return null;
  }

  return (
    <>
      <div className={styles.contextPanel}>
        <div className={styles.contextContainer}>
          {/* Space Badge */}
          {selectedSpace && (
            <ContextBadge
              type="space"
              label="Space"
              value={selectedSpace.name}
              onClick={() => setShowSpaceSelector(true)}
              clickable={true}
            />
          )}

          {/* Room Badge */}
          {selectedRoom && (
            <ContextBadge
              type="room"
              label="Room"
              value={selectedRoom.name}
              onClick={handleRoomSelectorOpen}
              clickable={true}
            />
          )}

          {/* Credits Badge - only show if user has AI permissions */}
          {availableCredits !== null && selectedSpace?.slug && aiPermissions.canRead && (
            <ContextBadge
              type="credits"
              label="Credits"
              value={`${availableCredits} credits`}
              onClick={() => {
                const baseUrl = localStorage.getItem('netdata_base_url') || 'https://app.netdata.cloud';
                window.open(`${baseUrl}/spaces/${selectedSpace.slug}/settings/billing`, '_blank');
              }}
              clickable={true}
              variant={parseFloat(availableCredits) < 1.5 ? 'danger' : parseFloat(availableCredits) < 3 ? 'warning' : undefined}
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

      {/* Space Selector Modal - Rendered via Portal */}
      {showSpaceSelector && ReactDOM.createPortal(
        <ContextSelector
          items={spaces}
          selectedId={selectedSpace?.id}
          onSelect={handleSpaceSelect}
          onClose={() => setShowSpaceSelector(false)}
          type="space"
        />,
        document.body
      )}

      {/* Room Selector Modal - Rendered via Portal */}
      {showRoomSelector && ReactDOM.createPortal(
        <ContextSelector
          items={availableRooms}
          selectedId={selectedRoom?.id}
          onSelect={handleRoomSelect}
          onClose={() => setShowRoomSelector(false)}
          type="room"
        />,
        document.body
      )}
    </>
  );
};

export default ContextPanel;

