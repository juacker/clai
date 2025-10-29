import React, { useState, useRef, useEffect, useContext } from 'react';
import { useCommand } from '../../contexts/CommandContext';
import { useTabManager } from '../../contexts/TabManagerContext';
import TabContext from '../../contexts/TabContext';
import { parseCommand, isLayoutCommand } from '../../utils/commandParser';
import { handleContextCommand, isContextCommand } from '../../utils/contextCommandHandler';
import styles from './TerminalEmulator.module.css';

const TerminalEmulator = ({ userInfo }) => {
  const { executeCommand, commandHistory } = useCommand();
  const { handleLayoutCommand } = useTabManager();
  // Try to get tab context, but don't throw error if not available
  const tabContext = useContext(TabContext);
  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputMessages, setOutputMessages] = useState([]);
  const [isOutputVisible, setIsOutputVisible] = useState(true);
  const [isHoveringOutput, setIsHoveringOutput] = useState(false);
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const autoCollapseTimerRef = useRef(null);

  // Maximum number of messages to keep
  const MAX_MESSAGES = 5;
  // Auto-collapse delay in milliseconds
  const AUTO_COLLAPSE_DELAY = 10000; // 10 seconds

  // Helper function to add output messages
  const addOutputMessage = (message, type = 'info') => {
    const newMessage = {
      id: Date.now() + Math.random(),
      text: message,
      type, // 'info', 'success', 'error', 'warning'
      timestamp: new Date()
    };
    setOutputMessages(prev => {
      const updated = [...prev, newMessage];
      // Keep only the last MAX_MESSAGES messages
      return updated.slice(-MAX_MESSAGES);
    });
    // Show output area and reset auto-collapse timer
    setIsOutputVisible(true);
    resetAutoCollapseTimer();
  };

  // Reset auto-collapse timer
  const resetAutoCollapseTimer = () => {
    // Clear existing timer
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }
    // Set new timer
    autoCollapseTimerRef.current = setTimeout(() => {
      // Only collapse if not hovering
      if (!isHoveringOutput && outputMessages.length > 0) {
        setIsOutputVisible(false);
      }
    }, AUTO_COLLAPSE_DELAY);
  };

  // Clear auto-collapse timer on unmount
  useEffect(() => {
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputMessages]);

  // Supported visualization command types
  const SUPPORTED_COMMAND_TYPES = ['echo'];

  // Handle command execution
  const handleCommandExecution = async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Clear input immediately
    setInputValue('');
    setHistoryIndex(-1);

    // Parse the command
    const command = parseCommand(trimmed);

    // Check if it's a context command (ctx)
    if (isContextCommand(command)) {
      // Check if TabContext is available
      if (!tabContext) {
        addOutputMessage('Context commands are not available yet. Please wait for the tab to load.', 'error');
        return;
      }

      try {
        const result = await handleContextCommand(command, tabContext);
        if (result.success) {
          addOutputMessage(result.message, 'success');
        } else {
          addOutputMessage(result.message, 'error');
        }
      } catch (error) {
        addOutputMessage(`Context command error: ${error.message}`, 'error');
      }
    }
    // Check if it's a layout command (tab/tile management)
    else if (isLayoutCommand(command)) {
      const result = handleLayoutCommand(command);
      if (result && !result.success) {
        addOutputMessage(result.message || 'Layout command failed', 'error');
      } else if (result && result.message) {
        addOutputMessage(result.message, 'success');
      }
    }
    // Execute visualization/action command with CommandContext
    else {
      // Validate command type before executing
      if (!SUPPORTED_COMMAND_TYPES.includes(command.type)) {
        addOutputMessage(`Unknown command: ${trimmed}`, 'error');
        return;
      }
      executeCommand(command);
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommandExecution(inputValue);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Navigate command history backwards
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]?.raw || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Navigate command history forwards
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInputValue('');
        } else {
          setHistoryIndex(newIndex);
          setInputValue(commandHistory[newIndex]?.raw || '');
        }
      }
    } else if (e.key === 'Escape') {
      // Clear output on Escape
      setOutputMessages([]);
    }
  };

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Global keyboard shortcut to focus terminal (Ctrl+L or Cmd+L)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+L (Windows/Linux) or Cmd+L (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    };

    // Add global event listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className={styles.terminal} onClick={handleTerminalClick}>
      {/* Output Messages Area - Expands upward */}
      {outputMessages.length > 0 && (
        <div
          className={`${styles.outputArea} ${!isOutputVisible ? styles.outputAreaCollapsed : ''}`}
          ref={outputRef}
          onMouseEnter={() => setIsHoveringOutput(true)}
          onMouseLeave={() => setIsHoveringOutput(false)}
        >
          {outputMessages.map((msg) => (
            <div key={msg.id} className={`${styles.outputMessage} ${styles[`outputMessage${msg.type.charAt(0).toUpperCase() + msg.type.slice(1)}`]}`}>
              <span className={styles.outputMessageText}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input Line */}
      <div className={styles.terminalContent}>
        {/* Shell Prompt - simplified without space/room */}
        <div className={styles.shellPrompt}>
          <span className={styles.userHost}>{userInfo?.email || 'user@netdata'}</span>
        </div>

        {/* Terminal Prompt Symbol */}
        <span className={styles.terminalPrompt}>%</span>

        {/* Terminal Input */}
        <div className={styles.terminalInputWrapper}>
          <input
            ref={inputRef}
            type="text"
            className={styles.terminalInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Type a command..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <span className={styles.terminalInputDisplay} aria-hidden="true">
            {inputValue}
            <span className={styles.fatCursor}>█</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default TerminalEmulator;

