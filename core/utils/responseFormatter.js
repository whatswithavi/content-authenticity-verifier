/**
 * Unified verdict structure returned by every detector.
 *
 * Shape:
 * {
 *   type: string,           // "text" | "image" | "video" | "profile" | "social_post" | "whatsapp"
 *   verdict: string,        // "AUTHENTIC" | "SUSPICIOUS" | "FAKE" | "LIKELY_AI" | "MANIPULATED"
 *   trustScore: number,     // 0–100  (100 = fully trustworthy)
 *   confidence: string,     // "HIGH" | "MEDIUM" | "LOW"
 *   summary: string,        // one-sentence human readable summary
 *   flags: string[],        // list of red-flag signals detected
 *   details: object,        // detector-specific extra details
 *   analyzedAt: string,     // ISO timestamp
 * }
 */

/**
 * Parses a raw Gemini JSON string response safely.
 * Gemini sometimes wraps JSON in markdown fences – this strips them.
 */
function parseGeminiJSON(rawText) {
    // Strip markdown code fences if present
    const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        // Try to extract JSON object from within the string
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw new Error(`Could not parse Gemini response as JSON:\n${rawText}`);
    }
}

/**
 * Builds a standardised verdict object.
 */
function buildVerdict({
    type,
    verdict,
    trustScore,
    confidence,
    summary,
    flags = [],
    details = {},
}) {
    // Clamp trust score
    const clampedScore = Math.min(100, Math.max(0, Math.round(trustScore)));

    return {
        type,
        verdict,
        trustScore: clampedScore,
        confidence,
        summary,
        flags,
        details,
        analyzedAt: new Date().toISOString(),
    };
}

/**
 * Builds an error verdict when detection fails.
 */
function buildErrorVerdict(type, error) {
    return {
        type,
        verdict: "ERROR",
        trustScore: null,
        confidence: "NONE",
        summary: `Detection failed: ${error.message || String(error)}`,
        flags: [],
        details: { error: String(error) },
        analyzedAt: new Date().toISOString(),
    };
}

module.exports = { parseGeminiJSON, buildVerdict, buildErrorVerdict };
