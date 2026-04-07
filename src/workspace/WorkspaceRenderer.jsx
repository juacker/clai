import React, { memo, useCallback, useMemo, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import MarkdownMessage from '../components/Chat/MarkdownMessage';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { downloadWorkspaceFile } from './client';
import FileBrowser from './components/FileBrowser';
import { COMPONENT_REGISTRY, VALID_LAYOUTS } from './components/registry';
import styles from './WorkspaceRenderer.module.css';

/**
 * Strip YAML frontmatter from markdown content for the viewer.
 */
const stripFrontmatter = (text) => {
  if (!text) return text;
  const match = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (match) return text.slice(match[0].length).trimStart();
  return text;
};

const codeBlock = (language, content) => `\`\`\`${language}\n${content}\n\`\`\``;

/**
 * Render a single section from the workspace definition.
 */
const Section = memo(({ section }) => {
  const Component = COMPONENT_REGISTRY[section.component];

  if (!Component) {
    return null;
  }

  return (
    <div className={styles.section}>
      {section.title && (
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
        </div>
      )}
      <div className={styles.sectionBody}>
        <Component {...(section.props || {})} />
      </div>
    </div>
  );
});

Section.displayName = 'Section';

/**
 * File content renderer for the viewer panel.
 */
const FileContent = memo(({ viewerState }) => {
  if (viewerState.loading) {
    return <div className={styles.viewerEmpty}>Loading file...</div>;
  }
  if (viewerState.error) {
    return <div className={styles.viewerError}>{viewerState.error}</div>;
  }
  if (!viewerState.content) {
    return <div className={styles.viewerEmpty}>This file is empty.</div>;
  }
  if (viewerState.viewer === 'markdown') {
    return <MarkdownMessage content={stripFrontmatter(viewerState.content)} />;
  }
  if (viewerState.viewer === 'json' || viewerState.viewer === 'canvas') {
    let formatted = viewerState.content;
    try {
      formatted = JSON.stringify(JSON.parse(viewerState.content), null, 2);
    } catch {
      // keep raw
    }
    return <MarkdownMessage content={codeBlock('json', formatted)} />;
  }
  return (
    <pre className={styles.viewerPre}>{viewerState.content}</pre>
  );
});

FileContent.displayName = 'FileContent';

/**
 * Slide-out panel.
 *
 * Supports two modes:
 * - File viewer: renders file content with download button
 * - Folder browser: renders a navigable FileBrowser for a specific folder
 *
 * Opens from the right side (~50% width). Clicking the backdrop closes it.
 */
const SlideOutPanel = memo(() => {
  const {
    workspaceId,
    isPanelOpen,
    panelState,
    viewedFile,
    browsedFolder,
    viewerState,
    canGoBack,
    panelBack,
    closePanel,
  } = useWorkspace();
  const [downloadStatus, setDownloadStatus] = useState('');

  const handleDownload = useCallback(async () => {
    if (!viewedFile) return;
    const fileName = viewedFile.split('/').pop() || 'file.txt';

    try {
      const destination = await save({
        defaultPath: fileName,
        title: 'Save file as',
      });
      if (!destination) return;

      setDownloadStatus('downloading');
      await downloadWorkspaceFile(workspaceId, viewedFile, destination);
      setDownloadStatus('done');
      setTimeout(() => setDownloadStatus(''), 2500);
    } catch (err) {
      console.error('[Workspace] Download failed:', err);
      setDownloadStatus('');
    }
  }, [workspaceId, viewedFile]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        closePanel();
      }
    },
    [closePanel]
  );

  const isFile = panelState?.type === 'file';
  const isFolder = panelState?.type === 'folder';

  // Title and path for the header
  let title = '';
  let subtitle = '';
  if (isFile && viewedFile) {
    title = viewedFile.split('/').pop() || '';
    subtitle = viewedFile;
  } else if (isFolder && browsedFolder) {
    title = browsedFolder.split('/').filter(Boolean).pop() || 'Files';
    subtitle = browsedFolder;
  }

  return (
    <>
      <div
        className={`${styles.viewerBackdrop} ${isPanelOpen ? styles.viewerBackdropOpen : ''}`}
        onClick={handleBackdropClick}
        role="presentation"
      />
      <div className={`${styles.viewerPanel} ${isPanelOpen ? styles.viewerPanelOpen : ''}`}>
        <div className={styles.viewerHeader}>
          <div className={styles.viewerTitleBlock}>
            {canGoBack && (
              <button
                type="button"
                className={styles.viewerBackBtn}
                onClick={panelBack}
                title="Back"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3L5 8l5 5" />
                </svg>
              </button>
            )}
            <h3 className={styles.viewerTitle}>{title}</h3>
            <span className={styles.viewerPath}>{subtitle}</span>
          </div>
          <div className={styles.viewerActions}>
            {isFile && (
              <button
                type="button"
                className={styles.viewerActionBtn}
                onClick={handleDownload}
                title={downloadStatus === 'done' ? 'Saved to Downloads' : 'Save to Downloads'}
                disabled={!viewerState.content || downloadStatus === 'downloading'}
              >
                {downloadStatus === 'done' ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8m0 0L5 7m3 3l3-3" />
                    <path d="M3 12h10" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              className={styles.viewerActionBtn}
              onClick={closePanel}
              title="Close"
            >
              {'\u2715'}
            </button>
          </div>
        </div>
        <div className={styles.viewerBody}>
          {isFile && <FileContent viewerState={viewerState} />}
          {isFolder && browsedFolder && (
            <FileBrowser root={browsedFolder} viewMode="list" />
          )}
        </div>
      </div>
    </>
  );
});

SlideOutPanel.displayName = 'SlideOutPanel';

/**
 * WorkspaceRenderer — renders a workspace page from a workspace.json definition.
 *
 * Supports layout modes:
 * - single-column: Full-width stacked sections
 * - two-column: Main content (wider) + sidebar, sections use column: "main" | "sidebar"
 * - two-column-equal: 50/50 split
 * - dashboard: Auto-grid of equal-width cards
 */
const WorkspaceRenderer = memo(({ definition, workspaceId, snapshot }) => {
  const layout = VALID_LAYOUTS.includes(definition?.layout)
    ? definition.layout
    : 'single-column';
  const sections = definition?.sections || [];

  const { mainSections, sidebarSections } = useMemo(() => {
    if (!layout.startsWith('two-column')) {
      return { mainSections: sections, sidebarSections: [] };
    }

    const main = [];
    const sidebar = [];
    sections.forEach((s) => {
      if (s.column === 'sidebar') {
        sidebar.push(s);
      } else {
        main.push(s);
      }
    });
    return { mainSections: main, sidebarSections: sidebar };
  }, [sections, layout]);

  return (
    <WorkspaceProvider workspaceId={workspaceId} snapshot={snapshot}>
      <div className={styles.renderer}>
        {layout.startsWith('two-column') ? (
          <div className={`${styles.layoutGrid} ${styles[layout.replace(/-/g, '_')]}`}>
            <div className={styles.mainColumn}>
              {mainSections.map((section, i) => (
                <Section key={`main-${i}`} section={section} />
              ))}
            </div>
            <div className={styles.sidebarColumn}>
              {sidebarSections.map((section, i) => (
                <Section key={`side-${i}`} section={section} />
              ))}
            </div>
          </div>
        ) : (
          <div className={`${styles.layoutGrid} ${styles[layout.replace(/-/g, '_')]}`}>
            {sections.map((section, i) => (
              <Section key={i} section={section} />
            ))}
          </div>
        )}

        <SlideOutPanel />
      </div>
    </WorkspaceProvider>
  );
});

WorkspaceRenderer.displayName = 'WorkspaceRenderer';

export default WorkspaceRenderer;
