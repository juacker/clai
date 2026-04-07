import React, { memo, useEffect, useState } from 'react';
import MarkdownMessage from '../../components/Chat/MarkdownMessage';
import { useWorkspace } from '../WorkspaceContext';
import styles from './WorkspaceMarkdown.module.css';

/**
 * Strip YAML frontmatter (--- ... ---) from markdown content.
 */
const stripFrontmatter = (text) => {
  if (!text) return text;
  const match = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (match) return text.slice(match[0].length).trimStart();
  return text;
};

const WorkspaceMarkdown = memo(({ content, file }) => {
  const { workspaceId, viewFile } = useWorkspace();
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setFileContent(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      try {
        // Use the viewFile's underlying read mechanism
        const { readWorkspaceFile } = await import('../client');
        const result = await readWorkspaceFile(workspaceId, file);
        if (!cancelled) {
          setFileContent(result.content || '');
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(typeof err === 'string' ? err : err?.message || 'Failed to load file.');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [file, workspaceId, viewFile]);

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  const raw = file ? fileContent : content;
  if (!raw) {
    return <div className={styles.empty}>No content.</div>;
  }

  const cleaned = stripFrontmatter(raw);

  return (
    <div className={styles.container}>
      <MarkdownMessage content={cleaned} />
    </div>
  );
});

WorkspaceMarkdown.displayName = 'WorkspaceMarkdown';

export default WorkspaceMarkdown;
