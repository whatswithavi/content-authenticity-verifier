/**
 * WHATSAPP / FORWARDED MESSAGE DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Specialised detector for the most common vector of misinformation in South
 * Asia and globally: forwarded WhatsApp messages.
 *
 * Detects:
 *   • Health misinformation (fake medical advice, cure claims)
 *   • Religious/communal incitement content
 *   • Fake government notifications / orders
 *   • Fabricated celebrity / politician quotes
 *   • Chain messages with manipulative urgency ("forward to 10 people")
 *   • Out-of-context viral content
 *   • Screenshot of WhatsApp conversation (visual analysis)
 *
 * Input:
 *   { text?: string, imageBuffer?: Buffer, mimeType?: string, imageUrl?: string }
 *
 * The detector is tuned for Indian/South Asian context but works globally.
 */

const { getTextModel, getVisionModel, bufferToInlinePart, urlToInlinePart } = require("../utils/geminiClient");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");

const TEXT_SYSTEM_PROMPT = `
You are a fact-checking specialist with deep expertise in detecting misinformation spread via
WhatsApp, Telegram, and other messaging platforms — especially in Indian/South Asian contexts.

Analyse the following forwarded message and return ONLY a valid JSON object (no markdown) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | FAKE | DANGEROUS_MISINFORMATION | SATIRE>",
  "trustScore": <integer 0-100, 100 = very likely genuine and accurate>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "misinformationProbability": <0-100>,
    "misinformationCategory": "<HEALTH | POLITICAL | RELIGIOUS | FINANCIAL | CELEBRITY | GOVERNMENT | CHAIN_MESSAGE | NONE>",
    "urgencyManipulation": <true|false>,
    "fearTactics": <true|false>,
    "verifiableClaims": ["<claim1>", "<claim2>"],
    "redFlags": ["<flag1>", "<flag2>"],
    "languageAnalysis": "<describes tone and language patterns>",
    "recommendedAction": "<SAFE_TO_SHARE | VERIFY_BEFORE_SHARING | DO_NOT_SHARE | REPORT>",
    "factCheckSuggestions": ["<suggestion1>", "<suggestion2>"]
  }
}

Key patterns to identify:
- Medical claims without sources (e.g., "doctors don't want you to know", "this plant cures cancer")
- False urgency: "Forward to all contacts NOW", "Limited time", "Act before midnight"
- Government impersonation: fake notifications, fake PM/CM announcements
- Out-of-context historical images/videos presented as recent events
- Religious incitement targeting specific communities
- Fabricated celebrity quotes with no verifiable source
- Chain messages that promise rewards or threaten punishment for not forwarding
- Messages starting with "BREAKING:" or "IMPORTANT:" with no credible source
- "A doctor friend told me..." or "My relative who works at XYZ hospital says..."
`;

const SCREENSHOT_PROMPT = `
You are a fact-checking specialist analysing a screenshot of a WhatsApp message or conversation.

Examine this screenshot carefully and return ONLY a valid JSON object (no markdown) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | FAKE | DANGEROUS_MISINFORMATION | SATIRE>",
  "trustScore": <integer 0-100, 100 = very likely genuine and accurate>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "misinformationProbability": <0-100>,
    "misinformationCategory": "<HEALTH | POLITICAL | RELIGIOUS | FINANCIAL | CELEBRITY | GOVERNMENT | CHAIN_MESSAGE | NONE>",
    "screenshotAuthenticity": "<GENUINE_SCREENSHOT | EDITED_SCREENSHOT | FABRICATED>",
    "urgencyManipulation": <true|false>,
    "fearTactics": <true|false>,
    "extractedClaims": ["<claim1>", "<claim2>"],
    "redFlags": ["<flag1>", "<flag2>"],
    "recommendedAction": "<SAFE_TO_SHARE | VERIFY_BEFORE_SHARING | DO_NOT_SHARE | REPORT>",
    "factCheckSuggestions": ["<suggestion1>", "<suggestion2>"]
  }
}

Also check:
- Is the WhatsApp screenshot itself genuine or has it been edited?
- Look for font inconsistencies, time stamp anomalies, UI mismatches
- Is the "Forwarded" label visible? How many times was it forwarded?
`;

/**
 * @param {object} input
 * @param {string} [input.text]              - Forwarded message text
 * @param {Buffer} [input.imageBuffer]       - Screenshot of WhatsApp conversation
 * @param {string} [input.mimeType]          - MIME type of screenshot
 * @param {string} [input.imageUrl]          - URL to the screenshot
 * @returns {Promise<object>}                - Verdict
 */
async function detectWhatsApp({ text, imageBuffer, mimeType, imageUrl }) {
    try {
        // Screenshot mode (vision)
        if (imageBuffer && mimeType) {
            const model = getVisionModel();
            const imgPart = bufferToInlinePart(imageBuffer, mimeType);
            const result = await model.generateContent([SCREENSHOT_PROMPT, imgPart]);
            const rawText = result.response.text();
            const parsed = parseGeminiJSON(rawText);

            return buildVerdict({
                type: "whatsapp",
                verdict: parsed.verdict,
                trustScore: parsed.trustScore,
                confidence: parsed.confidence,
                summary: parsed.summary,
                flags: parsed.flags || [],
                details: { ...parsed.details, analysisMode: "screenshot" },
            });
        }

        // Screenshot from URL
        if (imageUrl) {
            const ext = imageUrl.split("?")[0].split(".").pop().toLowerCase();
            const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
            const detectedMime = mimeMap[ext] || "image/jpeg";
            const imgPart = await urlToInlinePart(imageUrl, detectedMime);
            const model = getVisionModel();
            const result = await model.generateContent([SCREENSHOT_PROMPT, imgPart]);
            const rawText = result.response.text();
            const parsed = parseGeminiJSON(rawText);

            return buildVerdict({
                type: "whatsapp",
                verdict: parsed.verdict,
                trustScore: parsed.trustScore,
                confidence: parsed.confidence,
                summary: parsed.summary,
                flags: parsed.flags || [],
                details: { ...parsed.details, analysisMode: "screenshot_url", sourceUrl: imageUrl },
            });
        }

        // Text mode
        if (text && text.trim().length > 5) {
            const model = getTextModel();
            const fullPrompt = `${TEXT_SYSTEM_PROMPT}\n\nForwarded message to analyse:\n"""\n${text.slice(0, 6000)}\n"""`;
            const result = await model.generateContent(fullPrompt);
            const rawText = result.response.text();
            const parsed = parseGeminiJSON(rawText);

            return buildVerdict({
                type: "whatsapp",
                verdict: parsed.verdict,
                trustScore: parsed.trustScore,
                confidence: parsed.confidence,
                summary: parsed.summary,
                flags: parsed.flags || [],
                details: {
                    ...parsed.details,
                    analysisMode: "text",
                    characterCount: text.length,
                    wordCount: text.trim().split(/\s+/).length,
                },
            });
        }

        throw new Error("Provide either text, imageBuffer+mimeType, or imageUrl.");
    } catch (err) {
        return buildErrorVerdict("whatsapp", err);
    }
}

module.exports = { detectWhatsApp };
