import React from 'react';
import styles from './UserAvatar.module.css';

const UserAvatar = ({ avatarUrl, userName, size = 'medium' }) => {
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className={`${styles.avatarContainer} ${styles[size]}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={userName || 'User avatar'}
          className={styles.avatarImage}
          onError={(e) => {
            // If image fails to load, hide it and show initials
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      ) : null}
      <div
        className={styles.avatarFallback}
        style={{ display: avatarUrl ? 'none' : 'flex' }}
      >
        {getInitials(userName)}
      </div>
    </div>
  );
};

export default UserAvatar;

