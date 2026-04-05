/**
 * TabContext
 *
 * Provides tab-specific capability context for MCP selection and custom key/value data.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const TabContext = createContext(null);

export function TabContextProvider({ children, tabId, initialContext, onContextChange }) {
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState(
    initialContext?.mcpServers?.attachedServerIds || initialContext?.mcpServers?.selectedServerIds || []
  );
  const [disabledMcpServerIds, setDisabledMcpServerIds] = useState(
    initialContext?.mcpServers?.disabledServerIds || []
  );
  const [customContext, setCustomContextState] = useState(
    initialContext?.customContext || {}
  );
  const [assistantConnectionId, setAssistantConnectionIdState] = useState(
    initialContext?.assistantConnectionId || null
  );

  useEffect(() => {
    setSelectedMcpServerIds(
      initialContext?.mcpServers?.attachedServerIds || initialContext?.mcpServers?.selectedServerIds || []
    );
    setDisabledMcpServerIds(initialContext?.mcpServers?.disabledServerIds || []);
    setAssistantConnectionIdState(initialContext?.assistantConnectionId || null);
    setCustomContextState(initialContext?.customContext || {});
  }, [tabId, initialContext]);

  const emitContextChange = useCallback((nextMcpServerIds, nextDisabledIds, nextAssistantConnectionId, nextCustomContext) => {
    if (!onContextChange) {
      return;
    }

    onContextChange({
      mcpServers: {
        attachedServerIds: nextMcpServerIds,
        disabledServerIds: nextDisabledIds,
      },
      assistantConnectionId: nextAssistantConnectionId,
      customContext: nextCustomContext,
    });
  }, [onContextChange]);

  const updateSelectedMcpServerIds = useCallback((value) => {
    setSelectedMcpServerIds((prev) => {
      const nextValue = typeof value === 'function' ? value(prev) : value;
      emitContextChange(nextValue, disabledMcpServerIds, assistantConnectionId, customContext);
      return nextValue;
    });
  }, [assistantConnectionId, customContext, disabledMcpServerIds, emitContextChange]);

  const updateDisabledMcpServerIds = useCallback((value) => {
    setDisabledMcpServerIds((prev) => {
      const nextValue = typeof value === 'function' ? value(prev) : value;
      emitContextChange(selectedMcpServerIds, nextValue, assistantConnectionId, customContext);
      return nextValue;
    });
  }, [assistantConnectionId, customContext, emitContextChange, selectedMcpServerIds]);

  const setAssistantConnectionId = useCallback((value) => {
    setAssistantConnectionIdState((prev) => {
      const nextValue = typeof value === 'function' ? value(prev) : value;
      emitContextChange(selectedMcpServerIds, disabledMcpServerIds, nextValue, customContext);
      return nextValue;
    });
  }, [customContext, disabledMcpServerIds, emitContextChange, selectedMcpServerIds]);

  const setCustomContext = useCallback((key, value) => {
    setCustomContextState((prev) => {
      const nextContext = { ...prev, [key]: value };
      emitContextChange(selectedMcpServerIds, disabledMcpServerIds, assistantConnectionId, nextContext);
      return nextContext;
    });
  }, [assistantConnectionId, disabledMcpServerIds, emitContextChange, selectedMcpServerIds]);

  const getCustomContext = useCallback((key) => {
    return customContext[key];
  }, [customContext]);

  const deleteCustomContext = useCallback((key) => {
    setCustomContextState((prev) => {
      const nextContext = { ...prev };
      delete nextContext[key];
      emitContextChange(selectedMcpServerIds, disabledMcpServerIds, assistantConnectionId, nextContext);
      return nextContext;
    });
  }, [assistantConnectionId, disabledMcpServerIds, emitContextChange, selectedMcpServerIds]);

  const clearCustomContext = useCallback(() => {
    setCustomContextState({});
    emitContextChange(selectedMcpServerIds, disabledMcpServerIds, assistantConnectionId, {});
  }, [assistantConnectionId, disabledMcpServerIds, emitContextChange, selectedMcpServerIds]);

  const value = {
    tabId,
    selectedMcpServerIds,
    setSelectedMcpServerIds: updateSelectedMcpServerIds,
    disabledMcpServerIds,
    setDisabledMcpServerIds: updateDisabledMcpServerIds,
    assistantConnectionId,
    setAssistantConnectionId,
    customContext,
    setCustomContext,
    getCustomContext,
    deleteCustomContext,
    clearCustomContext,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabContext() {
  const context = useContext(TabContext);

  if (!context) {
    throw new Error('useTabContext must be used within a TabContextProvider');
  }

  return context;
}

export default TabContext;
