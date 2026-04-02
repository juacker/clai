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
import { getMcpServers, getSpaceBillingPlan } from '../../api/client';
import { openExternal } from '../../utils/openExternal';
import ContextBadge from './ContextBadge';
import ContextSelector from './ContextSelector';
import McpServerAvatar from './McpServerAvatar';
import McpServerSelector from './McpServerSelector';
import styles from './ContextPanel.module.css';

const MCP_SERVERS_CHANGED_EVENT = 'mcp-servers-changed';
const getAttachedMcpServerIds = (context) =>
  context?.mcpServers?.attachedServerIds || context?.mcpServers?.selectedServerIds || [];
const getDisabledMcpServerIds = (context) => context?.mcpServers?.disabledServerIds || [];
const getEnabledMcpServerIds = (context) => {
  const disabled = new Set(getDisabledMcpServerIds(context));
  return getAttachedMcpServerIds(context).filter((id) => !disabled.has(id));
};

const ContextPanel = () => {
  const { getActiveTab, updateTabContext } = useTabManager();
  const { spaces, getRoomsForSpace, getSpaceById, getRoomById, getSpaceAIPermissions } = useSharedSpaceRoomData();

  // Selector state
  const [showSpaceSelector, setShowSpaceSelector] = useState(false);
  const [showRoomSelector, setShowRoomSelector] = useState(false);
  const [showMcpSelector, setShowMcpSelector] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availableCredits, setAvailableCredits] = useState(null);
  const [availableMcpServers, setAvailableMcpServers] = useState([]);

  // Get the active tab's context
  const activeTab = getActiveTab();
  const tabContext = activeTab?.context;

  // Find the actual space and room objects from the context IDs
  const selectedSpace = useMemo(() => {
    if (!tabContext?.spaceRoom?.selectedSpaceId) return null;
    return getSpaceById(tabContext.spaceRoom.selectedSpaceId);
  }, [tabContext?.spaceRoom?.selectedSpaceId, getSpaceById]);

  const selectedRoom = useMemo(() => {
    if (!tabContext?.spaceRoom?.selectedSpaceId || !tabContext?.spaceRoom?.selectedRoomId) return null;
    return getRoomById(tabContext.spaceRoom.selectedSpaceId, tabContext.spaceRoom.selectedRoomId);
  }, [tabContext?.spaceRoom?.selectedSpaceId, tabContext?.spaceRoom?.selectedRoomId, getRoomById]);

  const customContext = tabContext?.customContext || {};
  const attachedMcpServerIds = getAttachedMcpServerIds(tabContext);
  const disabledMcpServerIds = getDisabledMcpServerIds(tabContext);
  const enabledMcpServerIds = getEnabledMcpServerIds(tabContext);
  const isAgentManagedTab = Boolean(tabContext?.agent?.agentId);

  useEffect(() => {
    let cancelled = false;

    const loadMcpServers = async () => {
      try {
        const servers = await getMcpServers();
        if (!cancelled) {
          setAvailableMcpServers(servers || []);
        }
      } catch {
        if (!cancelled) {
          setAvailableMcpServers([]);
        }
      }
    };

    loadMcpServers();
    window.addEventListener(MCP_SERVERS_CHANGED_EVENT, loadMcpServers);

    return () => {
      cancelled = true;
      window.removeEventListener(MCP_SERVERS_CHANGED_EVENT, loadMcpServers);
    };
  }, []);

  const configuredMcpServers = useMemo(
    () => availableMcpServers.filter((server) => server.enabled),
    [availableMcpServers]
  );

  const attachedMcpServers = useMemo(
    () =>
      attachedMcpServerIds
        .map((id) => availableMcpServers.find((server) => server.id === id))
        .filter(Boolean),
    [attachedMcpServerIds, availableMcpServers]
  );

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
      // Token is handled by Rust backend
      const billingPlan = await getSpaceBillingPlan(selectedSpace.id);
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
  const hasMcpContext = attachedMcpServerIds.length > 0 || configuredMcpServers.length > 0;
  const hasAnyContext = hasSpaceRoom || hasCustomContext || hasMcpContext;

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

    // Fetch rooms for the new space
    const rooms = await getRoomsForSpace(space.id);

    // Find "All Nodes" room (case-insensitive) or fallback to first room
    const allNodesRoom = rooms.find(room =>
      room.name?.toLowerCase() === 'all nodes'
    ) || rooms[0];

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

    // Update the tab context with new room
    updateTabContext(activeTab.id, {
      spaceRoom: {
        selectedSpaceId: selectedSpace.id,
        selectedRoomId: room.id,
      },
    });
  }, [activeTab, selectedSpace, updateTabContext]);

  const handleAddMcpServer = useCallback((serverId) => {
    if (!activeTab || isAgentManagedTab) return;

    const nextAttachedIds = attachedMcpServerIds.includes(serverId)
      ? attachedMcpServerIds
      : [...attachedMcpServerIds, serverId];

    updateTabContext(activeTab.id, {
      mcpServers: {
        attachedServerIds: nextAttachedIds,
        disabledServerIds: disabledMcpServerIds.filter((id) => id !== serverId),
      },
    });
  }, [activeTab, attachedMcpServerIds, disabledMcpServerIds, isAgentManagedTab, updateTabContext]);

  const handleRemoveMcpServer = useCallback((serverId) => {
    if (!activeTab || isAgentManagedTab) return;

    updateTabContext(activeTab.id, {
      mcpServers: {
        attachedServerIds: attachedMcpServerIds.filter((id) => id !== serverId),
        disabledServerIds: disabledMcpServerIds.filter((id) => id !== serverId),
      },
    });
  }, [activeTab, attachedMcpServerIds, disabledMcpServerIds, isAgentManagedTab, updateTabContext]);

  const handleToggleMcpServer = useCallback((serverId) => {
    if (!activeTab || isAgentManagedTab || !attachedMcpServerIds.includes(serverId)) return;

    const isDisabled = disabledMcpServerIds.includes(serverId);
    const nextDisabledIds = isDisabled
      ? disabledMcpServerIds.filter((id) => id !== serverId)
      : [...disabledMcpServerIds, serverId];

    updateTabContext(activeTab.id, {
      mcpServers: {
        attachedServerIds: attachedMcpServerIds,
        disabledServerIds: nextDisabledIds,
      },
    });
  }, [activeTab, attachedMcpServerIds, disabledMcpServerIds, isAgentManagedTab, updateTabContext]);

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
                openExternal(`${baseUrl}/spaces/${selectedSpace.slug}/settings/billing`);
              }}
              clickable={true}
              variant={parseFloat(availableCredits) < 1.5 ? 'danger' : parseFloat(availableCredits) < 3 ? 'warning' : undefined}
            />
          )}

          {hasMcpContext && !isAgentManagedTab && (
            <ContextBadge
              type="mcp"
              label="Add MCP"
              value="Add MCP"
              variant="add"
              onClick={() => configuredMcpServers.length > 0 && setShowMcpSelector(true)}
              clickable={configuredMcpServers.length > 0}
            />
          )}

          {attachedMcpServers.map((server) => {
            const isDisabled = disabledMcpServerIds.includes(server.id);
            const isEnabled = enabledMcpServerIds.includes(server.id);
            return (
              <ContextBadge
                key={server.id}
                type="mcp"
                label={server.name}
                value={server.name}
                variant={isDisabled ? 'disabled' : undefined}
                iconElement={<McpServerAvatar server={server} disabled={isDisabled} />}
                onClick={() => handleToggleMcpServer(server.id)}
                clickable={!isAgentManagedTab}
                titleOverride={
                  isAgentManagedTab
                    ? `${server.name}: managed by scheduled agent`
                    : `${server.name}: ${isEnabled ? 'click to disable for this tab' : 'click to enable for this tab'}`
                }
              />
            );
          })}

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

      {showMcpSelector && ReactDOM.createPortal(
        <McpServerSelector
          servers={configuredMcpServers}
          attachedIds={attachedMcpServerIds}
          disabledIds={disabledMcpServerIds}
          onAdd={handleAddMcpServer}
          onRemove={handleRemoveMcpServer}
          onClose={() => setShowMcpSelector(false)}
        />,
        document.body
      )}
    </>
  );
};

export default ContextPanel;
