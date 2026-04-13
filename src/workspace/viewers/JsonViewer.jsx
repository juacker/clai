import React, { memo, useMemo } from 'react';
import MarkdownMessage from '../../components/Chat/MarkdownMessage';

const JsonViewer = memo(({ content }) => {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [content]);

  return <MarkdownMessage content={`\`\`\`json\n${formatted}\n\`\`\``} />;
});

JsonViewer.displayName = 'JsonViewer';

export default JsonViewer;
