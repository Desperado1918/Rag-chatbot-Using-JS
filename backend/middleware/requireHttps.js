// ============================================================================
// middleware/requireHttps.js — HTTPS Enforcement
// ============================================================================
// In production, rejects any request that did not arrive over HTTPS.
// Checks both req.secure (direct TLS) and x-forwarded-proto (reverse proxy).
// In non-production environments this middleware is a no-op.
// ============================================================================

const config = require("../config");
const { createServiceError } = require("../utils/errors");

function requireHttps(req, _res, next) {
    if (config.nodeEnv !== "production") {
        return next(); // skip in development / test
    }

    const isSecure =
        req.secure || req.headers["x-forwarded-proto"] === "https";

    if (!isSecure) {
        return next(createServiceError("HTTPS required", 403));
    }

    next();
}

module.exports = requireHttps;
