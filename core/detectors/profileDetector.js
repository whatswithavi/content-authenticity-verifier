/**
 * PROFILE DETECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyses social media profile data to detect fake/bot accounts.
 * Works for Instagram, Facebook, Twitter/X, LinkedIn etc.
 *
 * Detection signals:
 *   • Account age vs. follower ratio
 *   • Profile picture analysis (stock photo / AI face)
 *   • Bio text patterns (stolen content, spammy keywords)
 *   • Activity patterns (post frequency, engagement rate)
 *   • Username patterns (random numbers/letters, impersonation)
 *   • Follower/Following ratio anomalies
 *
 * Input (provide what you have — more data = better accuracy):
 * {
 *   platform: "instagram" | "facebook" | "twitter" | "linkedin" | "other",
 *   username: string,
 *   displayName?: string,
 *   bio?: string,
 *   followerCount?: number,
 *   followingCount?: number,
 *   postCount?: number,
 *   accountAge?: string,          // e.g. "2 months", "3 years"
 *   profilePictureBuffer?: Buffer,
 *   profilePictureMimeType?: string,
 *   profilePictureUrl?: string,
 *   recentPosts?: string[],        // Array of recent caption strings
 *   engagementRate?: number,       // Average likes/comments per post as % of followers
 *   verified?: boolean,
 *   externalLinks?: string[],
 * }
 */

const { getTextModel, getVisionModel, bufferToInlinePart, urlToInlinePart } = require("../utils/geminiClient");
const { parseGeminiJSON, buildVerdict, buildErrorVerdict } = require("../utils/responseFormatter");

const buildProfilePrompt = (profileData) => `
You are a social media fraud analyst specialising in detecting fake, bot, and impersonation accounts.

Analyse the following profile data and return ONLY a valid JSON object (no markdown) with this structure:
{
  "verdict": "<one of: AUTHENTIC | SUSPICIOUS | LIKELY_FAKE | BOT | IMPERSONATION>",
  "trustScore": <integer 0-100, 100 = very likely a real genuine account>,
  "confidence": "<HIGH | MEDIUM | LOW>",
  "summary": "<single sentence verdict for a general audience>",
  "flags": ["<flag1>", "<flag2>", ...],
  "details": {
    "botProbability": <0-100>,
    "impersonationProbability": <0-100>,
    "accountAgeSuspicion": "<LOW | MEDIUM | HIGH>",
    "followerRatioAnalysis": "<description>",
    "usernameAnalysis": "<description>",
    "bioAnalysis": "<description>",
    "engagementAnalysis": "<description>",
    "profilePictureAnalysis": "<AUTHENTIC | STOCK_PHOTO | AI_GENERATED | SUSPICIOUS | NOT_PROVIDED>",
    "redFlags": ["<flag1>", "<flag2>"],
    "credibilitySignals": ["<signal1>", "<signal2>"]
  }
}

Profile data to analyse:
${JSON.stringify(profileData, null, 2)}

Detection rules:
- Username with many random numbers/letters after name = suspicious
- Very new account with many followers = suspicious
- Following >> Followers = bot pattern
- Generic / copied bio = suspicious
- No profile picture or obvious stock photo = suspicious
- Engagement rate < 0.5% for large accounts = likely bot inflated
- Posts that are only reposts or very generic = suspicious
- Verified badge does NOT guarantee authenticity for older impersonations
`;

/**
 * @param {object} profileData - Profile metadata (see JSDoc above)
 * @returns {Promise<object>}   - Verdict
 */
async function detectProfile(profileData) {
    try {
        if (!profileData || !profileData.username) {
            throw new Error("At minimum, a username must be provided.");
        }

        const parts = [];

        // Build the text prompt with all available profile metadata
        parts.push(buildProfilePrompt(profileData));

        // If a profile picture is provided, analyse it visually too
        if (profileData.profilePictureBuffer && profileData.profilePictureMimeType) {
            parts.push(bufferToInlinePart(profileData.profilePictureBuffer, profileData.profilePictureMimeType));
            parts.push("The image above is the account's profile picture. Factor it into your profilePictureAnalysis.");
        } else if (profileData.profilePictureUrl) {
            try {
                const ext = profileData.profilePictureUrl.split("?")[0].split(".").pop().toLowerCase();
                const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
                const mime = mimeMap[ext] || "image/jpeg";
                const imgPart = await urlToInlinePart(profileData.profilePictureUrl, mime);
                parts.push(imgPart);
                parts.push("The image above is the account's profile picture. Factor it into your profilePictureAnalysis.");
            } catch {
                // Profile pic URL failed — continue with text-only analysis
            }
        }

        const model = parts.length > 1 ? getVisionModel() : getTextModel();
        const result = await model.generateContent(parts);
        const rawText = result.response.text();
        const parsed = parseGeminiJSON(rawText);

        return buildVerdict({
            type: "profile",
            verdict: parsed.verdict,
            trustScore: parsed.trustScore,
            confidence: parsed.confidence,
            summary: parsed.summary,
            flags: parsed.flags || [],
            details: {
                ...parsed.details,
                platform: profileData.platform || "unknown",
                username: profileData.username,
            },
        });
    } catch (err) {
        return buildErrorVerdict("profile", err);
    }
}

module.exports = { detectProfile };
