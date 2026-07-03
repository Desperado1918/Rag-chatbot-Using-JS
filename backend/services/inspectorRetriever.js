// ============================================================================
// services/inspectorRetriever.js — Isolated Vector Retriever
// ============================================================================

const { getOrCreateInspectorCollection } = require("./inspectorEmbedder");
const { embedText } = require("./embeddingService");
const config = require("../config");

/**
 * Retrieve relevant chunks for a user query from a single isolated PDF context.
 *
 * @param {string} queryText - The search query.
 * @param {string} fileId - The Mongoose ObjectId string of the InspectorDocument.
 * @param {Object} [options] - Retrieval options.
 * @returns {Promise<Object[]>} - Array of scored chunks.
 */
async function retrieveForFile(queryText, fileId, options = {}) {
    if (!queryText || !fileId) {
        throw new Error("retrieveForFile requires both a queryText and an isolated fileId.");
    }

    const collection = await getOrCreateInspectorCollection();
    const queryEmbedding = await embedText(queryText);

    const retrievalCount = options.retrievalCount || config.retrieval.retrievalCount || 5;

    const queryOptions = {
        queryEmbeddings: [queryEmbedding],
        nResults: retrievalCount,
        where: { file_id: fileId.toString() }, // Strict single-PDF isolation
    };

    const results = await collection.query(queryOptions);

    if (!results || !results.ids || results.ids.length === 0) {
        return [];
    }

    const ids = results.ids[0] || [];
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    const scoredChunks = [];

    for (let i = 0; i < ids.length; i++) {
        // Cosine distance maps to similarity: similarity = 1 - distance
        // Chroma returns distance = 1 - cosine_similarity. So cosine_similarity = 1 - distance
        const distance = distances[i] ?? 1;
        const similarity = Math.max(0, Math.min(1, 1 - distance));

        scoredChunks.push({
            id: ids[i],
            text: documents[i],
            metadata: metadatas[i] || {},
            distance,
            similarity,
        });
    }

    // Sort by similarity descending
    return scoredChunks.sort((a, b) => b.similarity - a.similarity);
}

module.exports = { retrieveForFile };
