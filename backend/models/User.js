// ============================================================================
// models/User.js — User Schema
// ============================================================================
// Extended with email verification, failed-login counter (triggers CAPTCHA),
// and a short secondary lockout window.
// ============================================================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: { type: String, default: null },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: { type: String, required: true },

        // Email verification
        isVerified: { type: Boolean, default: false },
        verifyToken: { type: String, default: null },   // SHA-256 hashed token
        verifyExpires: { type: Date, default: null },

        // Brute-force protection
        failedLogins: { type: Number, default: 0 },
        lockUntil: { type: Date, default: null },        // short secondary lockout (≤ 1 min)
    },
    { timestamps: true }
);

// Index for fast email lookups (already implicitly created by `unique: true`,
// but explicit for clarity)
userSchema.index({ email: 1 });

module.exports = mongoose.model("User", userSchema);
