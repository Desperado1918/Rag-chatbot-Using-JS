// ============================================================================
// utils/chromaHelper.js — ChromaDB connection and setup helper
// ============================================================================

const { ChromaClient } = require("chromadb");
const config = require("../config");

const dummyEmbeddingFunction = {
    generateEmbeddings: async (documents) => {
        // Return dummy embeddings of matching dimension (default 384 for Xenova/all-MiniLM-L6-v2)
        const dimensions = config.embedding?.dimensions || 384;
        return documents.map(() => Array(dimensions).fill(0));
    }
};

function createChromaClient() {
    try {
        const url = new URL(config.chroma.url);
        return new ChromaClient({
            host: url.hostname,
            port: url.port ? parseInt(url.port, 10) : undefined,
            ssl: url.protocol === "https:",
        });
    } catch (e) {
        // Fallback for malformed URLs
        return new ChromaClient({
            host: "localhost",
            port: 8000,
        });
    }
}

module.exports = {
    createChromaClient,
    dummyEmbeddingFunction,
};
