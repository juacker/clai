# Chat.jsx Refactor Guide - Phase 3B

This document provides a detailed guide for refactoring Chat.jsx to use the plugin system instead of space/room architecture.

---

## Overview

**File:** `src/components/Chat/Chat.jsx`
**Size:** 1098 lines, ~39KB
**Complexity:** High - handles chat state, SSE streaming, message rendering

---

## Changes Required

### 1. Update Imports

**Remove:**
```javascript
import {
  listConversations,
  getConversation,
  deleteConversation,
  createConversation,
  createChatCompletion,
  createConversationTitle,
} from '../../api/client';
```

**Keep:** All other imports (MarkdownMessage, ToolBlock, chart components, etc.)

---

### 2. Update Component Props

**Before:**
```javascript
const Chat = ({ space, room, message, onMessageProcessed }) => {
```

**After:**
```javascript
const Chat = ({ pluginInstance, message, onMessageProcessed }) => {
```

---

### 3. Update State and Refs

**Add after existing state:**
```javascript
// Get plugin instance ID and metadata
const pluginId = pluginInstance?.metadata?.id;
const pluginName = pluginInstance?.metadata?.name || "Chat";
const pluginConfig = pluginInstance?.config || {};
```

**Remove:**
```javascript
// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('netdata_token');
};
```

---

### 4. Update Cache Key Generation

**Before:**
```javascript
// Generate cache key for current space/room
const getCacheKey = (spaceId, roomId) => {
  return `${spaceId}-${roomId}`;
};
```

**After:**
```javascript
// Generate cache key for current plugin
const getCacheKey = (pluginInstanceId) => {
  return pluginInstanceId;
};
```

---

### 5. Update saveStateToCache

**Before:**
```javascript
const saveStateToCache = (spaceId, roomId) => {
  if (!spaceId || !roomId) return;
  const key = getCacheKey(spaceId, roomId);
  // ...
};
```

**After:**
```javascript
const saveStateToCache = (pluginInstanceId) => {
  if (!pluginInstanceId) return;
  const key = getCacheKey(pluginInstanceId);
  // ...
};
```

---

### 6. Update restoreStateFromCache

**Before:**
```javascript
const restoreStateFromCache = async (spaceId, roomId) => {
  if (!spaceId || !roomId) return;
  const key = getCacheKey(spaceId, roomId);
  // ...
};
```

**After:**
```javascript
const restoreStateFromCache = async (pluginInstanceId) => {
  if (!pluginInstanceId) return;
  const key = getCacheKey(pluginInstanceId);
  // ...
};
```

---

### 7. Update Plugin Change Detection useEffect

**Before:**
```javascript
const prevSpaceRoomRef = useRef({ spaceId: null, roomId: null });

useEffect(() => {
  const currentSpaceId = space?.id;
  const currentRoomId = room?.id;
  const prevSpaceId = prevSpaceRoomRef.current.spaceId;
  const prevRoomId = prevSpaceRoomRef.current.roomId;

  const hasChanged = currentSpaceId !== prevSpaceId || currentRoomId !== prevRoomId;

  if (hasChanged && prevSpaceId && prevRoomId) {
    saveStateToCache(prevSpaceId, prevRoomId);
  }

  if (hasChanged && currentSpaceId && currentRoomId) {
    restoreStateFromCache(currentSpaceId, currentRoomId);
  }

  prevSpaceRoomRef.current = {
    spaceId: currentSpaceId,
    roomId: currentRoomId,
  };
}, [space?.id, room?.id]);
```

**After:**
```javascript
const prevPluginIdRef = useRef(null);

useEffect(() => {
  const currentPluginId = pluginId;
  const prevPluginId = prevPluginIdRef.current;

  const hasChanged = currentPluginId !== prevPluginId;

  if (hasChanged && prevPluginId) {
    saveStateToCache(prevPluginId);
  }

  if (hasChanged && currentPluginId) {
    restoreStateFromCache(currentPluginId);
  }

  prevPluginIdRef.current = currentPluginId;
}, [pluginId]);
```

---

### 8. Update Load Conversations useEffect

**Before:**
```javascript
useEffect(() => {
  if (space?.id && room?.id && mode === 'list') {
    loadConversations();
  }
}, [space?.id, room?.id, mode]);
```

**After:**
```javascript
useEffect(() => {
  if (pluginInstance && mode === 'list') {
    loadConversations();
  }
}, [pluginInstance, mode]);
```

---

### 9. Update Process Message useEffect

**Before:**
```javascript
useEffect(() => {
  if (!message || !space?.id || !room?.id || message?.id === lastProcessedMessageRef.current) {
    return;
  }
  // ...
}, [message, space?.id, room?.id]);
```

**After:**
```javascript
useEffect(() => {
  if (!message || !pluginInstance || message?.id === lastProcessedMessageRef.current) {
    return;
  }
  // ...
}, [message, pluginInstance]);
```

---

### 10. Update loadConversations Function

**Before:**
```javascript
const loadConversations = async () => {
  const token = getToken();
  if (!token) {
    setConversationsError('Authentication token not found');
    return;
  }

  setConversationsLoading(true);
  setConversationsError(null);

  try {
    const data = await listConversations(token, space.id, room.id);
    setConversations(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Failed to load conversations:', error);
    setConversationsError(error.message);
  } finally {
    setConversationsLoading(false);
  }
};
```

**After:**
```javascript
const loadConversations = async () => {
  if (!pluginInstance) {
    setConversationsError('No plugin instance available');
    return;
  }

  if (!pluginInstance.hasCapability('chat')) {
    setConversationsError('Plugin does not support chat');
    return;
  }

  setConversationsLoading(true);
  setConversationsError(null);

  try {
    const data = await pluginInstance.listChats();
    setConversations(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Failed to load conversations:', error);
    setConversationsError(error.message);
  } finally {
    setConversationsLoading(false);
  }
};
```

---

### 11. Update loadConversation Function

**Before:**
```javascript
const loadConversation = async (conversationId) => {
  const token = getToken();
  if (!token) {
    setConversationError('Authentication token not found');
    return;
  }

  // ... setup code ...

  try {
    const data = await getConversation(token, space.id, room.id, conversationId);
    setCurrentConversation(data);

    // Title generation
    if (!data.title || data.title.trim() === '') {
      // ... extract message content ...
      createConversationTitle(token, space.id, room.id, conversationId, messageContent)
        .then(titleResponse => {
          // ... update title ...
        });
    }
  } catch (error) {
    // ... error handling ...
  }
};
```

**After:**
```javascript
const loadConversation = async (conversationId) => {
  if (!pluginInstance) {
    setConversationError('No plugin instance available');
    return;
  }

  // ... setup code ...

  try {
    const data = await pluginInstance.getChat(conversationId);
    setCurrentConversation(data);

    // Title generation
    if (!data.title || data.title.trim() === '') {
      // ... extract message content ...
      pluginInstance.updateChatTitle(conversationId, messageContent)
        .then(titleResponse => {
          // ... update title ...
        });
    }
  } catch (error) {
    // ... error handling ...
  }
};
```

---

### 12. Update handleDeleteConversation Function

**Before:**
```javascript
const handleDeleteConversation = async (conversationId, event) => {
  if (event) {
    event.stopPropagation();
  }

  const token = getToken();
  if (!token) {
    setConversationsError('Authentication token not found');
    return;
  }

  if (!window.confirm('Are you sure you want to delete this conversation?')) {
    return;
  }

  try {
    await deleteConversation(token, space.id, room.id, conversationId);
    await loadConversations();
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    setConversationsError(error.message);
  }
};
```

**After:**
```javascript
const handleDeleteConversation = async (conversationId, event) => {
  if (event) {
    event.stopPropagation();
  }

  if (!pluginInstance) {
    setConversationsError('No plugin instance available');
    return;
  }

  if (!window.confirm('Are you sure you want to delete this conversation?')) {
    return;
  }

  try {
    await pluginInstance.deleteChat(conversationId);
    await loadConversations();
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    setConversationsError(error.message);
  }
};
```

---

### 13. Update processIncomingMessage Function

**Before:**
```javascript
const processIncomingMessage = async (userMessage) => {
  const token = getToken();
  if (!token) {
    setProcessingError('Authentication token not found');
    if (onMessageProcessed) {
      onMessageProcessed();
    }
    return;
  }

  // ... setup code ...

  try {
    let conversationId = currentConversation?.id;
    let parentMessageId = undefined;

    if (mode === 'list') {
      const newConversation = await createConversation(token, space.id, room.id, {
        title: `Chat ${new Date().toLocaleString()}`,
      });
      conversationId = newConversation.id;
      await loadConversation(conversationId);
      parentMessageId = undefined;
    } else {
      parentMessageId = currentConversation?.messages?.length > 0
        ? currentConversation.messages[currentConversation.messages.length - 1].id
        : undefined;
    }

    await createChatCompletion(
      token,
      space.id,
      room.id,
      conversationId,
      userMessage,
      handleSSEChunk,
      parentMessageId
    );

    setStreamingMessages([]);
    await loadConversation(conversationId);
  } catch (error) {
    // ... error handling ...
  }
};
```

**After:**
```javascript
const processIncomingMessage = async (userMessage) => {
  if (!pluginInstance) {
    setProcessingError('No plugin instance available');
    if (onMessageProcessed) {
      onMessageProcessed();
    }
    return;
  }

  // ... setup code ...

  try {
    let conversationId = currentConversation?.id;
    let parentMessageId = undefined;

    if (mode === 'list') {
      const newConversation = await pluginInstance.createChat({
        title: `Chat ${new Date().toLocaleString()}`,
      });
      conversationId = newConversation.id;
      await loadConversation(conversationId);
      parentMessageId = undefined;
    } else {
      parentMessageId = currentConversation?.messages?.length > 0
        ? currentConversation.messages[currentConversation.messages.length - 1].id
        : undefined;
    }

    await pluginInstance.sendMessage(conversationId, userMessage, {
      onChunk: handleSSEChunk,
      parentMessageId: parentMessageId,
    });

    setStreamingMessages([]);
    await loadConversation(conversationId);
  } catch (error) {
    // ... error handling ...
  }
};
```

---

### 14. Update renderMessageContent Function

**Update LoadChartBlock props to use plugin config:**

**Before:**
```javascript
<LoadChartBlock
  key={`chart-${block.id || idx}`}
  toolInput={block.input || {}}
  toolResult={toolResult ? {
    id: toolResult.id,
    text: toolResult.text || ''
  } : null}
  space={space}
  room={room}
/>
```

**After:**
```javascript
<LoadChartBlock
  key={`chart-${block.id || idx}`}
  toolInput={block.input || {}}
  toolResult={toolResult ? {
    id: toolResult.id,
    text: toolResult.text || ''
  } : null}
  space={{ id: pluginConfig.spaceId }}
  room={{ id: pluginConfig.roomId }}
/>
```

**Note:** This change needs to be made in TWO places in the renderMessageContent function:
1. In the streaming messages section (isStreaming && message.contentBlocks)
2. In the complete messages section (!isStreaming && message.content)

---

### 15. Update renderConversationsList Function

**Update header context display:**

**Before:**
```javascript
<div className={styles.chatContext}>
  <span className={styles.contextLabel}>Space:</span>
  <span className={styles.contextValue}>{space?.name || 'No Space'}</span>
  <span className={styles.contextSeparator}>•</span>
  <span className={styles.contextLabel}>Room:</span>
  <span className={styles.contextValue}>{room?.name || 'No Room'}</span>
</div>
```

**After:**
```javascript
<div className={styles.chatContext}>
  <span className={styles.contextLabel}>Plugin:</span>
  <span className={styles.contextValue}>{pluginName}</span>
</div>
```

---

### 16. Update Empty State Messages

**Change references from "Netdata AI" to generic "AI":**

**Before:**
```javascript
<div className={styles.emptyDescription}>
  Start a new conversation to chat with Netdata AI
</div>
```

**After:**
```javascript
<div className={styles.emptyDescription}>
  Start a new conversation to chat with AI
</div>
```

**Before:**
```javascript
<div className={styles.messageSender}>Netdata AI</div>
```

**After:**
```javascript
<div className={styles.messageSender}>AI</div>
```

---

## Testing Checklist

After making all changes, test the following:

- [ ] Chat panel opens without errors
- [ ] Conversations list loads correctly
- [ ] Can create a new conversation
- [ ] Can send messages and receive streaming responses
- [ ] Can view existing conversations
- [ ] Can delete conversations
- [ ] Conversation titles generate correctly
- [ ] Chat blocks render correctly (TimeSeriesChartBlock, BarChartBlock, etc.)
- [ ] LoadChartBlock receives correct space/room IDs from plugin config
- [ ] Switching between plugins preserves chat state
- [ ] Multiple tabs can have different active plugins

---

## Common Pitfalls

1. **Don't forget to update BOTH instances of LoadChartBlock** in renderMessageContent (streaming and complete messages sections)

2. **Plugin config structure:** Netdata plugin stores `spaceId` and `roomId` in `pluginInstance.config`. Verify this structure is correct.

3. **Error handling:** Make sure all error messages are user-friendly and don't expose internal details

4. **State caching:** The cache key change is critical - old cache entries will be invalid after the refactor

5. **SSE streaming:** The `handleSSEChunk` function doesn't need changes - it only processes chunk data structure

---

## File Locations

- **Source:** `src/components/Chat/Chat.jsx`
- **Backup:** Create backup before starting: `cp src/components/Chat/Chat.jsx src/components/Chat/Chat.jsx.backup`
- **Test:** After changes, run `npm run build` to verify no errors

---

## Estimated Time

- **Code changes:** 30-45 minutes
- **Testing:** 15-30 minutes
- **Bug fixes:** 30-60 minutes
- **Total:** 1.5-2.5 hours

---

## Need Help?

If you encounter issues:

1. Check the DesktopChatPanel.jsx for reference - it shows the correct pattern for using plugins
2. Verify plugin instance has chat capability: `pluginInstance.hasCapability('chat')`
3. Check plugin methods are available: `pluginInstance.listChats`, `pluginInstance.sendMessage`, etc.
4. Look at NetdataPlugin.js to understand the plugin interface
5. Review PluginInterface.js for the chat capability contract

---

