import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAssistantStore } from '../assistant';
import ChatMessageList from '../components/AssistantChat/ChatMessageList';
import { useChatManager } from '../contexts/ChatManagerContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import WorkspaceRenderer from '../workspace/WorkspaceRenderer';
import { getViewer } from '../workspace/viewers/registry';
import {
  getWorkspaceSnapshot,
  readWorkspaceFile,
} from '../workspace/client';
import styles from './Workspace.module.css';

const DEFAULT_WORKSPACE_ID = 'default';
const REFRESH_INTERVAL_MS = 5000;

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderFileContent = (file) => {
  if (!file) {
    return (
      <div className={styles.viewerEmpty}>
        Select a memory or artifact to inspect it.
      </div>
    );
  }

  if (file.error) {
    return (
      <div className={styles.viewerEmpty}>
        {file.error}
      </div>
    );
  }

  if (!file.content) {
    return (
      <div className={styles.viewerEmpty}>
        This file is empty.
      </div>
    );
  }

  const Viewer = getViewer(file.viewer);
  return (
    <Suspense fallback={<div className={styles.viewerEmpty}>Loading viewer...</div>}>
      <Viewer content={file.content} />
    </Suspense>
  );
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Never';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const formatNextRun = (seconds) => {
  if (seconds === null || seconds === undefined) return null;
  if (seconds <= 0) return 'Due now';
  if (seconds < 60) return `In ${seconds}s`;
  if (seconds < 3600) return `In ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `In ${Math.floor(seconds / 3600)}h`;
  return `In ${Math.floor(seconds / 86400)}d`;
};

const getLastRunInfo = (runs) => {
  if (!runs || runs.length === 0) return null;
  // runs are sorted newest first from backend
  const last = [...runs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  return last;
};

const RUN_STATUS_LABEL = {
  completed: 'Completed',
  completed_with_warnings: 'Warnings',
  failed: 'Failed',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
};

/**
 * Compact workspace header with breadcrumb navigation, status, and inline metrics.
 */
const WorkspaceHeader = ({ snapshot, workspaceId, isGenericWorkspace, messages, memories, artifacts, navigate }) => {
  const isAgent = snapshot?.kind === 'agent';
  const lastRun = getLastRunInfo(snapshot?.runs);
  const nextRunText = formatNextRun(snapshot?.nextRunInSeconds);

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.breadcrumb}
          onClick={() => navigate('/fleet')}
        >
          Fleet
        </button>
        <span className={styles.breadcrumbSeparator}>/</span>
        <h1 className={styles.title}>
          {snapshot?.title || (isGenericWorkspace ? 'Workspace' : workspaceId)}
        </h1>
        <span className={styles.kindBadge}>
          {isAgent ? 'Agent' : 'General'}
        </span>
        {isAgent && snapshot?.enabled === false && (
          <span className={styles.disabledBadge}>Disabled</span>
        )}
      </div>
      <div className={styles.headerRight}>
        {isAgent && lastRun && (
          <>
            <span className={`${styles.statusDot} ${styles[`status_${lastRun.status}`]}`} />
            <span className={styles.metric}>
              {RUN_STATUS_LABEL[lastRun.status] || lastRun.status}
            </span>
            <span className={styles.metricSeparator}>{'\u00B7'}</span>
            <span className={styles.metric}>
              Last: {formatRelativeTime(lastRun.completedAt || lastRun.startedAt)}
            </span>
            {nextRunText && (
              <>
                <span className={styles.metricSeparator}>{'\u00B7'}</span>
                <span className={styles.metric}>Next: {nextRunText}</span>
              </>
            )}
            <span className={styles.metricSeparator}>{'\u00B7'}</span>
          </>
        )}
        <span className={styles.metric}>{messages.length} msgs</span>
        <span className={styles.metricSeparator}>{'\u00B7'}</span>
        <span className={styles.metric}>{memories.length} memories</span>
        <span className={styles.metricSeparator}>{'\u00B7'}</span>
        <span className={styles.metric}>{artifacts.length} artifacts</span>
      </div>
    </div>
  );
};

/**
 * Chat-first layout for general workspaces — the conversation is the primary content.
 * Used when a general workspace has no workspace.json and no/few artifacts.
 */
const ChatFirstLayout = ({ sessionId, messages, toolCalls, streamingText, isStreaming }) => (
  <div className={styles.chatFirstContent}>
    {messages.length > 0 ? (
      <ChatMessageList
        messages={messages}
        toolCalls={toolCalls}
        streamingText={streamingText}
        isStreaming={isStreaming}
      />
    ) : (
      <div className={styles.chatFirstEmpty}>
        <div className={styles.chatFirstEmptyIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className={styles.chatFirstEmptyTitle}>Start a conversation</p>
        <p className={styles.chatFirstEmptyText}>
          Type a message in the terminal below to begin. This workspace can search the web, create documents, and use any attached MCP servers.
        </p>
      </div>
    )}
  </div>
);

/**
 * Fallback layout — two-panel view (sidebar + viewer) used when no workspace.json exists
 * but the workspace has artifacts/memories to browse.
 */
const WorkspaceFallback = ({
  memories,
  artifacts,
  selectedEntry,
  setSelectedEntry,
  activeEntry,
  fileState,
}) => (
  <div className={styles.fallbackContent}>
    <section className={styles.sidebarPane}>
      <div className={styles.sidebarSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Memories</h2>
          <span className={styles.sectionMeta}>{memories.length}</span>
        </div>
        <div className={styles.entryList}>
          {memories.length > 0 ? memories.map((entry) => {
            const key = `memory:${entry.path}`;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.entryCard} ${selectedEntry === key ? styles.entryCardActive : ''}`}
                onClick={() => setSelectedEntry(key)}
              >
                <div className={styles.entryTitleRow}>
                  <span className={styles.entryTitle}>{entry.name}</span>
                  <span className={styles.entryBadge}>memory</span>
                </div>
                <div className={styles.entryMeta}>{formatTimestamp(entry.updatedAt)}</div>
              </button>
            );
          }) : (
            <div className={styles.emptyStateCompact}>No stored memories yet.</div>
          )}
        </div>
      </div>

      <div className={styles.sidebarSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Artifacts</h2>
          <span className={styles.sectionMeta}>{artifacts.length}</span>
        </div>
        <div className={styles.entryList}>
          {artifacts.length > 0 ? artifacts.map((entry) => {
            const key = `artifact:${entry.path}`;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.entryCard} ${selectedEntry === key ? styles.entryCardActive : ''}`}
                onClick={() => setSelectedEntry(key)}
              >
                <div className={styles.entryTitleRow}>
                  <span className={styles.entryTitle}>{entry.name}</span>
                  <span className={styles.entryBadge}>{entry.viewer}</span>
                </div>
                <div className={styles.entryMeta}>{formatTimestamp(entry.updatedAt)}</div>
              </button>
            );
          }) : (
            <div className={styles.emptyStateCompact}>No artifacts yet.</div>
          )}
        </div>
      </div>
    </section>

    <section className={styles.viewerPane}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          {activeEntry ? activeEntry.name : 'Viewer'}
        </h2>
        <span className={styles.sectionMeta}>
          {activeEntry ? activeEntry.relativePath : 'No file selected'}
        </span>
      </div>
      <div className={styles.viewerBody}>
        {fileState.loading ? (
          <div className={styles.emptyState}>Loading file...</div>
        ) : renderFileContent(fileState)}
      </div>
    </section>
  </div>
);

const Workspace = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { toggleChat } = useChatManager();
  const workspaceId = params.workspaceId || DEFAULT_WORKSPACE_ID;
  const isGenericWorkspace = workspaceId === DEFAULT_WORKSPACE_ID;
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [fileState, setFileState] = useState({ loading: false, content: '', viewer: 'text', error: '' });
  const [workspaceDefinition, setWorkspaceDefinition] = useState(null);
  const sessionId = snapshot?.session?.id || null;
  const sessionState = useAssistantStore((state) =>
    sessionId ? state.sessions[sessionId] : null
  );

  // Register Ctrl/Cmd+Shift+C to toggle chat panel — only for agent workspaces.
  // General workspaces embed chat directly in the page.
  useKeyboardShortcuts({
    onToggleChat: () => {
      if (snapshot?.kind === 'agent') {
        toggleChat();
      }
    },
  });

  const loadSnapshot = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setIsLoading(true);
    }

    try {
      const nextSnapshot = await getWorkspaceSnapshot(workspaceId);
      setSnapshot(nextSnapshot);
      setError('');

      if (nextSnapshot?.session) {
        const store = useAssistantStore.getState();
        store.loadSessionData(
          nextSnapshot.session.id,
          nextSnapshot.session,
          nextSnapshot.messages || [],
          nextSnapshot.runs || [],
          nextSnapshot.toolCalls || []
        );
        // Bridge workspace session to the chat panel via synthetic tab key
        store.setActiveSessionForTab(`workspace:${workspaceId}`, nextSnapshot.session.id);
      }
    } catch (err) {
      setError(typeof err === 'string' ? err : (err?.message || 'Failed to load workspace.'));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Try to load .clai/workspace.json for designed workspace pages
  const loadWorkspaceDefinition = useCallback(async () => {
    try {
      const result = await readWorkspaceFile(workspaceId, '.clai/workspace.json');
      if (result?.content) {
        const parsed = JSON.parse(result.content);
        if (parsed && Array.isArray(parsed.sections)) {
          setWorkspaceDefinition(parsed);
          return;
        }
      }
    } catch {
      // No workspace.json — use fallback layout
    }
    setWorkspaceDefinition(null);
  }, [workspaceId]);

  useEffect(() => {
    loadSnapshot(true);
    loadWorkspaceDefinition();
    const interval = window.setInterval(() => loadSnapshot(false), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadSnapshot, loadWorkspaceDefinition]);

  const memories = snapshot?.memories || [];
  const artifacts = snapshot?.artifacts || [];
  const entryLookup = useMemo(() => {
    const map = new Map();
    memories.forEach((entry) => map.set(`memory:${entry.path}`, { ...entry, section: 'memory' }));
    artifacts.forEach((entry) => map.set(`artifact:${entry.path}`, { ...entry, section: 'artifact' }));
    return map;
  }, [artifacts, memories]);

  // Auto-select first entry in fallback mode
  useEffect(() => {
    if (workspaceDefinition) return; // Not needed in designed mode

    if (selectedEntry && entryLookup.has(selectedEntry)) {
      return;
    }

    const nextEntry = memories[0]
      ? `memory:${memories[0].path}`
      : artifacts[0]
        ? `artifact:${artifacts[0].path}`
        : null;

    setSelectedEntry(nextEntry);
  }, [artifacts, entryLookup, memories, selectedEntry, workspaceDefinition]);

  // Load file content for fallback viewer
  useEffect(() => {
    if (workspaceDefinition) return; // Not needed in designed mode

    let cancelled = false;

    if (!selectedEntry) {
      setFileState({ loading: false, content: '', viewer: 'text', error: '' });
      return undefined;
    }

    const entry = entryLookup.get(selectedEntry);
    if (!entry) {
      setFileState({ loading: false, content: '', viewer: 'text', error: '' });
      return undefined;
    }

    setFileState((current) => ({
      ...current,
      loading: true,
      error: '',
    }));

    const load = async () => {
      try {
        const result = await readWorkspaceFile(workspaceId, entry.path);
        if (cancelled) {
          return;
        }
        setFileState({
          loading: false,
          content: result.content || '',
          viewer: result.viewer || entry.viewer || 'text',
          error: '',
        });
      } catch (err) {
        if (cancelled) {
          return;
        }
        setFileState({
          loading: false,
          content: '',
          viewer: entry.viewer || 'text',
          error: typeof err === 'string' ? err : (err?.message || 'Failed to read file.'),
        });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [entryLookup, selectedEntry, workspaceId, workspaceDefinition]);

  const messages = sessionState?.messages || snapshot?.messages || [];
  const toolCalls = sessionState?.toolCalls || snapshot?.toolCalls || [];
  const streamingText = sessionState?.streamingTextByMessageId || {};
  const isStreaming = sessionState?.isStreaming || false;
  const activeEntry = selectedEntry ? entryLookup.get(selectedEntry) : null;
  const isAgent = snapshot?.kind === 'agent';
  const hasContent = memories.length > 0 || artifacts.length > 0;

  // Choose layout:
  // 1. workspace.json exists → WorkspaceRenderer (agent-designed page)
  // 2. Agent workspace without workspace.json → fallback file browser
  // 3. General workspace with files → fallback file browser
  // 4. General workspace without files → chat-first layout
  const useDesignedLayout = !!workspaceDefinition;
  const useChatFirst = !useDesignedLayout && !isAgent && !hasContent;

  return (
    <div className={styles.workspacePage}>
      <WorkspaceHeader
        snapshot={snapshot}
        workspaceId={workspaceId}
        isGenericWorkspace={isGenericWorkspace}
        messages={messages}
        memories={memories}
        artifacts={artifacts}
        navigate={navigate}
      />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {useDesignedLayout ? (
        <WorkspaceRenderer
          definition={workspaceDefinition}
          workspaceId={workspaceId}
          snapshot={snapshot}
        />
      ) : useChatFirst ? (
        <ChatFirstLayout
          sessionId={sessionId}
          messages={messages}
          toolCalls={toolCalls}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      ) : (
        <WorkspaceFallback
          memories={memories}
          artifacts={artifacts}
          selectedEntry={selectedEntry}
          setSelectedEntry={setSelectedEntry}
          activeEntry={activeEntry}
          fileState={fileState}
        />
      )}
    </div>
  );
};

export default Workspace;
