import React, { useMemo, useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTabManager } from '../../contexts/TabManagerContext';
import { getMcpServers } from '../../api/client';
import ContextBadge from './ContextBadge';
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
  const [showMcpSelector, setShowMcpSelector] = useState(false);
  const [availableMcpServers, setAvailableMcpServers] = useState([]);

  const activeTab = getActiveTab();
  const tabContext = activeTab?.context;
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

  const hasCustomContext = Object.keys(customContext).length > 0;
  const hasMcpContext = attachedMcpServerIds.length > 0 || configuredMcpServers.length > 0;

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

  if (!hasCustomContext && !hasMcpContext) {
    return null;
  }

  return (
    <>
      <div className={styles.contextPanel}>
        <div className={styles.contextContainer}>
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
                    ? `${server.name}: managed by automation`
                    : `${server.name}: ${isEnabled ? 'click to disable for this tab' : 'click to enable for this tab'}`
                }
              />
            );
          })}

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
