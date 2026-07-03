// ============================================================================
// models/InspectorDocument.js — Document Schema for RAG Pipeline Inspector
// ============================================================================

const mongoose = require("mongoose");

const inspectorDocumentSchema = new mongoose.Schema(
    {
        filename: {
            type: String,
            required: true,
        },
        originalName: {
            type: String,
            required: true,
        },
        filepath: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
        },
        chunkCount: {
            type: Number,
            default: 0,
        },
        chunkingMethod: {
            type: String,
            default: "hierarchical",
        },
        fileSize: {
            type: Number,
            default: 0,
        },
        charCount: {
            type: Number,
            default: 0,
        },
        pageCount: {
            type: Number,
            default: 0,
        },
        pages: [
            {
                pageNumber: Number,
                text: String,
                charCount: Number,
            },
        ],
        logs: [
            {
                type: String,
            },
        ],
        error: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("InspectorDocument", inspectorDocumentSchema);
