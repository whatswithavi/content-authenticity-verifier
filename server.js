/**
 * EXPRESS REST API SERVER
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes all detection modules as REST endpoints.
 * Your frontend will call these APIs.
 *
 * Base URL: http://localhost:3001
 *
 * ENDPOINTS:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POST /api/detect/text
 *   Body (JSON): { text: string, url?: string }
 *   → Detects AI-generated text or fake news
 *
 * POST /api/detect/image
 *   Body (multipart/form-data): file (image), OR JSON: { url: string }
 *   → Detects AI-generated or manipulated images
 *
 * POST /api/detect/video
 *   Body (multipart/form-data): file (video), OR JSON: { url: string }
 *   → Detects deepfakes and manipulated video
 *
 * POST /api/detect/profile
 *   Body (JSON): { platform, username, bio?, followerCount?, ... }
 *   Also accepts optional multipart with profilePicture file
 *   → Detects fake/bot social media profiles
 *
 * POST /api/detect/social-post
 *   Body (multipart/form-data): screenshot file + optional JSON fields
 *   OR JSON: { platform, caption, username, likes?, comments?, shares? }
 *   → Detects fake Instagram/Facebook posts
 *
 * POST /api/detect/whatsapp
 *   Body (JSON): { text: string }
 *   OR multipart/form-data: screenshot file
 *   → Detects fake forwarded WhatsApp messages
 *
 * GET /api/health
 *   → Health check
 *
 * GET /api/supported-types
 *   → List of all supported detection types
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { detect, SUPPORTED_TYPES } = require("./core");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Multer: store uploads in memory (we pass Buffer to detectors)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for video
});

// ─── Utility ─────────────────────────────────────────────────────────────────
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// ─── Root Route ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        service: "Content Authenticity Verifier API",
        version: "1.0.0",
        status: "running",
        docs: {
            health: "/api/health",
            supportedTypes: "/api/supported-types",
            endpoints: [
                "POST /api/detect/text",
                "POST /api/detect/image",
                "POST /api/detect/video",
                "POST /api/detect/profile",
                "POST /api/detect/social-post",
                "POST /api/detect/instagram",
                "POST /api/detect/facebook",
                "POST /api/detect/whatsapp",
            ],
        },
    });
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Content Authenticity Verifier API",
        version: "1.0.0",
        geminiKeySet: !!process.env.GEMINI_API_KEY,
        supportedTypes: SUPPORTED_TYPES,
        timestamp: new Date().toISOString(),
    });
});

app.get("/api/supported-types", (req, res) => {
    res.json({ supportedTypes: SUPPORTED_TYPES });
});

// ─── TEXT DETECTION ──────────────────────────────────────────────────────────
app.post(
    "/api/detect/text",
    asyncHandler(async (req, res) => {
        const { text, url } = req.body;
        if (!text) return res.status(400).json({ error: "Missing required field: text" });
        const result = await detect("text", { text, url });
        res.json(result);
    })
);

// ─── IMAGE DETECTION ─────────────────────────────────────────────────────────
app.post(
    "/api/detect/image",
    upload.single("file"),
    asyncHandler(async (req, res) => {
        if (req.file) {
            const result = await detect("image", {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
            });
            return res.json(result);
        }

        const { url } = req.body;
        if (url) {
            const result = await detect("image", { url });
            return res.json(result);
        }

        res.status(400).json({ error: "Provide either a file upload or a url in the request body." });
    })
);

// ─── VIDEO DETECTION ─────────────────────────────────────────────────────────
app.post(
    "/api/detect/video",
    upload.single("file"),
    asyncHandler(async (req, res) => {
        if (req.file) {
            const result = await detect("video", {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                filename: req.file.originalname,
            });
            return res.json(result);
        }

        const { url } = req.body;
        if (url) {
            const result = await detect("video", { url });
            return res.json(result);
        }

        res.status(400).json({ error: "Provide either a file upload or a url in the request body." });
    })
);

// ─── PROFILE DETECTION ───────────────────────────────────────────────────────
app.post(
    "/api/detect/profile",
    upload.single("profilePicture"),
    asyncHandler(async (req, res) => {
        // Body can be JSON string fields mixed with file upload via multipart
        const payload = typeof req.body === "object" ? req.body : {};

        // Parse numeric fields
        ["followerCount", "followingCount", "postCount", "engagementRate"].forEach((key) => {
            if (payload[key] !== undefined) payload[key] = Number(payload[key]);
        });

        // Parse boolean fields
        if (payload.verified !== undefined) payload.verified = payload.verified === "true" || payload.verified === true;

        // Parse array fields sent as JSON strings
        ["recentPosts", "externalLinks"].forEach((key) => {
            if (typeof payload[key] === "string") {
                try { payload[key] = JSON.parse(payload[key]); } catch { }
            }
        });

        // Attach profile picture buffer if provided
        if (req.file) {
            payload.profilePictureBuffer = req.file.buffer;
            payload.profilePictureMimeType = req.file.mimetype;
        }

        if (!payload.username) {
            return res.status(400).json({ error: "Missing required field: username" });
        }

        const result = await detect("profile", payload);
        res.json(result);
    })
);

// ─── SOCIAL POST DETECTION (Instagram / Facebook) ───────────────────────────
app.post(
    "/api/detect/social-post",
    upload.single("screenshot"),
    asyncHandler(async (req, res) => {
        const payload = typeof req.body === "object" ? { ...req.body } : {};

        // Parse numeric fields
        ["likes", "comments", "shares"].forEach((key) => {
            if (payload[key] !== undefined) payload[key] = Number(payload[key]);
        });

        if (req.file) {
            payload.imageBuffer = req.file.buffer;
            payload.mimeType = req.file.mimetype;
        }

        const result = await detect("social_post", payload);
        res.json(result);
    })
);

// Alias routes for convenience
app.post("/api/detect/instagram", upload.single("screenshot"), asyncHandler(async (req, res) => {
    const payload = { ...req.body, platform: "instagram" };
    if (req.file) { payload.imageBuffer = req.file.buffer; payload.mimeType = req.file.mimetype; }
    ["likes", "comments", "shares"].forEach((k) => { if (payload[k]) payload[k] = Number(payload[k]); });
    const result = await detect("social_post", payload);
    res.json(result);
}));

app.post("/api/detect/facebook", upload.single("screenshot"), asyncHandler(async (req, res) => {
    const payload = { ...req.body, platform: "facebook" };
    if (req.file) { payload.imageBuffer = req.file.buffer; payload.mimeType = req.file.mimetype; }
    ["likes", "comments", "shares"].forEach((k) => { if (payload[k]) payload[k] = Number(payload[k]); });
    const result = await detect("social_post", payload);
    res.json(result);
}));

// ─── WHATSAPP DETECTION ───────────────────────────────────────────────────────
app.post(
    "/api/detect/whatsapp",
    upload.single("screenshot"),
    asyncHandler(async (req, res) => {
        if (req.file) {
            const result = await detect("whatsapp", {
                imageBuffer: req.file.buffer,
                mimeType: req.file.mimetype,
            });
            return res.json(result);
        }

        const { text, imageUrl } = req.body;

        if (!text && !imageUrl) {
            return res.status(400).json({
                error: "Provide either a screenshot file, text, or imageUrl.",
            });
        }

        const result = await detect("whatsapp", { text, imageUrl });
        res.json(result);
    })
);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("[Server Error]", err);
    res.status(500).json({
        verdict: "ERROR",
        summary: "Internal server error during analysis.",
        error: err.message || String(err),
    });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🛡️  Content Authenticity Verifier API`);
    console.log(`   Running at: http://localhost:${PORT}`);
    console.log(`   Health:     http://localhost:${PORT}/api/health`);
    console.log(`   Gemini key: ${process.env.GEMINI_API_KEY ? "✅ SET" : "❌ NOT SET — add to .env"}`);
    console.log(`\n   Endpoints:`);
    console.log(`   POST /api/detect/text`);
    console.log(`   POST /api/detect/image`);
    console.log(`   POST /api/detect/video`);
    console.log(`   POST /api/detect/profile`);
    console.log(`   POST /api/detect/social-post`);
    console.log(`   POST /api/detect/instagram`);
    console.log(`   POST /api/detect/facebook`);
    console.log(`   POST /api/detect/whatsapp\n`);
});

module.exports = app;
