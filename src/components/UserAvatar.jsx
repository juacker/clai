import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearToken } from '../api/client';
import styles from './UserAvatar.module.css';

const UserAvatar = ({ avatarUrl, userName, size = 'medium', showMenu = false, onSettingsClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    // Clear token from secure storage (OS keychain)
    await clearToken();
    // Clear other stored data from localStorage
    localStorage.removeItem('netdata_base_url');
    localStorage.clear();

    // Redirect to login page
    navigate('/login');
  };

  const handleSettingsClick = () => {
    setIsMenuOpen(false);
    if (onSettingsClick) {
      onSettingsClick();
    }
  };

  const toggleMenu = (e) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <div className={styles.avatarWrapper} ref={menuRef}>
      <div
        className={`${styles.avatarContainer} ${styles[size]} ${showMenu ? styles.clickable : ''}`}
        onClick={showMenu ? toggleMenu : undefined}
      >
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

      {showMenu && isMenuOpen && (
        <div className={styles.dropdownMenu}>
          <div className={styles.menuHeader}>
            <div className={styles.menuUserName}>{userName}</div>
          </div>
          <div className={styles.menuDivider} />
          <button className={styles.menuItem} onClick={handleSettingsClick}>
            <svg className={styles.menuIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
            </svg>
            <span>Settings</span>
          </button>
          <button className={styles.menuItem} onClick={handleLogout}>
            <svg className={styles.menuIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;

