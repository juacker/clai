import React, { useMemo } from "react";
import { useChatManager } from "../../contexts/ChatManagerContext";
import { usePlugin } from "../../contexts/PluginContext";
import Chat from "./Chat";
import styles from "./DesktopChatPanel.module.css";

/**
 * DesktopChatPanel - Chat panel container
 *
 * This component provides a full-height, fixed-position chat panel
 * that appears on the right side of the screen.
 * It expands from right to left when opened.
 *
 * Phase 3B: Updated to use plugin system instead of SharedSpaceRoomDataContext
 *
 * Features:
 * - Full viewport height (0 to 100vh)
 * - Fixed positioning on right side
 * - Smooth expand/collapse animations
 * - Integrates with ChatManagerContext for state management
 * - Queries active plugins with chat capability
 * - Supports forwarding messages from terminal when chat is visible
 *
 * @param {Object} props - Component props
 * @param {string} props.message - Message to forward to chat (from terminal)
 * @param {function} props.onMessageProcessed - Callback when message is processed
 */
const DesktopChatPanel = ({ message, onMessageProcessed }) => {
  const { isCurrentChatOpen, getCurrentChatInstance, getActivePluginId } =
    useChatManager();
  const { getPluginInstance } = usePlugin();

  // Get the current chat instance (if any)
  const chatInstance = getCurrentChatInstance();

  // Determine if panel should be visible
  const isOpen = isCurrentChatOpen();

  // Get active plugin ID from chat manager
  const activePluginId = getActivePluginId();

  // Get the plugin instance from global context
  const pluginInstance = useMemo(() => {
    if (!activePluginId) {
      return null;
    }
    return getPluginInstance(activePluginId);
  }, [activePluginId, getPluginInstance]);

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ""}`}
      role="complementary"
      aria-label="Chat panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        {chatInstance && pluginInstance && (
          <Chat
            pluginInstance={pluginInstance}
            isOpen={isOpen}
            message={message}
            onMessageProcessed={onMessageProcessed}
          />
        )}
      </div>
    </div>
  );
};

export default DesktopChatPanel;

