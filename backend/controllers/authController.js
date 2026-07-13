// ============================================================================
// controllers/authController.js — Authentication Controller
// ============================================================================
// Thin controller layer. Extracts request data, calls authService, and sets
// httpOnly cookies + CSRF cookie in the response.
//
// Tokens are NEVER returned in the JSON body — only via Set-Cookie headers.
// ============================================================================

const authService = require("../services/authService");
const config = require("../config");

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const IS_PRODUCTION = config.nodeEnv === "production";

/** Base options shared by all auth cookies. */
const baseCookieOpts = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
};

/** Set access + refresh + CSRF cookies on the response. */
function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
    // Access token — short-lived, sent on every request
    res.cookie("accessToken", accessToken, {
        ...baseCookieOpts,
        maxAge: config.auth.accessTokenExpiryMs,
        path: "/",
    });

    // Refresh token — long-lived, scoped to auth endpoints only
    res.cookie("refreshToken", refreshToken, {
        ...baseCookieOpts,
        maxAge: config.auth.refreshTokenExpiryMs,
        path: "/api/auth",
    });

    // CSRF token — readable by JavaScript (NOT httpOnly)
    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,          // JS must be able to read this
        secure: IS_PRODUCTION,
        sameSite: "strict",
        maxAge: config.auth.refreshTokenExpiryMs, // lives as long as refresh
        path: "/",
    });
}

/** Clear all auth cookies (used on logout and reuse detection). */
function clearAuthCookies(res) {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.clearCookie("csrf_token", { path: "/" });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/signup
 */
async function signup(req, res) {
    const { email, password, username } = req.body;
    const result = await authService.signup({ email, password, username });
    res.status(201).json(result);
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
    const { email, password, captchaToken } = req.body;
    const userAgent = req.headers["user-agent"];
    const ip = req.ip;

    const result = await authService.login({
        email,
        password,
        captchaToken,
        userAgent,
        ip,
    });

    // Set tokens in httpOnly cookies — NOT in the JSON body
    setAuthCookies(res, result);

    res.status(200).json({
        message: "Login successful",
        user: result.user,
    });
}

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res) {
    const refreshToken = req.cookies && req.cookies.refreshToken;
    const userAgent = req.headers["user-agent"];
    const ip = req.ip;

    try {
        const result = await authService.refreshTokens({
            refreshToken,
            userAgent,
            ip,
        });

        setAuthCookies(res, result);

        res.status(200).json({
            message: "Tokens refreshed",
            user: result.user,
        });
    } catch (err) {
        // On reuse detection or any failure, clear cookies
        clearAuthCookies(res);
        throw err; // re-throw for centralized error handler
    }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
    const refreshToken = req.cookies && req.cookies.refreshToken;

    await authService.logout(refreshToken);
    clearAuthCookies(res);

    res.status(200).json({ message: "Logged out" });
}

/**
 * GET /api/auth/verify/:token
 */
async function verifyEmail(req, res) {
    const { token } = req.params;
    const result = await authService.verifyEmail(token);
    res.status(200).json(result);
}

/**
 * GET /api/auth/me
 */
async function getCurrentUser(req, res) {
    const result = await authService.getCurrentUser(req.user.id);
    res.status(200).json(result);
}

module.exports = {
    signup,
    login,
    refresh,
    logout,
    verifyEmail,
    getCurrentUser,
};
