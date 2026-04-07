import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { readWorkspaceFile } from './client';

const WorkspaceContext = createContext(null);

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};

/**
 * Panel modes:
 * - null: panel closed
 * - { type: 'file', path } : viewing a file
 * - { type: 'folder', path } : browsing a folder
 *
 * The panel keeps a history stack so the user can navigate back
 * (e.g., from a file view back to the folder they came from).
 */
export const WorkspaceProvider = ({ workspaceId, snapshot, children }) => {
  const [panelState, setPanelState] = useState(null);
  const [viewerState, setViewerState] = useState({
    loading: false,
    content: '',
    viewer: 'text',
    error: '',
  });
  const historyRef = useRef([]);

  const loadFileContent = useCallback(
    async (path) => {
      setViewerState({ loading: true, content: '', viewer: 'text', error: '' });
      try {
        const result = await readWorkspaceFile(workspaceId, path);
        setViewerState({
          loading: false,
          content: result.content || '',
          viewer: result.viewer || 'text',
          error: '',
        });
      } catch (err) {
        setViewerState({
          loading: false,
          content: '',
          viewer: 'text',
          error: typeof err === 'string' ? err : err?.message || 'Failed to read file.',
        });
      }
    },
    [workspaceId]
  );

  const viewFile = useCallback(
    async (path) => {
      // Push current state to history before navigating
      setPanelState((prev) => {
        if (prev) {
          historyRef.current = [...historyRef.current, prev];
        }
        return { type: 'file', path };
      });
      await loadFileContent(path);
    },
    [loadFileContent]
  );

  const browseFolder = useCallback((path) => {
    // Push current state to history before navigating
    setPanelState((prev) => {
      if (prev) {
        historyRef.current = [...historyRef.current, prev];
      }
      return { type: 'folder', path };
    });
  }, []);

  const panelBack = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;

    const prev = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    setPanelState(prev);

    if (prev.type === 'file') {
      loadFileContent(prev.path);
    }
  }, [loadFileContent]);

  const closePanel = useCallback(() => {
    setPanelState(null);
    historyRef.current = [];
    setViewerState({ loading: false, content: '', viewer: 'text', error: '' });
  }, []);

  const viewedFile = panelState?.type === 'file' ? panelState.path : null;
  const browsedFolder = panelState?.type === 'folder' ? panelState.path : null;
  const isPanelOpen = panelState !== null;
  const canGoBack = historyRef.current.length > 0;

  const value = useMemo(
    () => ({
      workspaceId,
      snapshot,
      panelState,
      isPanelOpen,
      viewedFile,
      browsedFolder,
      viewerState,
      canGoBack,
      viewFile,
      browseFolder,
      panelBack,
      closePanel,
      closeViewer: closePanel,
    }),
    // canGoBack depends on historyRef.current.length which changes with panelState
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, snapshot, panelState, isPanelOpen, viewedFile, browsedFolder, viewerState, viewFile, browseFolder, panelBack, closePanel]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};
