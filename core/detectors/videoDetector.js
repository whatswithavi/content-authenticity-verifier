/**
 * VIDEO DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyses video files to detect:
 *   • Deepfake faces / voice
 *   • Context manipulation (real video used in wrong context)
 *   • Spliced/edited footage
 *   • AI-generated video content (Sora, Runway, etc.)
 *
 * Strategy:
 *   Since Gemini 1.5 Flash supports video natively via the File API,
 *   we use the Google AI Files API to upload the video and then run
 *   multimodal analysis on it.
 *
 *  For large files, we extract key frames using canvas/ffmpeg as fallback
 *  (frame extraction requires ffmpeg to be installed on the system).
 *
 * Input:
 *   { buffer: Buffer, mimeType: string, filename?: string }
 *   OR
 *   { url: string }
 *
 * Output: standardised Verdict object
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");
require("dotenv").config();

const SYSTEM_PROMPT = `
You are a forensic video analyst and deepfake detection expert.

Carefully analyse the provided video and return ONLY a valid JSON object (no markdown, no extra text) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | DEEPFAKE | MANIPULATED | LIKELY_AI_GENERATED>",
  "trustScore": <integer 0-100, where 100 means very likely authentic>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "deepfakeProbability": <0-100>,
    "aiGeneratedProbability": <0-100>,
    "editingArtefacts": ["<artefact1>", "<artefact2>"],
    "facialAnalysis": "<NONE | AUTHENTIC | SUSPICIOUS | LIKELY_DEEPFAKE>",
    "temporalConsistency": "<CONSISTENT | INCONSISTENT | SUSPICIOUS>",
    "audioVideoSync": "<SYNCED | OUT_OF_SYNC | NO_AUDIO>",
    "contextualFlags": ["<flag1>"],
    "contentDescription": "<brief description of what the video shows>"
  }
}

Key deepfake indicators:
- Face boundary flickering or blurring at edges
- Unnatural blinking patterns or eye movements
- Lighting inconsistency between face and background frames
- Lip-sync mismatches with audio
- Teeth/hair rendering artifacts
- Temporal jitter (face "floats" across frames)
- Background inconsistency between frames (AI generation artifacts)

trustScore guide:
- 0-25 → very likely deepfake / manipulated
- 26-55 → suspicious, multiple red flags
- 56-80 → likely authentic with minor concerns
- 81-100 → appears authentic
`;

/**
 * Uploads a video buffer to the Google AI Files API and runs analysis.
 * @param {object} input
 * @param {Buffer} [input.buffer]
 * @param {string} [input.mimeType]
 * @param {string} [input.filename]
 * @param {string} [input.url]       - URL to video (will be downloaded first)
 * @returns {Promise<object>}
 */
async function detectVideo({ buffer, mimeType, filename, url }) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

        let videoBuffer = buffer;
        let videoMime = mimeType || "video/mp4";

        // If a URL is provided, download it first
        if (!videoBuffer && url) {
            const axios = require("axios");
            const resp = await axios.get(url, { responseType: "arraybuffer" });
            videoBuffer = Buffer.from(resp.data);
            const ext = url.split("?")[0].split(".").pop().toLowerCase();
            const mimeMap = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo" };
            videoMime = mimeMap[ext] || "video/mp4";
        }

        if (!videoBuffer) throw new Error("Provide either a buffer or a url for video analysis.");

        // Write buffer to a temp file so we can use the Files API
        const tmpPath = path.join(os.tmpdir(), `cav_video_${Date.now()}.${videoMime.split("/")[1] || "mp4"}`);
        fs.writeFileSync(tmpPath, videoBuffer);

        // Upload to Gemini Files API
        const { GoogleAIFileManager } = require("@google/generative-ai/server");
        const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY || "");

        const uploadResult = await fileManager.uploadFile(tmpPath, {
            mimeType: videoMime,
            displayName: filename || `video_${Date.now()}`,
        });

        // Wait until the file is ACTIVE (processed)
        let file = uploadResult.file;
        while (file.state === "PROCESSING") {
            await new Promise((r) => setTimeout(r, 2000));
            file = await fileManager.getFile(file.name);
        }

        if (file.state !== "ACTIVE") {
            throw new Error(`Video processing failed with state: ${file.state}`);
        }

        // Run analysis
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        const result = await model.generateContent([
            SYSTEM_PROMPT,
            {
                fileData: {
                    fileUri: file.uri,
                    mimeType: videoMime,
                },
            },
        ]);

        // Cleanup temp file
        try { fs.unlinkSync(tmpPath); } catch { }
        // Delete file from Files API (cleanup)
        try { await fileManager.deleteFile(file.name); } catch { }

        const rawText = result.response.text();
        const parsed = parseGeminiJSON(rawText);

        return buildVerdict({
            type: "video",
            verdict: parsed.verdict,
            trustScore: parsed.trustScore,
            confidence: parsed.confidence,
            summary: parsed.summary,
            flags: parsed.flags || [],
            details: {
                ...parsed.details,
                sourceUrl: url || null,
                fileSizeMB: (videoBuffer.length / 1024 / 1024).toFixed(2),
            },
        });
    } catch (err) {
        return buildErrorVerdict("video", err);
    }
}

module.exports = { detectVideo };
