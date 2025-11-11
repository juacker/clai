import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownMessage.module.css';

/**
 * MarkdownMessage Component
 *
 * Renders markdown text with support for:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists, etc.)
 * - Code blocks with syntax highlighting
 * - Inline code
 * - Links, bold, italic, lists
 * - Streaming cursor for real-time text
 *
 * Props:
 * - content: The markdown text to render
 * - isStreaming: Whether the message is currently being streamed
 */
const MarkdownMessage = ({ content, isStreaming = false }) => {
  return (
    <div className={styles.markdownContainer}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Customize rendering of specific elements
          code: ({ node, inline, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return inline ? (
              <code className={styles.inlineCode} {...props}>
                {children}
              </code>
            ) : (
              <pre className={styles.codeBlock}>
                <code className={match ? styles[`language-${match[1]}`] : ''} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          p: ({ children }) => <p className={styles.paragraph}>{children}</p>,
          h1: ({ children }) => <h1 className={styles.heading1}>{children}</h1>,
          h2: ({ children }) => <h2 className={styles.heading2}>{children}</h2>,
          h3: ({ children }) => <h3 className={styles.heading3}>{children}</h3>,
          h4: ({ children }) => <h4 className={styles.heading4}>{children}</h4>,
          h5: ({ children }) => <h5 className={styles.heading5}>{children}</h5>,
          h6: ({ children }) => <h6 className={styles.heading6}>{children}</h6>,
          ul: ({ children }) => <ul className={styles.unorderedList}>{children}</ul>,
          ol: ({ children }) => <ol className={styles.orderedList}>{children}</ol>,
          li: ({ children }) => <li className={styles.listItem}>{children}</li>,
          blockquote: ({ children }) => <blockquote className={styles.blockquote}>{children}</blockquote>,
          a: ({ href, children }) => (
            <a href={href} className={styles.link} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className={styles.tableHead}>{children}</thead>,
          tbody: ({ children }) => <tbody className={styles.tableBody}>{children}</tbody>,
          tr: ({ children }) => <tr className={styles.tableRow}>{children}</tr>,
          th: ({ children }) => <th className={styles.tableHeader}>{children}</th>,
          td: ({ children }) => <td className={styles.tableCell}>{children}</td>,
          strong: ({ children }) => <strong className={styles.bold}>{children}</strong>,
          em: ({ children }) => <em className={styles.italic}>{children}</em>,
          del: ({ children }) => <del className={styles.strikethrough}>{children}</del>,
          hr: () => <hr className={styles.horizontalRule} />,
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className={styles.streamingCursor}>▊</span>}
    </div>
  );
};

export default MarkdownMessage;

