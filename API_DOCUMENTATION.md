# RAG Chatbot Prototype API Documentation

This document provides a comprehensive technical reference for the RAG Chatbot backend API surface.

---

## 1. Global API Configuration

- **Base URL**: `http://localhost:3000` (or as configured by `PORT` env var).
- **Global Prefix**: `/api` (for all API endpoints).
- **Default Port**: `3000` (configurable via `PORT` in `.env`).
- **Global Rate Limiting**: All `/api` routes are rate-limited to **100 requests per 15 minutes** per IP.
- **Error Handling**: Standard error responses follow the format:
  ```json
  {
    "error": "Error message description",
    "code": "ERROR_CODE",
    "details": []
  }
  ```

---

## 2. Authentication & Security

### Development Bypassing
> [!NOTE]
> For local development convenience, the authentication middleware (`backend/middleware/authenticate.js`) is currently configured to bypass active JWT verification. It automatically injects the following mock user session into `req.user` for all authenticated endpoints:
> ```json
> {
>   "id": "660000000000000000000000",
>   "email": "poonishmukherjee18@gmail.com",
>   "username": "poonish"
> }
> ```

### Production Flow (JWT & Double-Submit CSRF)
When active, the authentication system uses state-changing guards and HttpOnly cookies:
1. **Access Token Cookie**: `accessToken` (HttpOnly, secure, path: `/`, short-lived).
2. **Refresh Token Cookie**: `refreshToken` (HttpOnly, secure, path: `/api/auth`, long-lived).
3. **CSRF Token Cookie**: `csrf_token` (JavaScript-accessible, path: `/`, secure, long-lived). For mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`), the client must read this cookie and supply it in the header (`X-CSRF-Token` or `x-csrf-token`), which is verified side-by-side with the cookie token.
4. **Auth Rate Limiting**: Signup and Login endpoints are rate-limited to **15 requests per 15 minutes** per IP.

---

## 3. Active (Mounted) API Endpoints

### 3.1. Authentication APIs (`/api/auth`)

These endpoints manage user sessions. Rate-limited to 15 requests per 15 minutes.

#### `POST /api/auth/signup`
Creates a new user account.
- **Request Body** (validated via Zod):
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123",
    "username": "user123" // Optional
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "message": "User registered successfully. Verification email sent."
  }
  ```

#### `POST /api/auth/login`
Authenticates a user and issues token cookies.
- **Request Body** (validated via Zod):
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123",
    "captchaToken": "g-recaptcha-response-string" // Optional
  }
  ```
- **Response Headers**: Sets `accessToken`, `refreshToken`, and `csrf_token` cookies.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Login successful",
    "user": {
      "id": "660000000000000000000000",
      "email": "user@example.com",
      "username": "user123"
    }
  }
  ```

#### `POST /api/auth/refresh`
Refreshes access tokens using the refresh cookie.
- **Request Headers**: Expects `refreshToken` cookie.
- **Response Headers**: Overwrites `accessToken` and `refreshToken` cookies with fresh credentials.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Tokens refreshed",
    "user": {
      "id": "660000000000000000000000",
      "email": "user@example.com"
    }
  }
  ```

#### `POST /api/auth/logout`
Invalidates the current session and clears all authentication cookies.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Logged out"
  }
  ```

#### `GET /api/auth/verify/:token`
Verifies user email address using the confirmation token.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Email verified successfully."
  }
  ```

#### `GET /api/auth/me`
Retrieves information about the currently logged-in user.
- **Headers**: Requires authentication token.
- **Response** (`200 OK`):
  ```json
  {
    "id": "660000000000000000000000",
    "email": "poonishmukherjee18@gmail.com",
    "username": "poonish"
  }
  ```

---

### 3.2. Chat Management APIs (`/api/chats`)
All routes require authentication.

#### `GET /api/chats`
Lists all conversations/chats for the user, sorted with pinned chats first, then by last updated.
- **Query Parameters**:
  - `page` (optional): Page number (defaults to `1`).
  - `limit` (optional): Items per page (defaults to `50`, max `50`).
  - `search` (optional): String to filter chats by title (case-insensitive regex).
- **Response** (`200 OK`):
  ```json
  {
    "chats": [
      {
        "_id": "661234567890abcdef123456",
        "title": "Quantum Mechanics Discussion",
        "lastMessagePreview": "What is superposition?",
        "messageCount": 2,
        "isPinned": true,
        "isFavorited": false,
        "model": "qwen2.5:7b",
        "createdAt": "2026-07-14T08:00:00.000Z",
        "updatedAt": "2026-07-14T08:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1,
      "totalPages": 1
    }
  }
  ```

#### `POST /api/chats`
Creates a new empty chat.
- **Request Body**:
  ```json
  {
    "title": "New Chat Title", // Optional, defaults to "New Chat"
    "model": "qwen2.5:7b" // Optional, defaults to configuration model
  }
  ```
- **Response** (`201 Created`): Returns the created Chat object.
  ```json
  {
    "_id": "661234567890abcdef123456",
    "title": "New Chat Title",
    "messageCount": 0,
    "lastMessagePreview": "",
    "isPinned": false,
    "isFavorited": false,
    "model": "qwen2.5:7b",
    "titleGenerated": false,
    "createdAt": "2026-07-14T08:20:00.000Z",
    "updatedAt": "2026-07-14T08:20:00.000Z"
  }
  ```

#### `GET /api/chats/:id`
Retrieves a specific chat and its full message history. It automatically hydatess any legacy sources that are missing formatted details from standard/hierarchical ChromaDB collections.
- **Response** (`200 OK`):
  ```json
  {
    "chat": {
      "_id": "661234567890abcdef123456",
      "title": "Quantum Mechanics Discussion",
      "messageCount": 2,
      "isPinned": false,
      "isFavorited": false,
      "model": "qwen2.5:7b",
      "createdAt": "2026-07-14T08:00:00.000Z",
      "updatedAt": "2026-07-14T08:05:00.000Z"
    },
    "messages": [
      {
        "_id": "66aa88888888888888888801",
        "chatId": "661234567890abcdef123456",
        "role": "user",
        "content": "What is superposition?",
        "createdAt": "2026-07-14T08:01:00.000Z"
      },
      {
        "_id": "66aa88888888888888888802",
        "chatId": "661234567890abcdef123456",
        "role": "assistant",
        "content": "Superposition is a fundamental principle of quantum mechanics...",
        "retrievedChunkIds": ["doc1-chunk-0"],
        "sources": [
          {
            "id": "doc1-chunk-0",
            "text": "Superposition refers to the combination of all possible states...",
            "similarity": 0.89,
            "metadata": {
              "pageNumber": 1,
              "source": "physics_notes.pdf"
            }
          }
        ],
        "createdAt": "2026-07-14T08:02:00.000Z"
      }
    ]
  }
  ```

#### `PATCH /api/chats/:id`
Updates fields on an existing chat (e.g. title/rename, pin status, favorite status, model change).
- **Request Body** (Only specified fields will be updated):
  ```json
  {
    "title": "Renamed Chat",
    "isPinned": true,
    "isFavorited": true,
    "model": "qwen2.5:7b"
  }
  ```
- **Response** (`200 OK`): Returns the updated Chat document.

#### `DELETE /api/chats/:id`
Deletes a chat, cascade-deletes all associated messages, and deletes related memory indexes from ChromaDB.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Chat deleted",
    "id": "661234567890abcdef123456"
  }
  ```

#### `POST /api/chats/:id/messages`
Sends a message into the chat and triggers RAG logic. Streams the response back to the client.
- **Request Body**:
  ```json
  {
    "content": "Explain quantum entanglement.",
    "chunkingMethod": "hierarchical" // Optional. 'standard' or 'hierarchical' (default)
  }
  ```
- **Response**: Streams SSE events. See the [Streaming Protocol & SSE section](#5-streaming-protocol--sse) for payload specs.

---

### 3.3. Message Operations (`/api`)
All routes require authentication.

#### `POST /api/conversations/:id/messages`
Duplicate route mapped to `POST /api/chats/:id/messages` for compatibility. Streams SSE events.

#### `PUT /api/messages/:messageId`
Edits a user message. This action:
1. Updates the user message content.
2. Deletes all subsequent conversation history (assistant responses and later messages) in the chat.
3. Re-indexes the remaining turns in ChromaDB.
- **Request Body**:
  ```json
  {
    "content": "What is quantum tunneling?"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "status": "success",
    "message": "Message updated and subsequent history cleared."
  }
  ```

#### `POST /api/messages/:messageId/retry`
Regenerates an assistant message response. This action:
1. Locates the preceding user message.
2. Deletes the current assistant message and any subsequent messages.
3. Reruns RAG hybrid retrieval and LLM completion.
4. Updates vector store indexes.
- **Request Body**:
  ```json
  {
    "chunkingMethod": "hierarchical" // Optional
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "status": "success",
    "message": "Message regenerated successfully.",
    "assistantMessage": {
      "_id": "66aa88888888888888888802",
      "chatId": "661234567890abcdef123456",
      "role": "assistant",
      "content": "Quantum tunneling is a quantum mechanical phenomenon...",
      "retrievedChunkIds": ["doc1-chunk-5"],
      "sources": [...]
    }
  }
  ```

---

### 3.4. Search API (`/api/search`)
Requires authentication.

#### `GET /api/search?q=query`
Performs a regex case-insensitive search across all conversation messages, groups matches by chat, and returns chat metadata alongside matching snippets.
- **Query Parameters**:
  - `q` (required): Search keyword.
  - `limit` (optional): Max message results (defaults to `20`, max `50`).
- **Response** (`200 OK`):
  ```json
  {
    "query": "superposition",
    "totalResults": 1,
    "results": [
      {
        "chat": {
          "_id": "661234567890abcdef123456",
          "title": "Quantum Mechanics Discussion"
        },
        "matchingMessages": [
          {
            "_id": "66aa88888888888888888801",
            "role": "user",
            "content": "What is superposition?",
            "createdAt": "2026-07-14T08:01:00.000Z"
          }
        ]
      }
    ]
  }
  ```

---

### 3.5. Document Management APIs (`/api/documents`)
All routes require authentication.

#### `POST /api/documents/upload`
Uploads a single PDF file, writes it to disk, and runs the document ingestion/embedding pipeline.
- **Request Body**: Multipart form data.
  - `document` (required file): The PDF file to upload (Max size: 50MB).
  - `chunkingMethod` (optional string): `'standard'` or `'hierarchical'` (default).
  - `conversationId` (optional string): Binds the document context to a specific chat.
- **Response** (`200 OK` on successful ingestion):
  ```json
  {
    "document": {
      "_id": "66bb22222222222222222201",
      "filename": "1720935540000-physics.pdf",
      "originalName": "physics.pdf",
      "filepath": "c:\\Users\\Poonish\\Downloads\\Rag-chatbot\\backend\\documents\\1720935540000-physics.pdf",
      "conversationId": null,
      "embeddingStatus": "completed",
      "chunkCount": 42,
      "chunkingMethod": "hierarchical",
      "collectionName": "notes_hierarchical",
      "fileSize": 1024300,
      "createdAt": "2026-07-14T08:19:00.000Z",
      "updatedAt": "2026-07-14T08:19:30.000Z"
    },
    "ingestion": {
      "success": true,
      "recordsStored": 42,
      "collection": "notes_hierarchical"
    }
  }
  ```
- **Response** (`500 Internal Server Error` on ingestion failure):
  Returns a `failed` status and the ingestion error:
  ```json
  {
    "error": "Ingestion failed: Incomplete PDF stream",
    "document": {
      "_id": "66bb22222222222222222201",
      "embeddingStatus": "failed",
      "metadata": {
        "error": "Incomplete PDF stream"
      }
    }
  }
  ```

#### `GET /api/documents`
Lists all uploaded documents, sorted by newest first.
- **Response** (`200 OK`):
  ```json
  {
    "documents": [
      {
        "_id": "66bb22222222222222222201",
        "filename": "1720935540000-physics.pdf",
        "originalName": "physics.pdf",
        "embeddingStatus": "completed",
        "chunkCount": 42,
        "chunkingMethod": "hierarchical",
        "fileSize": 1024300,
        "createdAt": "2026-07-14T08:19:00.000Z"
      }
    ]
  }
  ```

#### `GET /api/documents/conversations/:id`
Lists all documents bound to a specific conversation ID.
- **Response** (`200 OK`):
  ```json
  {
    "documents": [...]
  }
  ```

#### `POST /api/documents/ingest`
*(Legacy)* Manually triggers RAG ingestion for the default PDF file (`./documents/notes.pdf`).
- **Request Body**:
  ```json
  {
    "chunkingMethod": "hierarchical" // Optional
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "recordsStored": 120,
    "collection": "notes_hierarchical"
  }
  ```

---

### 3.6. RAG Pipeline Inspector APIs (`/api/inspector`)
Requires authentication. A standalone testing environment to run sandbox queries and parse/embed documents with real-time logs.

#### `POST /api/inspector/upload`
Uploads a PDF file into the pipeline inspector sandbox. Limited to a **maximum cap of 5 files** inside the sandbox database.
- **Request Body**: Multipart form data.
  - `pdf` (required file): The PDF document to analyze.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "document": {
      "_id": "66cc44444444444444444401",
      "filename": "inspector-1720935600000-math.pdf",
      "originalName": "math.pdf",
      "filepath": "c:\\Users\\Poonish\\Downloads\\Rag-chatbot\\backend\\documents\\inspector-1720935600000-math.pdf",
      "fileSize": 450200,
      "status": "pending",
      "createdAt": "2026-07-14T08:20:00.000Z"
    }
  }
  ```

#### `GET /api/inspector/files`
Lists all documents inside the pipeline inspector sandbox.
- **Response** (`200 OK`):
  ```json
  {
    "files": [
      {
        "_id": "66cc44444444444444444401",
        "originalName": "math.pdf",
        "status": "completed",
        "chunkCount": 15,
        "chunkingMethod": "hierarchical",
        "charCount": 32000,
        "pageCount": 8,
        "createdAt": "2026-07-14T08:20:00.000Z"
      }
    ]
  }
  ```

#### `DELETE /api/inspector/files/:id`
Deletes a document from the sandbox, deletes its corresponding file from disk, and drops its vectors from the inspector ChromaDB collection.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Document deleted successfully."
  }
  ```

#### `GET /api/inspector/ingest` & `POST /api/inspector/ingest`
Triggers parsing and embedding of a sandbox file, streaming step-by-step logs and progress back via Server-Sent Events (SSE). 
- **Request parameters / body**:
  - `id`: The sandbox InspectorDocument ID.
  - `chunkingMethod`: `'standard'` or `'hierarchical'` (default).
- **Stream Events**:
  - `log`: A progress log line string.
  - `parsing_start`: Fired when PDF extraction begins.
  - `parsing_done`: Returns character count, page count, and character previews per page.
  - `embedding_start`: Fired when vectorization begins.
  - `ingestion_complete`: Returns final chunk count and vector dimensions.
  - `error`: Logged and sent if any parsing/embedding step fails.

#### `POST /api/inspector/query`
Executes a isolated, sandboxed RAG query. Retrieves chunks for a single file and streams the LLM completion side-by-side.
- **Request Body**:
  ```json
  {
    "queryText": "What is the theorem on page 3?",
    "fileId": "66cc44444444444444444401"
  }
  ```
- **Response**: Streams SSE events:
  - `data: {"type": "token", "token": "..."}`: The generated text stream tokens.
  - `data: {"type": "done", "chunks": [...]}`: Fired upon completion; returns the retrieved context chunks (text, similarity score, and page number).

---

### 3.7. Diagnostics & Debugging APIs

#### `GET /api/debug/chunks/:chatId`
*(Authenticated)* Lists all vector chunks stored in ChromaDB for a specific chat conversation. Enables full visibility into RAG memory storage.
- **Response** (`200 OK`):
  ```json
  {
    "chatId": "661234567890abcdef123456",
    "totalChunks": 2,
    "chunks": [
      {
        "id": "66aa8888-chunk-0",
        "text": "Superposition refers to the combination of...",
        "metadata": {
          "chatId": "661234567890abcdef123456",
          "source": "conversation"
        },
        "embeddingPreview": [0.012, -0.045, 0.089] // First few vector elements
      }
    ]
  }
  ```

#### `GET /api/health`
*(Public)* Evaluates health status, database connection state, environment configuration, and model parameters.
- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "timestamp": "2026-07-14T08:22:15.000Z",
    "database": {
      "connected": true,
      "usingMemoryServer": false
    },
    "environment": "development",
    "chatProvider": "ollama",
    "embeddingModel": "Xenova/all-MiniLM-L6-v2"
  }
  ```

---

## 4. Inactive / Legacy / Internal Route Files
These route modules are defined inside the `backend/routes/` folder but are **not** mounted in `server.js` (they are either legacy modules or placeholder files for future expansion):

1. **`backend/routes/conversations.js`**: Replaced by `/api/chats`. Defines endpoints for listing, creating, and editing conversations, as well as separate routes for updating flags (`/api/conversations/:id/pin`, `/api/conversations/:id/favorite`, `/api/conversations/:id/archive`). Consolidated operations were moved to `/api/chats` via PATCH updates.
2. **`backend/routes/memory.js`**: Contains manual memory search (`POST /search`) and indexing (`POST /index`) handlers, interfacing with the local ChromaDB memory manager. Currently runs automatically in the background when chat messages are sent, rather than via REST API endpoints.
3. **`backend/routes/analytics.js`**: Contains stubs for pulling metrics dashboard data (`GET /`) and exporting event logs (`GET /export`).

---

## 5. Streaming Protocol & SSE

The endpoints `POST /api/chats/:id/messages` and `POST /api/conversations/:id/messages` communicate via Server-Sent Events (SSE). 

Clients should open these endpoints using a standard HTTP request with streaming response parser (e.g. Fetch API + TextDecoder, or EventSource if query parameters are used).

### Stream Event Types

During transmission, the backend writes newline-delimited chunks: `data: <JSON_STRING>\n\n`

#### 1. Sources Event (`type: "sources"`)
Fired as soon as hybrid vector retrieval is complete, transmitting context excerpts that will be fed to the LLM.
```json
{
  "type": "sources",
  "sources": [
    {
      "id": "doc-parent-12345",
      "text": "Excerpt text from standard or parent document...",
      "similarity": 0.785,
      "metadata": {
        "source": "physics_notes.pdf",
        "pageNumber": 3
      }
    }
  ]
}
```

#### 2. Token Event (`type: "token"`)
Fired multiple times as the LLM generates tokens.
```json
{
  "type": "token",
  "token": " because"
}
```

#### 3. Done Event (`type: "done"`)
Fired when the LLM stream ends. Passes back the saved database model objects for both the user message and the generated assistant response.
```json
{
  "type": "done",
  "userMessage": {
    "_id": "66aa88888888888888888801",
    "chatId": "661234567890abcdef123456",
    "role": "user",
    "content": "Explain superposition",
    "createdAt": "2026-07-14T08:01:00.000Z"
  },
  "assistantMessage": {
    "_id": "66aa88888888888888888802",
    "chatId": "661234567890abcdef123456",
    "role": "assistant",
    "content": "Superposition is...",
    "retrievedChunkIds": ["doc-parent-12345"],
    "createdAt": "2026-07-14T08:01:02.000Z"
  }
}
```

#### 4. Error Event (`type: "error"`)
Fired if an exception occurs during the retrieval or generation phases.
```json
{
  "type": "error",
  "error": "Failed to connect to Ollama service"
}
```
