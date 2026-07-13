// ============================================================================
// routes/auth.js — Authentication Routes
// ============================================================================
// All auth endpoints. Rate-limited via authLimiter.
// Zod validation applied before each handler.
// ============================================================================

const express = require("express");
const { z } = require("zod");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const authController = require("../controllers/authController");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const signupSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must be at most 128 characters"),
    username: z.string().min(2).max(50).optional(),
});

const loginSchema = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
    captchaToken: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /api/auth/signup
router.post(
    "/signup",
    authLimiter,
    validate(signupSchema),
    authController.signup
);

// POST /api/auth/login
router.post(
    "/login",
    authLimiter,
    validate(loginSchema),
    authController.login
);

// POST /api/auth/refresh
// No body validation needed — refresh token comes from cookie
router.post("/refresh", authController.refresh);

// POST /api/auth/logout
router.post("/logout", authController.logout);

// GET /api/auth/verify/:token
router.get("/verify/:token", authController.verifyEmail);

// GET /api/auth/me
router.get("/me", authenticate, authController.getCurrentUser);

module.exports = router;
