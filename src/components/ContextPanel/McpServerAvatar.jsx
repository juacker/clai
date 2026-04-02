import React, { useMemo, useState } from 'react';
import styles from './McpServerAvatar.module.css';

const getOriginFaviconUrl = (server) => {
  if (server?.transport?.type !== 'http' || !server?.transport?.url) {
    return null;
  }

  try {
    const url = new URL(server.transport.url);
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
};

const getFallbackLabel = (server) => {
  const source = server?.name || server?.transport?.command || 'M';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const McpServerAvatar = ({ server, disabled = false }) => {
  const faviconUrl = useMemo(() => getOriginFaviconUrl(server), [server]);
  const fallbackLabel = useMemo(() => getFallbackLabel(server), [server]);
  const [imageFailed, setImageFailed] = useState(false);

  if (faviconUrl && !imageFailed) {
    return (
      <span className={styles.avatar}>
        <img
          src={faviconUrl}
          alt=""
          className={styles.image}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${styles.avatar} ${disabled ? styles.fallbackDisabled : ''}`}>
      {fallbackLabel}
    </span>
  );
};

export default McpServerAvatar;
