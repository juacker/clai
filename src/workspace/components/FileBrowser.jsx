import React, { memo, useCallback, useMemo, useState } from 'react';
import { useWorkspace } from '../WorkspaceContext';
import styles from './FileBrowser.module.css';

const VIEWER_ICON = {
  markdown: '\uD83D\uDCC4',
  json: '{ }',
  canvas: '\uD83C\uDFA8',
  dashboard: '\uD83D\uDCCA',
  text: '\uD83D\uDCC3',
};

const FOLDER_ICON = '\uD83D\uDCC1';
const FOLDER_OPEN_ICON = '\uD83D\uDCC2';

const formatTimestamp = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Build a tree structure from flat artifact entries.
 * Returns { folders: Map<name, subtree>, files: [] } for the given directory.
 */
const buildTree = (entries, rootPrefix) => {
  const tree = { folders: new Map(), files: [] };

  for (const entry of entries) {
    const rel = entry.relativePath || entry.path || '';

    // Strip the root prefix to get the local relative path
    let local = rel;
    if (rootPrefix) {
      const prefix = rootPrefix.endsWith('/') ? rootPrefix : `${rootPrefix}/`;
      if (!rel.startsWith(prefix) && rel !== rootPrefix) continue;
      local = rel.startsWith(prefix) ? rel.slice(prefix.length) : rel;
    }

    const parts = local.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length === 1) {
      // Direct file in current directory
      tree.files.push(entry);
    } else {
      // Nested — register in folder subtree
      const folderName = parts[0];
      if (!tree.folders.has(folderName)) {
        tree.folders.set(folderName, { folders: new Map(), files: [], totalFiles: 0 });
      }
      const folder = tree.folders.get(folderName);
      folder.totalFiles = (folder.totalFiles || 0) + 1;

      // Build deeper levels
      let current = folder;
      for (let i = 1; i < parts.length - 1; i++) {
        if (!current.folders.has(parts[i])) {
          current.folders.set(parts[i], { folders: new Map(), files: [], totalFiles: 0 });
        }
        current = current.folders.get(parts[i]);
        current.totalFiles = (current.totalFiles || 0) + 1;
      }
      current.files.push(entry);
    }
  }

  return tree;
};

/**
 * Get the tree node at a specific path.
 */
const getNodeAtPath = (tree, pathParts) => {
  let current = tree;
  for (const part of pathParts) {
    if (!current.folders.has(part)) return null;
    current = current.folders.get(part);
  }
  return current;
};

const FileBrowser = memo(({ root, showMemories = false, viewMode: initialViewMode = 'list' }) => {
  const { snapshot, viewFile } = useWorkspace();
  const [currentPath, setCurrentPath] = useState([]);
  const [viewMode, setViewMode] = useState(initialViewMode);

  const entries = useMemo(() => {
    let items = [...(snapshot?.artifacts || [])];
    if (showMemories) {
      items = [...(snapshot?.memories || []), ...items];
    }
    items.sort((a, b) => (a.relativePath || a.path || '').localeCompare(b.relativePath || b.path || ''));
    return items;
  }, [snapshot, showMemories]);

  const tree = useMemo(() => buildTree(entries, root || ''), [entries, root]);

  const currentNode = useMemo(
    () => getNodeAtPath(tree, currentPath) || tree,
    [tree, currentPath]
  );

  const navigateToFolder = useCallback((folderName) => {
    setCurrentPath((prev) => [...prev, folderName]);
  }, []);

  const navigateToIndex = useCallback((index) => {
    setCurrentPath((prev) => prev.slice(0, index));
  }, []);

  const handleFileClick = useCallback(
    (entry) => {
      viewFile(entry.path || entry.relativePath);
    },
    [viewFile]
  );

  // Build breadcrumb segments
  const breadcrumbs = useMemo(() => {
    const segments = [{ label: root || 'Files', index: 0 }];
    currentPath.forEach((part, i) => {
      segments.push({ label: part, index: i + 1 });
    });
    return segments;
  }, [currentPath, root]);

  const folders = useMemo(
    () =>
      [...currentNode.folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, node]) => ({ name, totalFiles: node.totalFiles || 0 })),
    [currentNode]
  );

  const files = useMemo(
    () =>
      [...currentNode.files].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      ),
    [currentNode]
  );

  return (
    <div className={styles.browser}>
      {/* Toolbar: breadcrumbs + view mode toggle */}
      <div className={styles.toolbar}>
        <div className={styles.breadcrumbs}>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className={styles.crumbWrapper}>
              {i > 0 && <span className={styles.crumbSeparator}>/</span>}
              <button
                type="button"
                className={`${styles.crumbBtn} ${i === breadcrumbs.length - 1 ? styles.crumbActive : ''}`}
                onClick={() => navigateToIndex(crumb.index)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="2" width="14" height="2" rx="0.5" />
              <rect x="1" y="7" width="14" height="2" rx="0.5" />
              <rect x="1" y="12" width="14" height="2" rx="0.5" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      {folders.length === 0 && files.length === 0 ? (
        <div className={styles.empty}>This folder is empty.</div>
      ) : viewMode === 'grid' ? (
        <div className={styles.gridView}>
          {folders.map((folder) => (
            <button
              key={`d:${folder.name}`}
              type="button"
              className={styles.gridItem}
              onClick={() => navigateToFolder(folder.name)}
            >
              <span className={styles.gridIcon}>{FOLDER_ICON}</span>
              <span className={styles.gridName}>{folder.name}</span>
              <span className={styles.gridMeta}>{folder.totalFiles} files</span>
            </button>
          ))}
          {files.map((file) => (
            <button
              key={`f:${file.path || file.relativePath}`}
              type="button"
              className={styles.gridItem}
              onClick={() => handleFileClick(file)}
            >
              <span className={styles.gridIcon}>
                {VIEWER_ICON[file.viewer] || '\uD83D\uDCC3'}
              </span>
              <span className={styles.gridName}>{file.name}</span>
              <span className={styles.gridMeta}>{formatSize(file.size)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.listView}>
          {folders.map((folder) => (
            <button
              key={`d:${folder.name}`}
              type="button"
              className={styles.listRow}
              onClick={() => navigateToFolder(folder.name)}
            >
              <span className={styles.listIcon}>{FOLDER_ICON}</span>
              <span className={styles.listName}>{folder.name}</span>
              <span className={styles.listMeta}>{folder.totalFiles} files</span>
              <span className={styles.listChevron}>{'\u203A'}</span>
            </button>
          ))}
          {files.map((file) => (
            <button
              key={`f:${file.path || file.relativePath}`}
              type="button"
              className={styles.listRow}
              onClick={() => handleFileClick(file)}
            >
              <span className={styles.listIcon}>
                {VIEWER_ICON[file.viewer] || '\uD83D\uDCC3'}
              </span>
              <span className={styles.listName}>{file.name}</span>
              <span className={styles.listSize}>{formatSize(file.size)}</span>
              <span className={styles.listTime}>{formatTimestamp(file.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

FileBrowser.displayName = 'FileBrowser';

export default FileBrowser;
