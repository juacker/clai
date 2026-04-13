import React, { memo } from 'react';

const preStyle = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  fontSize: '12px',
  lineHeight: 1.6,
  color: 'var(--color-text-primary)',
};

const TextViewer = memo(({ content }) => (
  <pre style={preStyle}>{content}</pre>
));

TextViewer.displayName = 'TextViewer';

export default TextViewer;
