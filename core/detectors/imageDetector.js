/**
 * IMAGE DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyses images to detect:
 *   • AI-generated imagery (Midjourney, DALL-E, Stable Diffusion, etc.)
 *   • Photo manipulation (splicing, cloning, lighting inconsistencies)
 *   • Deepfake faces
 *   • Screenshots of fake news/posts
 *   • Contextual mismatch (image used in wrong context)
 *
 * Input:
 *   { buffer: Buffer, mimeType: string }  — from file upload
 *   OR
 *   { url: string }                       — from image URL
 *
 * Output: standardised Verdict object
 */

const { getVisionModel, bufferToInlinePart, urlToInlinePart } = require("../utils/geminiClient");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");

const SYSTEM_PROMPT = `
You are a forensic image analyst and AI-generated content detection expert.

Examine the provided image carefully and return ONLY a valid JSON object (no markdown, no extra text) with exactly this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | LIKELY_AI | MANIPULATED | DEEPFAKE>",
  "trustScore": <integer 0-100, where 100 means image is likely genuine/unmodified>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "aiGeneratedProbability": <0-100>,
    "manipulationProbability": <0-100>,
    "deepfakeProbability": <0-100>,
    "visualArtifacts": ["<artifact1>", "<artifact2>"],
    "lightingConsistency": "<CONSISTENT | INCONSISTENT | SUSPICIOUS>",
    "backgroundAnalysis": "<description of background for context>",
    "faceAnalysis": "<NONE | AUTHENTIC | SUSPICIOUS | LIKELY_DEEPFAKE>",
    "metadataClues": ["<clue1>", "<clue2>"],
    "contentCategory": "<PHOTO | ILLUSTRATION | SCREENSHOT | INFOGRAPHIC | MEME | DOCUMENT>"
  }
}

Detection guidelines:
- AI-generated images often have: perfect symmetry, unrealistic skin texture, floating/merged objects, impossible backgrounds, distorted text, extra fingers/limbs
- Manipulated photos show: lighting inconsistencies, noise level mismatches, blurring around pasted objects, unnatural shadows
- Deepfakes show: face boundary blurring, eye reflection inconsistencies, hair edge artifacts
- Screenshots of faked social posts: look for font inconsistencies, cut-off text, mismatched UI elements
- trustScore 0-25 → very likely manipulated/AI
- trustScore 26-55 → suspicious, needs scrutiny
- trustScore 56-80 → probably authentic with minor concerns
- trustScore 81-100 → appears authentic
`;

/**
 * @param {object} input
 * @param {Buffer} [input.buffer]    - Image buffer from upload
 * @param {string} [input.mimeType] - MIME type e.g. "image/jpeg"
 * @param {string} [input.url]       - Alternatively, image URL
 * @returns {Promise<object>}         - Verdict object
 */
async function detectImage({ buffer, mimeType, url }) {
    try {
        const model = getVisionModel();

        let imagePart;
        if (buffer) {
            if (!mimeType) throw new Error("mimeType is required when providing an image buffer.");
            imagePart = bufferToInlinePart(buffer, mimeType);
        } else if (url) {
            // Attempt to detect mime type from URL extension
            const ext = url.split("?")[0].split(".").pop().toLowerCase();
            const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
            const detectedMime = mimeMap[ext] || "image/jpeg";
            imagePart = await urlToInlinePart(url, detectedMime);
        } else {
            throw new Error("Provide either a buffer+mimeType or a url.");
        }

        const result = await model.generateContent([SYSTEM_PROMPT, imagePart]);
        const rawText = result.response.text();
        const parsed = parseGeminiJSON(rawText);

        return buildVerdict({
            type: "image",
            verdict: parsed.verdict,
            trustScore: parsed.trustScore,
            confidence: parsed.confidence,
            summary: parsed.summary,
            flags: parsed.flags || [],
            details: {
                ...parsed.details,
                sourceUrl: url || null,
            },
        });
    } catch (err) {
        return buildErrorVerdict("image", err);
    }
}

module.exports = { detectImage };
