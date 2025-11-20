import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './UserAvatar.module.css';

const UserAvatar = ({ avatarUrl, userName, size = 'medium', showMenu = false }) => {
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

  const handleLogout = () => {
    // Clear all stored data from localStorage
    localStorage.removeItem('netdata_token');
    localStorage.removeItem('netdata_base_url');
    // Clear any other stored data if needed
    localStorage.clear();

    // Redirect to login page
    navigate('/login');
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
          <button className={styles.menuItem} onClick={handleLogout}>
            <span className={styles.menuIcon}>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;

