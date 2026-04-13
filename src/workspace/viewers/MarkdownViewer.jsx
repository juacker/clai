import React, { memo } from 'react';
import MarkdownMessage from '../../components/Chat/MarkdownMessage';

const stripFrontmatter = (text) => {
  if (!text) return text;
  const match = text.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (match) return text.slice(match[0].length).trimStart();
  return text;
};

const MarkdownViewer = memo(({ content }) => (
  <MarkdownMessage content={stripFrontmatter(content)} />
));

MarkdownViewer.displayName = 'MarkdownViewer';

export default MarkdownViewer;
