/**
 * CORE DETECTION ROUTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Single entry-point for all detection modules.
 * 
 * Usage:
 *   const { detect } = require('./core');
 *   const result = await detect('text', { text: '...' });
 *   const result = await detect('image', { buffer, mimeType });
 *   const result = await detect('video', { buffer, mimeType });
 *   const result = await detect('profile', { platform, username, ... });
 *   const result = await detect('social_post', { platform, imageBuffer, ... });
 *   const result = await detect('whatsapp', { text });
 */

const { detectText } = require("./detectors/textDetector");
const { detectImage } = require("./detectors/imageDetector");
const { detectVideo } = require("./detectors/videoDetector");
const { detectProfile } = require("./detectors/profileDetector");
const { detectSocialPost } = require("./detectors/socialPostDetector");
const { detectWhatsApp } = require("./detectors/whatsappDetector");

const SUPPORTED_TYPES = ["text", "image", "video", "profile", "social_post", "whatsapp"];

/**
 * Main detection dispatcher.
 * @param {string} type      - One of SUPPORTED_TYPES
 * @param {object} payload   - Detector-specific input (see individual detector docs)
 * @returns {Promise<object>} - Standardised Verdict object
 */
async function detect(type, payload) {
    switch (type) {
        case "text":
            return detectText(payload);

        case "image":
            return detectImage(payload);

        case "video":
            return detectVideo(payload);

        case "profile":
            return detectProfile(payload);

        case "social_post":
        case "instagram":
        case "facebook":
            // Allow shorthand aliases for social platforms
            if (!payload.platform && (type === "instagram" || type === "facebook")) {
                payload.platform = type;
            }
            return detectSocialPost(payload);

        case "whatsapp":
            return detectWhatsApp(payload);

        default:
            return {
                type: "unknown",
                verdict: "ERROR",
                trustScore: null,
                confidence: "NONE",
                summary: `Unknown detection type: "${type}". Supported types: ${SUPPORTED_TYPES.join(", ")}`,
                flags: [],
                details: { supportedTypes: SUPPORTED_TYPES },
                analyzedAt: new Date().toISOString(),
            };
    }
}

module.exports = { detect, SUPPORTED_TYPES };
