/**
 * SOCIAL POST DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyses Instagram and Facebook posts (screenshot or text+metadata) to detect:
 *   • Fake / fabricated posts
 *   • Screenshots of posts that have been altered
 *   • Misleading captions
 *   • Out-of-context imagery
 *   • Coordinated inauthentic engagement
 *   • Hate speech / disinformation campaigns
 *
 * Input modes:
 *   Mode A — Screenshot: { imageBuffer: Buffer, mimeType: string, platform: string }
 *   Mode B — Text data:  { caption: string, username?: string, likes?: number,
 *                          comments?: number, shares?: number, platform: string,
 *                          imageBuffer?: Buffer, mimeType?: string }
 */

const { getVisionModel, getTextModel, bufferToInlinePart, urlToInlinePart } = require("../utils/geminiClient");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");

const SCREENSHOT_PROMPT = (platform) => `
You are a social media authenticity expert specialising in detecting fake or manipulated ${platform} posts.

Examine this screenshot and return ONLY a valid JSON object (no markdown) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | FAKE | MANIPULATED | OUT_OF_CONTEXT>",
  "trustScore": <integer 0-100, 100 = very likely genuine unmodified post>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "manipulationProbability": <0-100>,
    "uiAuthenticity": "<AUTHENTIC | SUSPICIOUS | FAKE_UI>",
    "fontConsistency": "<CONSISTENT | INCONSISTENT>",
    "engagementPlausibility": "<PLAUSIBLE | SUSPICIOUS | IMPOSSIBLE>",
    "captionAnalysis": "<brief analysis>",
    "visualContentAnalysis": "<brief analysis of any images in the post>",
    "platformUIMatch": "<matches expected ${platform} UI | doesn't match | partially matches>",
    "editingArtifacts": ["<artifact1>", "<artifact2>"],
    "contentConcerns": ["<concern1>", "<concern2>"]
  }
}

Look for:
- Font inconsistencies (different weights/sizes in same UI element)
- Unusual engagement numbers (e.g. 847K likes with only 5 comments)
- UI elements that don't match the platform's current design
- Text that appears pasted over the original
- Color/brightness artifacts around edited areas
- Profile name/handle inconsistencies
- Timestamp anomalies
`;

const TEXT_PROMPT = (platform, data) => `
You are a social media authenticity expert specialising in detecting fake or manipulated ${platform} posts.

Analyse the following post data and return ONLY a valid JSON object (no markdown) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | FAKE | MANIPULATED | OUT_OF_CONTEXT | DISINFORMATION>",
  "trustScore": <integer 0-100, 100 = very likely genuine credible post>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "disinformationProbability": <0-100>,
    "sentimentCategory": "<NEUTRAL | POSITIVE | NEGATIVE | INFLAMMATORY | HATE_SPEECH>",
    "engagementPlausibility": "<PLAUSIBLE | SUSPICIOUS | IMPOSSIBLE>",
    "captionRedFlags": ["<flag1>", "<flag2>"],
    "claimsToFactCheck": ["<claim1>", "<claim2>"],
    "manipulationTactics": ["<tactic1>", "<tactic2>"],
    "harmfulContentTypes": ["<type1>", "<type2>"]
  }
}

Post data:
${JSON.stringify(data, null, 2)}
`;

/**
 * @param {object} input
 * @param {string} input.platform           - "instagram" | "facebook" | "twitter"
 * @param {Buffer} [input.imageBuffer]      - Screenshot buffer
 * @param {string} [input.mimeType]         - MIME of the screenshot
 * @param {string} [input.caption]          - Post caption text
 * @param {string} [input.username]         - Poster username
 * @param {number} [input.likes]
 * @param {number} [input.comments]
 * @param {number} [input.shares]
 * @returns {Promise<object>}                - Verdict
 */
async function detectSocialPost(input) {
    try {
        const platform = input.platform || "social media";

        // Mode A: Screenshot provided
        if (input.imageBuffer && input.mimeType) {
            const model = getVisionModel();
            const imgPart = bufferToInlinePart(input.imageBuffer, input.mimeType);
            const result = await model.generateContent([SCREENSHOT_PROMPT(platform), imgPart]);
            const rawText = result.response.text();
            const parsed = parseGeminiJSON(rawText);

            return buildVerdict({
                type: "social_post",
                verdict: parsed.verdict,
                trustScore: parsed.trustScore,
                confidence: parsed.confidence,
                summary: parsed.summary,
                flags: parsed.flags || [],
                details: { ...parsed.details, platform, analysisMode: "screenshot" },
            });
        }

        // Mode B: Text/metadata provided
        if (input.caption || input.username) {
            const postData = {
                platform,
                username: input.username,
                caption: input.caption,
                likes: input.likes,
                comments: input.comments,
                shares: input.shares,
            };

            const model = getTextModel();
            const result = await model.generateContent(TEXT_PROMPT(platform, postData));
            const rawText = result.response.text();
            const parsed = parseGeminiJSON(rawText);

            return buildVerdict({
                type: "social_post",
                verdict: parsed.verdict,
                trustScore: parsed.trustScore,
                confidence: parsed.confidence,
                summary: parsed.summary,
                flags: parsed.flags || [],
                details: { ...parsed.details, platform, analysisMode: "text_metadata" },
            });
        }

        throw new Error("Provide either an imageBuffer+mimeType (screenshot) or caption/username text data.");
    } catch (err) {
        return buildErrorVerdict("social_post", err);
    }
}

module.exports = { detectSocialPost };
