const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

if (!process.env.GEMINI_API_KEY) {
    console.warn(
        "[GeminiClient] WARNING: GEMINI_API_KEY not set. Copy .env.example to .env and add your key."
    );
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Returns a Gemini text model (gemini-2.0-flash-lite)
 */
function getTextModel() {
    return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
}

/**
 * Returns a Gemini multimodal model (gemini-2.0-flash-lite) capable of
 * handling images/video frames alongside text.
 */
function getVisionModel() {
    return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
}

/**
 * Helper: Converts a local Buffer to a Gemini-compatible inlinePart.
 * @param {Buffer} buffer
 * @param {string} mimeType  e.g. "image/jpeg"
 */
function bufferToInlinePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType,
        },
    };
}

/**
 * Helper: Converts a URL to a Gemini-compatible inlinePart by fetching the bytes.
 * @param {string} url
 * @param {string} mimeType
 */
async function urlToInlinePart(url, mimeType) {
    const axios = require("axios");
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    return bufferToInlinePart(buffer, mimeType);
}

module.exports = { getTextModel, getVisionModel, bufferToInlinePart, urlToInlinePart, retryWithBackoff };

/**
 * Wraps an async Gemini call with automatic exponential backoff on 429 errors.
 * @param {Function} fn         - Async function to call
 * @param {number}   maxRetries - Max number of retries (default 3)
 */
async function retryWithBackoff(fn, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const is429 = err?.message?.includes("429") || err?.message?.includes("Too Many Requests");
            const isRetryable = is429 || err?.message?.includes("503") || err?.message?.includes("overloaded");
            if (!isRetryable || attempt === maxRetries) throw err;

            // Extract retry-after from error message if available
            const retryMatch = err.message.match(/retryDelay.*?(\d+)s/);
            const waitSec = retryMatch ? parseInt(retryMatch[1]) + 2 : Math.pow(2, attempt + 1) * 3;
            console.warn(`[Gemini] Rate limit hit. Retrying in ${waitSec}s... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
    }
    throw lastError;
}
