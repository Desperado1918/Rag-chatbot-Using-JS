// ============================================================================
// models/RefreshToken.js — Refresh Token Schema
// ============================================================================
// Stores SHA-256 hashed refresh tokens in MongoDB.
// Uses a TTL index on `expiresAt` so expired tokens are automatically pruned.
// ============================================================================

const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        token: {
            type: String,
            required: true,
            unique: true,
        }, // SHA-256 hash of the raw token
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        }, // MongoDB TTL auto-delete
        revoked: {
            type: Boolean,
            default: false,
        },
        userAgent: { type: String },
        ip: { type: String },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
