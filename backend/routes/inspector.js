// ============================================================================
// routes/inspector.js — Pipeline Inspector Routing
// ============================================================================

const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const config = require("../config");
const ctrl = require("../controllers/inspectorController");

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.documents.uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `inspector-${uniqueSuffix}${ext}`);
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed"), false);
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
});

const router = Router();

// File operations
router.post("/upload", upload.single("pdf"), ctrl.uploadFile);
router.get("/files", ctrl.listFiles);
router.delete("/files/:id", ctrl.deleteFile);

// Pipeline Ingestion (SSE stream)
// GET is required because EventSource is GET-only; POST kept for programmatic use
router.get("/ingest", ctrl.ingestFileStream);
router.post("/ingest", ctrl.ingestFileStream);

// Sandbox query (SSE stream)
router.post("/query", ctrl.querySandbox);

module.exports = router;
