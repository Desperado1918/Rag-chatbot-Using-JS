// ============================================================================
// config/index.js — Centralized Configuration
// ============================================================================
// All configurable values live here. Environment variables override defaults.
// This prevents hardcoded URLs/models from being scattered across modules.
// ============================================================================

require("dotenv").config();

const config = {
    // -----------------------------------------------------------------------
    // Environment
    // -----------------------------------------------------------------------
    nodeEnv: process.env.NODE_ENV || "development",

    // -----------------------------------------------------------------------
    // Server
    // -----------------------------------------------------------------------
    port: parseInt(process.env.PORT, 10) || 3000,

    // -----------------------------------------------------------------------
    // MongoDB
    // -----------------------------------------------------------------------
    mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/rag-chatbot",

    // -----------------------------------------------------------------------
    // LLM Provider — 'ollama' (default) or 'openai'
    // -----------------------------------------------------------------------
    chatProvider: process.env.CHAT_PROVIDER || "ollama",

    // -----------------------------------------------------------------------
    // Ollama — Local LLM
    // -----------------------------------------------------------------------
    ollama: {
        baseUrl: process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
        chatModel: process.env.CHAT_MODEL || process.env.OLLAMA_MODEL || "qwen2.5:7b",
        embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
        contextWindow: parseInt(process.env.OLLAMA_CONTEXT_WINDOW, 10) || 8192,
    },

    // -----------------------------------------------------------------------
    // OpenAI — Only used when CHAT_PROVIDER=openai
    // -----------------------------------------------------------------------
    openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },

    // -----------------------------------------------------------------------
    // Embeddings — @xenova/transformers (in-process, no server needed)
    // -----------------------------------------------------------------------
    embedding: {
        model: process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
        dimensions: 384, // all-MiniLM-L6-v2 outputs 384-dim vectors
    },

    // -----------------------------------------------------------------------
    // ChromaDB — Vector Store
    // -----------------------------------------------------------------------
    chroma: {
        url: process.env.CHROMA_URL || "http://localhost:8000",
        collectionName: "conversation_chunks",
    },

    // -----------------------------------------------------------------------
    // Retrieval Tuning
    // -----------------------------------------------------------------------
    retrieval: {
        topK: 5,                     // Number of chunks to retrieve (legacy fallback)
        retrievalCount: parseInt(process.env.RAG_RETRIEVAL_COUNT, 10) || 10, // Raw vectors retrieved from ChromaDB
        topNChunks: parseInt(process.env.RAG_TOP_N_CHUNKS, 10) || 5,         // Chunks sent to LLM after re-ranking
        similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.40, // Minimum cosine similarity to pass
        hybridWeightSemantic: parseFloat(process.env.RAG_HYBRID_WEIGHT_SEMANTIC) || 0.7,
        hybridWeightKeyword: parseFloat(process.env.RAG_HYBRID_WEIGHT_KEYWORD) || 0.3,
        slidingWindowSize: parseInt(process.env.RAG_SLIDING_WINDOW_SIZE, 10) || 10, // Recent messages to include in prompt
        compressContext: process.env.RAG_COMPRESS_CONTEXT === "true", // Disable compression by default to avoid loss of details
    },

    // -----------------------------------------------------------------------
    // Chunking Parameters
    // -----------------------------------------------------------------------
    chunking: {
        maxTokens: 500,              // ~500 tokens per chunk
        overlapTokens: 50,           // ~50 token overlap
        standardChunkSize: parseInt(process.env.RAG_STANDARD_CHUNK_SIZE, 10) || 1000, // Character length standard chunks
        parentChunkSize: parseInt(process.env.RAG_PARENT_CHUNK_SIZE, 10) || 2000,     // Character length parent chunks
        childChunkSize: parseInt(process.env.RAG_CHILD_CHUNK_SIZE, 10) || 400,       // Character length child chunks
        overlapSize: parseInt(process.env.RAG_OVERLAP_SIZE, 10) || 200,              // Character length overlap
        separators: ["\n\n", "\n", ". ", " "],
    },

    // -----------------------------------------------------------------------
    // Document Defaults
    // -----------------------------------------------------------------------
    documents: {
        uploadDir: "./documents",
        defaultPath: "./documents/notes.pdf",
    },

    // -----------------------------------------------------------------------
    // LLM Generation
    // -----------------------------------------------------------------------
    generation: {
        temperature: parseFloat(process.env.RAG_TEMPERATURE) || 0.2, // Lower temperature to prevent hallucination in Q&A
        topP: 0.9,
        repeatPenalty: 1.1,
    },

    safeUnknownAnswer: process.env.SAFE_UNKNOWN_ANSWER || "I do not know the answer based on the provided documents.",

    // -----------------------------------------------------------------------
    // Conversation
    // -----------------------------------------------------------------------
    conversation: {
        titleGenerationThreshold: 1,  // Generate title after first exchange
        maxTitleLength: 7,            // Max words in auto-generated title
        summaryThreshold: parseInt(process.env.RAG_SUMMARY_THRESHOLD, 10) || 20, // Summarize after 20 messages
    },

    // -----------------------------------------------------------------------
    // Metadata Mirror
    // -----------------------------------------------------------------------
    metadataFilePath: process.env.METADATA_FILE_PATH || "./data/chats-metadata.json",
    metadataDebounceMs: 300,

    // -----------------------------------------------------------------------
    // Authentication
    // -----------------------------------------------------------------------
    auth: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
        jwtSecret: process.env.JWT_SECRET,                                      // MUST be set, validated at startup
        accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
        refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
        refreshTokenExpiryMs: 7 * 24 * 60 * 60 * 1000,                          // 7 days in ms (for cookies / DB TTL)
        accessTokenExpiryMs: 15 * 60 * 1000,                                    // 15 min in ms (for cookies)
        maxFailedLoginsBeforeCaptcha: parseInt(process.env.MAX_FAILED_LOGINS_BEFORE_CAPTCHA, 10) || 5,
        lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS, 10) || 60 * 1000, // Short secondary lockout: 1 min
        verifyTokenExpiry: 24 * 60 * 60 * 1000,                                 // 24 h for email verification
        captchaSecret: process.env.CAPTCHA_SECRET || "",                         // Verification secret for reCAPTCHA / hCaptcha
        captchaVerifyUrl: process.env.CAPTCHA_VERIFY_URL || "https://www.google.com/recaptcha/api/siteverify",
    },

    // -----------------------------------------------------------------------
    // Logging (pino)
    // -----------------------------------------------------------------------
    log: {
        level: process.env.LOG_LEVEL || "info",
    },
};

module.exports = config;
