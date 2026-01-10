/**
 * TabBar Component
 *
 * Displays tabs horizontally and allows users to:
 * - Click to switch tabs
 * - Close tabs (with X button)
 * - Create new tabs (+ button)
 * - Scroll through tabs if they overflow
 */

import React, { useRef, useEffect, useState } from 'react';
import { useTabManager } from '../../contexts/TabManagerContext';
import styles from './TabBar.module.css';

const TabBar = () => {
  const {
    tabs,
    activeTabId,
    switchToTab,
    closeTab,
    createTab,
    renameTab,
  } = useTabManager();

  const tabBarRef = useRef(null);
  const activeTabRef = useRef(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTabId]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleTabClick = (tabId) => {
    if (editingTabId !== tabId) {
      switchToTab(tabId);
    }
  };

  const handleDoubleClick = (e, tabId, currentTitle) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditValue(currentTitle);
  };

  const handleEditSubmit = (tabId) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tabs.find(t => t.id === tabId)?.title) {
      renameTab(tabId, trimmed);
    }
    setEditingTabId(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e, tabId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit(tabId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
      setEditValue('');
    }
  };

  const handleEditBlur = (tabId) => {
    handleEditSubmit(tabId);
  };

  const handleTabClose = (e, tabId) => {
    e.stopPropagation(); // Prevent tab switch when closing
    closeTab(tabId);
  };

  const handleNewTab = () => {
    createTab();
  };

  return (
    <div className={styles.tabBar} ref={tabBarRef}>
      <div className={styles.tabList}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => handleTabClick(tab.id)}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.tabTitleInput}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, tab.id)}
                  onBlur={() => handleEditBlur(tab.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={styles.tabTitle}
                  onDoubleClick={(e) => handleDoubleClick(e, tab.id, tab.title)}
                >
                  {tab.title}
                </span>
              )}

              {/* Close button - only show if more than 1 tab */}
              {tabs.length > 1 && (
                <button
                  className={styles.tabCloseButton}
                  onClick={(e) => handleTabClose(e, tab.id)}
                  aria-label={`Close ${tab.title}`}
                  title="Close tab"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 3L3 9M3 3L9 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* New tab button - always visible */}
        <button
          className={styles.newTabButton}
          onClick={handleNewTab}
          aria-label="New tab"
          title="Create new tab"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 3V13M3 8H13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TabBar;

