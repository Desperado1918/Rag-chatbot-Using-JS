// ============================================================================
// controllers/conversationController.js — Chat CRUD Operations
// ============================================================================
// Handles listing, creating, getting, updating, and deleting chats.
// Aligned with the spec API surface. Uses the new Chat model.
// ============================================================================

const Chat = require("../models/Chat");
const Message = require("../models/Message");
const { deleteByChat } = require("../services/vectorService");
const { syncMetadata } = require("../services/metadataMirror");
const { createServiceError } = require("../utils/errors");

/**
 * List all chats (lightweight — title, preview, timestamps only).
 * GET /api/chats
 */
async function listChats(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;

    const filter = {};

    // Optional search by title
    if (req.query.search) {
        filter.title = { $regex: req.query.search, $options: "i" };
    }

    const [chats, total] = await Promise.all([
        Chat.find(filter)
            .select("title lastMessagePreview messageCount isPinned isFavorited model createdAt updatedAt")
            .sort({ isPinned: -1, updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Chat.countDocuments(filter),
    ]);

    res.json({
        chats,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
}

/**
 * Get a single chat with its full message history.
 * GET /api/chats/:id
 */
async function getChat(req, res) {
    const chat = await Chat.findById(req.params.id).lean();

    if (!chat) {
        throw createServiceError("Chat not found", 404);
    }

    const messages = await Message.find({ chatId: req.params.id })
        .sort({ createdAt: 1 })
        .lean();

    // Fallback for legacy messages where sources is empty/missing but retrievedChunkIds exists
    const legacyMsgs = messages.filter(
        (m) =>
            m.role === "assistant" &&
            (!m.sources || m.sources.length === 0) &&
            m.retrievedChunkIds &&
            m.retrievedChunkIds.length > 0
    );

    if (legacyMsgs.length > 0) {
        try {
            const allChunkIds = [];
            for (const msg of legacyMsgs) {
                allChunkIds.push(...msg.retrievedChunkIds);
            }
            const uniqueChunkIds = Array.from(new Set(allChunkIds));

            if (uniqueChunkIds.length > 0) {
                const { getCollection } = require("../services/retrieval");
                const chunksMap = new Map();

                for (const id of uniqueChunkIds) {
                    if (chunksMap.has(id)) continue;

                    const isParentId = id.includes("-parent-") && !id.includes("-child-");

                    if (isParentId) {
                        try {
                            const collection = await getCollection("notes_hierarchical");
                            const resData = await collection.get({
                                where: { parentId: id },
                                include: ["documents", "metadatas"],
                            });
                            if (resData && resData.ids && resData.ids.length > 0) {
                                const meta = resData.metadatas[0] || {};
                                chunksMap.set(id, {
                                    id,
                                    text: meta.parentText || resData.documents[0],
                                    metadata: meta,
                                    similarity: null,
                                });
                            }
                        } catch (err) {
                            console.warn(`[getChat Fallback] Could not fetch parentId ${id} from notes_hierarchical:`, err.message);
                        }
                    } else {
                        const collectionsToTry = ["notes_standard", "notes_hierarchical"];
                        for (const collName of collectionsToTry) {
                            if (chunksMap.has(id)) break;
                            try {
                                const collection = await getCollection(collName);
                                const resData = await collection.get({
                                    ids: [id],
                                    include: ["documents", "metadatas"],
                                });
                                if (resData && resData.ids && resData.ids.length > 0) {
                                    chunksMap.set(id, {
                                        id,
                                        text: resData.documents[0],
                                        metadata: resData.metadatas[0] || {},
                                        similarity: null,
                                    });
                                }
                            } catch (err) {
                                // Silent warning/retry on next collection
                            }
                        }
                    }
                }

                for (const msg of messages) {
                    if (
                        msg.role === "assistant" &&
                        (!msg.sources || msg.sources.length === 0) &&
                        msg.retrievedChunkIds &&
                        msg.retrievedChunkIds.length > 0
                    ) {
                        msg.sources = msg.retrievedChunkIds
                            .map((id) => chunksMap.get(id))
                            .filter(Boolean);
                    }
                }
            }
        } catch (fallbackErr) {
            console.error("[getChat Fallback] Failed to hydrate legacy sources:", fallbackErr.message);
        }
    }

    res.json({ chat, messages });
}

/**
 * Create a new empty chat.
 * POST /api/chats
 */
async function createChat(req, res) {
    const chat = await Chat.create({
        title: req.body.title || "New Chat",
        model: req.body.model || undefined,
    });

    syncMetadata();
    res.status(201).json(chat);
}

/**
 * Update a chat (rename, pin, etc.).
 * PATCH /api/chats/:id
 */
async function updateChat(req, res) {
    const allowedFields = ["title", "isPinned", "isFavorited", "model"];
    const updates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    const chat = await Chat.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
    );

    if (!chat) {
        throw createServiceError("Chat not found", 404);
    }

    syncMetadata();
    res.json(chat);
}

/**
 * Delete a chat and cascade to its messages and ChromaDB chunks.
 * DELETE /api/chats/:id
 */
async function deleteChat(req, res) {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
        throw createServiceError("Chat not found", 404);
    }

    // Cascade delete: messages + vector chunks
    await Promise.all([
        Message.deleteMany({ chatId: req.params.id }),
        deleteByChat(req.params.id),
    ]);

    await Chat.findByIdAndDelete(req.params.id);

    syncMetadata();
    res.json({ message: "Chat deleted", id: req.params.id });
}

module.exports = {
    listChats,
    getChat,
    createChat,
    updateChat,
    deleteChat,
};
