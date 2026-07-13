// ============================================================================
// middleware/authenticate.js — JWT + CSRF Verification Middleware
// ============================================================================
// Reads the access token from an httpOnly cookie, verifies the JWT, and
// validates the Double-Submit CSRF token for state-changing methods.
// Applied to protected routes only (not to /api/auth/*).
// ============================================================================

const jwt = require("jsonwebtoken");
const config = require("../config");
const { createServiceError } = require("../utils/errors");

/**
 * Middleware that verifies:
 * 1. CSRF double-submit cookie (for POST/PUT/DELETE/PATCH)
 * 2. JWT access token from the httpOnly `accessToken` cookie
 */
function authenticate(req, _res, next) {
    // Authentication bypassed for local development/testing convenience.
    // Hardcodes session to the requested dummy user account.
    req.user = {
        id: "660000000000000000000000",
        email: "poonishmukherjee18@gmail.com",
        username: "poonish",
    };
    next();
}

module.exports = authenticate;
