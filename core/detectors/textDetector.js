/**
 * TEXT DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyses raw text (articles, news, statements) to determine:
 *   • Whether the text was likely written by an AI
 *   • Whether the factual claims appear credible or fabricated
 *   • Linguistic manipulation patterns (sensationalism, bias, hate-bait)
 *
 * Input:
 *   { text: string, url?: string }
 *
 * Output: standardised Verdict object
 */

const { getTextModel } = require("../utils/geminiClient");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");

const SYSTEM_PROMPT = `
You are an expert content authenticity analyst specialising in detecting:
1. AI-generated text (ChatGPT, Claude, Gemini etc.)
2. Fake news and misinformation
3. Manipulated or fabricated quotes
4. Sensationalist / clickbait writing
5. Propaganda and coordinated inauthentic behaviour patterns

Analyse the provided text and return ONLY a valid JSON object (no markdown, no explanation) with exactly this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | FAKE | LIKELY_AI | MANIPULATED>",
  "trustScore": <integer 0-100, where 100 means fully trustworthy>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "aiGeneratedProbability": <0-100>,
    "fakeNewsProbability": <0-100>,
    "sentimentBias": "<NEUTRAL | POSITIVE | NEGATIVE | EXTREME_NEGATIVE | EXTREME_POSITIVE>",
    "writingStyle": "<HUMAN | AI_LIKE | MIXED>",
    "linguisticPatterns": ["<pattern1>", "<pattern2>"],
    "factualConcerns": ["<concern1>", "<concern2>"],
    "credibilityIndicators": ["<indicator1>", "<indicator2>"]
  }
}

Rules:
- trustScore of 0-30 → likely FAKE or MANIPULATED
- trustScore of 31-60 → SUSPICIOUS
- trustScore of 61-85 → borderline, use SUSPICIOUS or AUTHENTIC depending on specifics
- trustScore of 86-100 → AUTHENTIC
- If the text reads like a typical AI completion (repetitive phrases, no first-person anecdotes, generic hedging), flag it as LIKELY_AI
- Be concise in flags and details – max 5 items each array
`;

/**
 * @param {object} input
 * @param {string} input.text   - The raw text content to analyse
 * @param {string} [input.url]  - Optional source URL for context
 * @returns {Promise<object>}   - Verdict object
 */
async function detectText({ text, url }) {
    try {
        if (!text || text.trim().length < 20) {
            throw new Error("Text is too short to analyse (minimum 20 characters).");
        }

        const model = getTextModel();

        const userContent = url
            ? `Source URL: ${url}\n\nContent to analyse:\n\"\"\"\n${text.slice(0, 8000)}\n\"\"\"`
            : `Content to analyse:\n\"\"\"\n${text.slice(0, 8000)}\n\"\"\"`;

        const result = await model.generateContent([SYSTEM_PROMPT, userContent]);
        const rawText = result.response.text();
        const parsed = parseGeminiJSON(rawText);

        return buildVerdict({
            type: "text",
            verdict: parsed.verdict,
            trustScore: parsed.trustScore,
            confidence: parsed.confidence,
            summary: parsed.summary,
            flags: parsed.flags || [],
            details: {
                ...parsed.details,
                sourceUrl: url || null,
                characterCount: text.length,
                wordCount: text.trim().split(/\s+/).length,
            },
        });
    } catch (err) {
        return buildErrorVerdict("text", err);
    }
}

module.exports = { detectText };
