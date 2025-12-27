import React from "react";
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
 * Since chat is now a core feature (not a plugin), this component:
 * - Gets the chat panel state from ChatManagerContext
 * - Gets all active plugins from PluginContext (via TabPluginProvider)
 * - Passes the array of active plugins to the Chat component
 * - Chat component will check which plugins implement useful interfaces
 *
 * Features:
 * - Full viewport height (0 to 100vh)
 * - Fixed positioning on right side
 * - Smooth expand/collapse animations
 * - Integrates with ChatManagerContext for panel state
 * - Passes active plugins to Chat for tool/context discovery
 * - Supports forwarding messages from terminal when chat is visible
 *
 * @param {Object} props - Component props
 * @param {string} props.message - Message to forward to chat (from terminal)
 * @param {function} props.onMessageProcessed - Callback when message is processed
 */
const DesktopChatPanel = ({ message, onMessageProcessed }) => {
  const { isChatOpen } = useChatManager();
  const { activePlugins = [] } = usePlugin();

  // Determine if panel should be visible
  const isOpen = isChatOpen();

  return (
    <div
      id="desktop-chat-panel"
      className={`${styles.desktopChatPanel} ${isOpen ? styles.open : ""}`}
      role="complementary"
      aria-label="Chat panel"
      aria-hidden={!isOpen}
    >
      <div className={styles.chatContainer}>
        <Chat
          activePlugins={activePlugins}
          isOpen={isOpen}
          message={message}
          onMessageProcessed={onMessageProcessed}
        />
      </div>
    </div>
  );
};

export default DesktopChatPanel;

