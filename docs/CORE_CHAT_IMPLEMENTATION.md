# Core Chat Implementation

This document describes the core chat implementation using Tauri (Rust backend) instead of the previous plugin-based architecture.

## Overview

The chat functionality has been moved from a plugin-based system to a core feature of the application, with the backend implemented in Rust using Tauri commands.

## Architecture

### Backend (Rust)

**Location:** `src-tauri/src/chat.rs`

The Rust backend provides the following data structures and commands:

#### Data Structures

- **ContentBlock**: Represents message content blocks (text, tool_use, or tool_result)
- **Message**: Represents a single message in a conversation
- **Conversation**: Represents a conversation with its messages
- **ChatStorage**: In-memory storage for conversations (to be replaced with persistent storage)

#### Tauri Commands

1. **list_chats**: List all conversations
   ```rust
   pub async fn list_chats(storage: State<'_, ChatStorage>) -> Result<Vec<Conversation>, String>
   ```

2. **get_chat**: Get a specific conversation by ID
   ```rust
   pub async fn get_chat(conversation_id: String, storage: State<'_, ChatStorage>) -> Result<Conversation, String>
   ```

3. **create_chat**: Create a new conversation
   ```rust
   pub async fn create_chat(request: CreateConversationRequest, storage: State<'_, ChatStorage>) -> Result<Conversation, String>
   ```

4. **delete_chat**: Delete a conversation
   ```rust
   pub async fn delete_chat(conversation_id: String, storage: State<'_, ChatStorage>) -> Result<(), String>
   ```

5. **update_chat_title**: Update conversation title based on message content
   ```rust
   pub async fn update_chat_title(conversation_id: String, request: UpdateTitleRequest, storage: State<'_, ChatStorage>) -> Result<TitleResponse, String>
   ```

6. **send_message**: Send a message and get a response (stub implementation)
   ```rust
   pub async fn send_message(conversation_id: String, request: SendMessageRequest, storage: State<'_, ChatStorage>) -> Result<Message, String>
   ```

### Frontend Service

**Location:** `src/services/chatService.js`

The frontend service provides a clean interface to call the Tauri commands:

```javascript
import { invoke } from '@tauri-apps/api/core';

export const listChats = async () => { ... }
export const getChat = async (conversationId) => { ... }
export const createChat = async (data = {}) => { ... }
export const deleteChat = async (conversationId) => { ... }
export const updateChatTitle = async (conversationId, messageContent) => { ... }
export const sendMessage = async (conversationId, message, options = {}) => { ... }
export const sendMessageStreaming = async (conversationId, message, onChunk, parentMessageId) => { ... }
```

### Chat Component

**Location:** `src/components/Chat/Chat.jsx`

The Chat component has been refactored to use the `chatService` directly instead of relying on plugin instances:

**Key Changes:**
- Removed dependency on `pluginInstance` for chat operations
- Uses `chatService` methods for all chat-related operations
- `pluginInstance` is now optional and only used for context (e.g., space/room IDs for LoadChartBlock)

## Current Implementation Status

### ✅ Implemented (Stub)

1. **Data structures** for conversations and messages
2. **Tauri commands** for all chat operations
3. **Frontend service** to call Tauri commands
4. **Chat component refactoring** to use the new service
5. **In-memory storage** for conversations

### ⏳ To Be Implemented

1. **Persistent storage** (currently using in-memory HashMap)
2. **Real LLM integration** for message responses (currently returns stub responses)
3. **Streaming support** via real-time communication (currently simulated in frontend)
4. **Title generation** via LLM (currently uses simple truncation)
5. **Database integration** for conversation history
6. **User authentication** and conversation ownership
7. **Message search** and filtering
8. **Conversation export/import**

## Testing the Stub Implementation

To test the current stub implementation:

1. Build and run the application:
   ```bash
   npm run tauri dev
   ```

2. Open the chat panel

3. Send a message - you should see:
   - A new conversation created
   - Your message displayed
   - A stub response: "This is a stub response. You said: '[your message]'. Real implementation coming soon!"

4. Try other operations:
   - View conversations list
   - Delete conversations
   - Create multiple conversations

## Next Steps

### Phase 1: Persistent Storage

Replace `ChatStorage` with a proper database:
- Use SQLite via `rusqlite` or `sqlx`
- Create tables for conversations and messages
- Implement CRUD operations

### Phase 2: LLM Integration

Integrate with an LLM provider:
- Add OpenAI/Anthropic API client
- Implement real message processing
- Add streaming support using Server-Sent Events (SSE) or WebSockets

### Phase 3: Advanced Features

- Conversation search and filtering
- Message editing and regeneration
- Conversation sharing
- Export/import functionality

## Dependencies

### Rust (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

### JavaScript (package.json)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.x"
  }
}
```

## File Structure

```
src-tauri/
├── src/
│   ├── lib.rs           # Main Tauri setup, registers commands
│   └── chat.rs          # Chat module with data structures and commands
└── Cargo.toml           # Rust dependencies

src/
├── services/
│   └── chatService.js   # Frontend service to call Tauri commands
└── components/
    └── Chat/
        └── Chat.jsx     # Chat component (refactored to use chatService)
```

## API Reference

### chatService.listChats()

Returns a list of all conversations.

**Returns:** `Promise<Array<Conversation>>`

**Example:**
```javascript
const conversations = await chatService.listChats();
```

### chatService.getChat(conversationId)

Gets a specific conversation with all its messages.

**Parameters:**
- `conversationId` (string): The conversation ID

**Returns:** `Promise<Conversation>`

**Example:**
```javascript
const conversation = await chatService.getChat('123');
```

### chatService.createChat(data)

Creates a new conversation.

**Parameters:**
- `data` (object): Conversation data
  - `title` (string, optional): Conversation title

**Returns:** `Promise<Conversation>`

**Example:**
```javascript
const conversation = await chatService.createChat({ title: 'My Chat' });
```

### chatService.deleteChat(conversationId)

Deletes a conversation.

**Parameters:**
- `conversationId` (string): The conversation ID

**Returns:** `Promise<void>`

**Example:**
```javascript
await chatService.deleteChat('123');
```

### chatService.updateChatTitle(conversationId, messageContent)

Updates the conversation title based on message content.

**Parameters:**
- `conversationId` (string): The conversation ID
- `messageContent` (string): The message content to generate title from

**Returns:** `Promise<{ title: string }>`

**Example:**
```javascript
const { title } = await chatService.updateChatTitle('123', 'What is the weather?');
```

### chatService.sendMessage(conversationId, message, options)

Sends a message and gets a response.

**Parameters:**
- `conversationId` (string): The conversation ID
- `message` (string): The message to send
- `options` (object, optional):
  - `parentMessageId` (string, optional): Parent message ID

**Returns:** `Promise<Message>`

**Example:**
```javascript
const response = await chatService.sendMessage('123', 'Hello!');
```

### chatService.sendMessageStreaming(conversationId, message, onChunk, parentMessageId)

Sends a message with streaming support (currently simulated).

**Parameters:**
- `conversationId` (string): The conversation ID
- `message` (string): The message to send
- `onChunk` (function): Callback for each chunk
- `parentMessageId` (string, optional): Parent message ID

**Returns:** `Promise<void>`

**Example:**
```javascript
await chatService.sendMessageStreaming('123', 'Hello!', (chunk) => {
  console.log(chunk);
});
```

## Notes

- The current implementation is a **stub** - it stores conversations in memory and returns placeholder responses
- Real LLM integration and persistent storage need to be implemented
- Streaming is currently simulated in the frontend service
- The Chat component is backward-compatible with plugin instances (optional)

