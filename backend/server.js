// ============================================================================
// server.js — Express 5 Application Entry Point
// ============================================================================
// Sets up the Express app with:
//   - helmet security headers
//   - pino structured logging
//   - CORS
//   - cookie-parser (httpOnly auth cookies)
//   - HTTPS enforcement (production)
//   - Rate limiting
//   - Static file serving for the vanilla JS frontend
//   - Clean route mounting matching the spec API surface
//   - Centralized error handling (Express 5 async-friendly)
//   - Health check endpoint surfacing memory-server status
// ============================================================================

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const pino = require("pino");
const pinoHttp = require("pino-http");
const config = require("./config");
const { connectDatabase, isDatabaseConnected, isUsingMemoryServer } = require("./db/connection");
const errorHandler = require("./middleware/errorHandler");
const requireHttps = require("./middleware/requireHttps");
const { generalLimiter } = require("./middleware/rateLimiter");
const authenticate = require("./middleware/authenticate");

// Route imports
const chatRoutes = require("./routes/chats");
const searchRoutes = require("./routes/search");
const debugRoutes = require("./routes/debug");
const documentRoutes = require("./routes/documents");
const messageRoutes = require("./routes/messages");
const inspectorRoutes = require("./routes/inspector");
const authRoutes = require("./routes/auth");

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
const logger = pino({
    level: config.log.level,
    transport: config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
        : undefined,
});

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------
const app = express();

// Middleware — order matters
app.use(helmet({
    contentSecurityPolicy: false,
}));                      // Security headers (HSTS, CSP, etc.)
app.use(requireHttps);                  // Reject HTTP in production
app.use(cors());
app.use(cookieParser());                // Parse Cookie headers (auth cookies)
app.use(express.json({ limit: "10mb" }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
app.use("/api", generalLimiter);        // Rate limit all API routes

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Ensure uploads directory exists
const fs = require("fs");
const uploadsDir = path.resolve(config.documents.uploadDir);
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/chats", authenticate, chatRoutes);
app.use("/api/search", authenticate, searchRoutes);
app.use("/api/debug", authenticate, debugRoutes);
app.use("/api/documents", authenticate, documentRoutes);
app.use("/api/inspector", authenticate, inspectorRoutes);
app.use("/api", authenticate, messageRoutes);

// Health check — surfaces database status including memory-server fallback
app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: {
            connected: isDatabaseConnected(),
            usingMemoryServer: isUsingMemoryServer(),
        },
        environment: config.nodeEnv,
        chatProvider: config.chatProvider,
        embeddingModel: config.embedding.model,
    });
});

// Serve index.html for the root route
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ---------------------------------------------------------------------------
// Centralized Error Handler (must be last middleware)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------
async function startServer() {
    // --- JWT secret guard ---------------------------------------------------
    if (!config.auth.jwtSecret) {
        if (config.nodeEnv === "production") {
            logger.fatal("[Startup] JWT_SECRET is not set — refusing to start in production.");
            process.exit(1);
        }
        // Generate a random secret for development convenience
        const crypto = require("crypto");
        config.auth.jwtSecret = crypto.randomBytes(64).toString("hex");
        logger.warn("[Startup] JWT_SECRET not set — generated a random one for this session (dev only).");
    }

    try {
        await connectDatabase();
        logger.info("[Startup] MongoDB connected.");

        // --- Seed dummy user ----------------------------------------------------
        const User = require("./models/User");
        const bcrypt = require("bcrypt");
        const seedUserEmail = "poonishmukherjee18@gmail.com";
        const existingSeedUser = await User.findOne({ email: seedUserEmail });
        if (!existingSeedUser) {
            const passwordHash = await bcrypt.hash("1918", 12);
            await User.create({
                username: "poonish",
                email: seedUserEmail,
                passwordHash,
                isVerified: true
            });
            logger.info(`[Startup] Seeded dummy user: ${seedUserEmail} / 1918`);
        }
    } catch (error) {
        logger.fatal({ err: error }, "[Startup] MongoDB connection failed fatally.");
        process.exit(1);
    }

    app.listen(config.port, () => {
        logger.info(`Server running on http://localhost:${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Chat provider: ${config.chatProvider} (${config.ollama.chatModel})`);
        logger.info(`Embedding model: ${config.embedding.model} (in-process)`);

        if (isUsingMemoryServer()) {
            logger.warn("⚠ Running on in-memory database — data will NOT persist across restarts!");
        }
    });
}

startServer();
