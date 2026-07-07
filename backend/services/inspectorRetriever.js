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

    // Over-fetch child hits before grouping/deduping
    const queryOptions = {
        queryEmbeddings: [queryEmbedding],
        nResults: retrievalCount * 3,
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

    // Sort by similarity descending first so max similarity comes first
    scoredChunks.sort((a, b) => b.similarity - a.similarity);

    // Check if hierarchical chunking is active
    const isHierarchical = scoredChunks.some(
        (c) => c.metadata && c.metadata.chunkingMethod === "hierarchical"
    );

    if (isHierarchical) {
        const parentMap = new Map();

        for (const childHit of scoredChunks) {
            const parentId = childHit.metadata.parentId;
            const parentText = childHit.metadata.parentText;

            if (!parentId || !parentText || parentMap.has(parentId)) {
                continue;
            }

            parentMap.set(parentId, {
                id: parentId,
                text: parentText,
                similarity: childHit.similarity,
                distance: childHit.distance,
                metadata: {
                    source: childHit.metadata.source,
                    file_id: childHit.metadata.file_id,
                    parentId,
                    parentNumber: childHit.metadata.parentNumber,
                    matchedChildNumber: childHit.metadata.childNumber,
                    pageNumber: childHit.metadata.pageNumber,
                    chunkingMethod: "hierarchical",
                },
            });
        }

        const deduplicated = Array.from(parentMap.values());
        return deduplicated.slice(0, retrievalCount);
    }

    return scoredChunks.slice(0, retrievalCount);
}

module.exports = { retrieveForFile };
