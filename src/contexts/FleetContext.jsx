import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFleetSnapshot } from '../fleet/client';

const FleetContext = createContext(null);
const FLEET_REFRESH_INTERVAL_MS = 5000;

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return context;
};

export const FleetProvider = ({ children }) => {
  const location = useLocation();
  const isFleetRoute = location.pathname === '/fleet';
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextSnapshot = await getFleetSnapshot();
      setSnapshot(nextSnapshot);
      setError(null);
      setSelectedAgentId((current) => {
        const hasCurrent = nextSnapshot?.agents?.some((agent) => agent.agentId === current);
        if (hasCurrent) {
          return current;
        }
        return nextSnapshot?.agents?.[0]?.agentId || null;
      });
      return nextSnapshot;
    } catch (err) {
      const message = typeof err === 'string' ? err : (err?.message || 'Failed to load fleet');
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFleetRoute) {
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      try {
        await refresh();
      } catch {
        if (cancelled) {
          return;
        }
      }
    };

    load();
    const interval = window.setInterval(load, FLEET_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isFleetRoute, refresh]);

  const selectedAgent = useMemo(
    () => snapshot?.agents?.find((agent) => agent.agentId === selectedAgentId) || null,
    [snapshot, selectedAgentId]
  );

  const value = useMemo(() => ({
    snapshot,
    summary: snapshot?.summary || null,
    agents: snapshot?.agents || [],
    selectedAgentId,
    selectedAgent,
    selectAgent: setSelectedAgentId,
    isLoading,
    error,
    refresh,
    isFleetRoute,
  }), [snapshot, selectedAgentId, selectedAgent, isLoading, error, refresh, isFleetRoute]);

  return (
    <FleetContext.Provider value={value}>
      {children}
    </FleetContext.Provider>
  );
};

export default FleetContext;
