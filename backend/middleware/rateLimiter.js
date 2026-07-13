// ============================================================================
// middleware/rateLimiter.js — Rate Limit Configurations
// ============================================================================
// Provides two limiters:
//   authLimiter    — tight limit on login / signup endpoints
//   generalLimiter — broader limit for all API routes
// ============================================================================

const rateLimit = require("express-rate-limit");

/**
 * Auth-specific rate limiter.
 * 15 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    standardHeaders: true,    // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,
    message: {
        error: "Too many requests — please try again later",
        code: "RATE_LIMIT_EXCEEDED",
    },
});

/**
 * General API rate limiter.
 * 100 requests per 15-minute window per IP.
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many requests — please try again later",
        code: "RATE_LIMIT_EXCEEDED",
    },
});

module.exports = { authLimiter, generalLimiter };
