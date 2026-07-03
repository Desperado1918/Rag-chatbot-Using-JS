// ============================================================================
// services/inspectorEmbedder.js — Chunking & Embedding Generator
// ============================================================================

const { createChromaClient, dummyEmbeddingFunction } = require("../utils/chromaHelper");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");
const { embedBatch } = require("./embeddingService");

/**
 * Split text safely using boundary separators.
 */
function safeSplitText(text, maxSize, overlapSize = config.chunking.overlapSize) {
    const cleanText = text.trim();

    if (!cleanText || cleanText.length <= maxSize) {
        return cleanText ? [cleanText] : [];
    }

    function extractOverlapTail(chunk) {
        if (!overlapSize || overlapSize <= 0 || chunk.length <= overlapSize) {
            return "";
        }
        let tail = chunk.slice(-overlapSize);
        const firstSpace = tail.indexOf(" ");
        if (firstSpace > 0 && firstSpace < tail.length - 1) {
            tail = tail.slice(firstSpace + 1);
        }
        return tail.trim();
    }

    for (const separator of config.chunking.separators) {
        const parts = cleanText.split(separator).filter(Boolean);

        if (parts.length <= 1) {
            continue;
        }

        const chunks = [];
        let current = "";

        for (const part of parts) {
            const trimmedPart = part.trim();
            if (!trimmedPart) continue;

            const candidate = current
                ? `${current}${separator}${trimmedPart}`
                : trimmedPart;

            if (candidate.length <= maxSize) {
                current = candidate;
            } else {
                if (current) {
                    const flushed = current.trim();
                    chunks.push(flushed);

                    const overlapTail = extractOverlapTail(flushed);
                    current = overlapTail ? overlapTail : "";
                }

                if (trimmedPart.length > maxSize) {
                    const subChunks = safeSplitText(trimmedPart, maxSize, overlapSize);
                    chunks.push(...subChunks);
                    const lastSub = subChunks[subChunks.length - 1] || "";
                    current = extractOverlapTail(lastSub);
                } else {
                    current = current ? `${current} ${trimmedPart}` : trimmedPart;
                }
            }
        }

        if (current.trim()) {
            chunks.push(current.trim());
        }

        if (chunks.length > 0) {
            return chunks;
        }
    }

    const chunks = [];
    for (let i = 0; i < cleanText.length; i += maxSize) {
        const slice = cleanText.slice(i, i + maxSize).trim();
        if (slice) {
            chunks.push(slice);
        }
    }
    return chunks;
}

/**
 * Create standard chunks from pages.
 */
function createStandardRecords(pages, sourceFilename, fileId) {
    const records = [];
    let globalIndex = 0;

    for (const page of pages) {
        if (!page.text) continue;
        const pageChunks = safeSplitText(page.text, config.chunking.standardChunkSize, config.chunking.overlapSize);

        pageChunks.forEach((chunk, index) => {
            records.push({
                id: `${sourceFilename}-standard-chunk-${globalIndex + 1}`,
                document: chunk,
                metadata: {
                    chunkingMethod: "standard",
                    source: sourceFilename,
                    file_id: fileId.toString(),
                    chunkNumber: globalIndex + 1,
                    pageNumber: page.pageNumber,
                },
            });
            globalIndex++;
        });
    }
    return records;
}

/**
 * Create hierarchical chunks from pages.
 */
function createHierarchicalChunks(pages, sourceFilename, fileId) {
    const records = [];
    let globalParentIndex = 0;
    let globalChildIndex = 0;

    for (const page of pages) {
        if (!page.text) continue;
        const parentChunks = safeSplitText(page.text, config.chunking.parentChunkSize, config.chunking.overlapSize);

        parentChunks.forEach((parentText) => {
            const parentNumber = globalParentIndex + 1;
            const parentId = `${sourceFilename}-parent-${parentNumber}`;
            globalParentIndex++;

            const childChunks = safeSplitText(parentText, config.chunking.childChunkSize, config.chunking.overlapSize);
            childChunks.forEach((childText, childIndex) => {
                records.push({
                    id: `${parentId}-child-${globalChildIndex + 1}`,
                    document: childText,
                    metadata: {
                        chunkingMethod: "hierarchical",
                        source: sourceFilename,
                        file_id: fileId.toString(),
                        parentId,
                        parentNumber,
                        childNumber: childIndex + 1,
                        pageNumber: page.pageNumber,
                    },
                });
                globalChildIndex++;
            });
        });
    }
    return records;
}

/**
 * Connect to ChromaDB collection.
 */
async function getOrCreateInspectorCollection() {
    const client = createChromaClient();
    return client.getOrCreateCollection({
        name: "inspector_chunks",
        metadata: { "hnsw:space": "cosine" },
        embeddingFunction: dummyEmbeddingFunction,
    });
}

/**
 * Run the embedder pipeline for inspection.
 */
async function ingestInspectorChunks(fileId, pages, sourceFilename, chunkingMethod, onLog) {
    onLog(`[Embedder] Selecting chunking strategy: ${chunkingMethod}`);
    
    // 1. Build chunk records
    const records = chunkingMethod === "standard"
        ? createStandardRecords(pages, sourceFilename, fileId)
        : createHierarchicalChunks(pages, sourceFilename, fileId);

    onLog(`[Embedder] Created ${records.length} chunk records`);

    if (records.length === 0) {
        onLog(`[Embedder] No text extracted. Skipping vector storage.`);
        return { recordsStored: 0 };
    }

    const collection = await getOrCreateInspectorCollection();

    // 2. Generate embeddings
    onLog(`[Embedder] Generating in-process embeddings via Xenova/all-MiniLM-L6-v2 ...`);
    const documents = records.map((r) => r.document);
    
    // Process in batches of 20 to report progressive logs
    const batchSize = 20;
    const embeddings = [];
    for (let i = 0; i < documents.length; i += batchSize) {
        const batchDocs = documents.slice(i, i + batchSize);
        const batchEmbeds = await embedBatch(batchDocs);
        embeddings.push(...batchEmbeds);
        
        const count = Math.min(i + batchSize, documents.length);
        onLog(`[Embedder] Generated embeddings for chunk ${count}/${documents.length}`);
    }

    // 3. Store to ChromaDB
    onLog(`[Chroma] Deleting any existing chunks for file_id: ${fileId}...`);
    try {
        await collection.delete({
            where: { file_id: fileId.toString() }
        });
    } catch (err) {
        // Safe to ignore if not present
    }

    onLog(`[Chroma] Upserting ${records.length} chunks into "inspector_chunks" collection...`);
    
    const ids = records.map((r) => r.id);
    const metadatas = records.map((r) => r.metadata);

    await collection.upsert({
        ids,
        embeddings,
        documents,
        metadatas,
    });

    onLog(`[Chroma] Successfully indexed all ${records.length} chunks.`);

    return {
        recordsStored: records.length,
        dimension: embeddings[0]?.length || 384,
    };
}

module.exports = {
    ingestInspectorChunks,
    getOrCreateInspectorCollection,
};
