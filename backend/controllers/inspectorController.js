// ============================================================================
// controllers/inspectorController.js — Pipeline Inspector Controller
// ============================================================================

const fs = require("fs");
const path = require("path");
const InspectorDocument = require("../models/InspectorDocument");
const { parsePdf } = require("../services/inspectorParser");
const { ingestInspectorChunks, getOrCreateInspectorCollection } = require("../services/inspectorEmbedder");
const { retrieveForFile } = require("../services/inspectorRetriever");
const { streamChat } = require("../services/llmService");

const MAX_PDF_FILES = 5;

/**
 * Handle file upload with 5-file cap check.
 */
async function uploadFile(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const count = await InspectorDocument.countDocuments();
        if (count >= MAX_PDF_FILES) {
            // Delete uploaded file from disk to avoid temp pollution
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                error: `Upload cap reached. You can only retain up to ${MAX_PDF_FILES} files. Please delete an existing file first.`
            });
        }

        const doc = await InspectorDocument.create({
            filename: req.file.filename,
            originalName: req.file.originalname,
            filepath: req.file.path,
            fileSize: req.file.size,
            status: "pending",
        });

        res.json({ success: true, document: doc });
    } catch (err) {
        console.error("[inspectorController] uploadFile error:", err);
        res.status(500).json({ error: "Failed to upload file" });
    }
}

/**
 * List all documents uploaded for inspection.
 */
async function listFiles(req, res) {
    try {
        const files = await InspectorDocument.find().sort({ createdAt: -1 }).lean();
        res.json({ files });
    } catch (err) {
        console.error("[inspectorController] listFiles error:", err);
        res.status(500).json({ error: "Failed to list files" });
    }
}

/**
 * Delete a document from MongoDB, ChromaDB, and disk.
 */
async function deleteFile(req, res) {
    try {
        const { id } = req.params;
        const doc = await InspectorDocument.findById(id);

        if (!doc) {
            return res.status(404).json({ error: "Document not found" });
        }

        // 1. Delete from disk
        if (fs.existsSync(doc.filepath)) {
            fs.unlinkSync(doc.filepath);
        }

        // 2. Delete chunks from ChromaDB
        try {
            const collection = await getOrCreateInspectorCollection();
            await collection.delete({
                where: { file_id: doc._id.toString() }
            });
        } catch (chromaErr) {
            console.warn("[inspectorController] Failed to delete Chroma chunks:", chromaErr.message);
        }

        // 3. Delete from Mongoose
        await InspectorDocument.findByIdAndDelete(id);

        res.json({ success: true, message: "Document deleted successfully." });
    } catch (err) {
        console.error("[inspectorController] deleteFile error:", err);
        res.status(500).json({ error: "Failed to delete file" });
    }
}

/**
 * Run PDF Parsing and Embedding as step-by-step SSE stream.
 */
async function ingestFileStream(req, res) {
    const id = req.body.id || req.query.id;
    const chunkingMethod = (req.body.chunkingMethod || req.query.chunkingMethod) === "standard" ? "standard" : "hierarchical";

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    function sendEvent(event, data) {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    try {
        const doc = await InspectorDocument.findById(id);
        if (!doc) {
            sendEvent("error", { message: "Document not found" });
            return res.end();
        }

        doc.status = "processing";
        doc.chunkingMethod = chunkingMethod;
        doc.logs = [];
        await doc.save();

        const logs = [];
        const logger = (msg) => {
            const timestamped = `[${new Date().toISOString()}] ${msg}`;
            logs.push(timestamped);
            sendEvent("log", { message: msg });
        };

        // 1. Stage 1: Parsing
        logger(`Starting Stage 1: PDF Text Extraction...`);
        sendEvent("parsing_start", {});

        const parsedResult = await parsePdf(doc.filepath);
        
        doc.charCount = parsedResult.charCount;
        doc.pageCount = parsedResult.pageCount;
        doc.pages = parsedResult.pages;
        await doc.save();

        logger(`Parsing complete. Extracted ${parsedResult.pageCount} pages, ${parsedResult.charCount} characters.`);
        sendEvent("parsing_done", {
            charCount: parsedResult.charCount,
            pageCount: parsedResult.pageCount,
            preview: parsedResult.text.slice(0, 1000),
            pages: parsedResult.pages.map((p) => ({
                pageNumber: p.pageNumber,
                charCount: p.charCount,
            })),
        });

        // 2. Stage 2: Embedding & Upserting
        logger(`Starting Stage 2: Embedding Generation & Chroma Insertion...`);
        sendEvent("embedding_start", {});

        const embedResult = await ingestInspectorChunks(
            doc._id,
            parsedResult.pages,
            doc.originalName,
            chunkingMethod,
            logger
        );

        doc.status = "completed";
        doc.chunkCount = embedResult.recordsStored;
        doc.logs = logs;
        await doc.save();

        logger(`Embedding ingestion complete. Total Chunks created: ${embedResult.recordsStored}.`);
        sendEvent("ingestion_complete", {
            chunkCount: embedResult.recordsStored,
            dimension: embedResult.dimension,
        });

        res.end();
    } catch (err) {
        console.error("[inspectorController] Ingestion error:", err);
        try {
            const doc = await InspectorDocument.findById(id);
            if (doc) {
                doc.status = "failed";
                doc.error = err.message;
                doc.logs.push(`[ERROR] Ingestion failed: ${err.message}`);
                await doc.save();
            }
        } catch (saveErr) {}

        sendEvent("error", { message: err.message });
        res.end();
    }
}

/**
 * Handle Sandboxed QA queries, returning retrieves side-by-side with stream completions.
 */
async function querySandbox(req, res) {
    const { queryText, fileId } = req.body;

    if (!queryText || !fileId) {
        return res.status(400).json({ error: "Missing queryText or fileId parameters." });
    }

    try {
        const doc = await InspectorDocument.findById(fileId);
        if (!doc || doc.status !== "completed") {
            return res.status(400).json({ error: "Context PDF has not been successfully ingested yet." });
        }

        // 1. Stage 3: Retrieval
        const retrievedChunks = await retrieveForFile(queryText, fileId);

        // 2. Format isolated RAG context block
        const contextExcerpts = retrievedChunks
            .map((chunk, index) => `[Source ${index + 1}: Page ${chunk.metadata.pageNumber}, Similarity ${(chunk.similarity * 100).toFixed(1)}%]\n${chunk.text}`)
            .join("\n\n---\n\n");

        // 3. Build system prompt
        const systemPrompt = `You are a strict, document-bound QA assistant. Your ONLY source of truth is the retrieved context excerpts from the uploaded PDF document: "${doc.originalName}".

RULES:
1. You MUST answer the user's question using ONLY the provided context excerpts below.
2. NEVER use your own training data or fabricate any facts, names, numbers, or details not explicitly present in the context.
3. If the context does not contain the answer, you must reply with exactly: "I cannot find the answer to this question in the selected document."
4. Do not assume or cross-reference facts from other documents.
5. Provide a detailed answer citing the page numbers from the context (e.g. [Page X]) for every claim you make.`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "system", content: `=== CONTEXT EXCERPTS FROM DOCUMENT ===\n${contextExcerpts}\n=== END CONTEXT ===` },
            { role: "user", content: queryText }
        ];

        // 4. Stream response
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let responseText = "";

        await streamChat(messages, {}, {
            onToken: (token) => {
                responseText += token;
                res.write(`data: ${JSON.stringify({ type: "token", token })}\n\n`);
            },
            onDone: () => {
                res.write(`data: ${JSON.stringify({ type: "done", chunks: retrievedChunks })}\n\n`);
                res.end();
            }
        });

    } catch (err) {
        console.error("[inspectorController] querySandbox error:", err);
        res.status(500).json({ error: "Query sandbox generation failed: " + err.message });
    }
}

module.exports = {
    uploadFile,
    listFiles,
    deleteFile,
    ingestFileStream,
    querySandbox,
};
