/**
 * QUICK DEMO / TEST SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Run: node test.js
 *
 * Tests all 6 detectors with sample data.
 * Make sure GEMINI_API_KEY is set in your .env file first.
 */

require("dotenv").config();
const { detect } = require("./core");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    console.log("\n🛡️  Content Authenticity Verifier — Test Suite\n");

    // ── 1. Text Detection ────────────────────────────────────────────────────
    console.log("━━━ [1/6] TEXT DETECTION ━━━");
    const textResult = await detect("text", {
        text: `BREAKING: Scientists discover that drinking hot water with lemon every morning 
    completely cures diabetes and high blood pressure. The pharmaceutical companies don't 
    want you to know this ancient remedy that has been suppressed for decades. 
    Share this with everyone you know before they delete it! Forward this to 10 friends.`,
    });
    console.log("Verdict:", textResult.verdict, "| Trust Score:", textResult.trustScore);
    console.log("Summary:", textResult.summary);
    console.log("Flags:", textResult.flags);
    console.log();
    await delay(5000);

    // ── 2. Profile Detection ─────────────────────────────────────────────────
    console.log("━━━ [2/6] PROFILE DETECTION ━━━");
    const profileResult = await detect("profile", {
        platform: "instagram",
        username: "official_narendra.modi99847",
        displayName: "Narendra Modi [Official]",
        bio: "Prime Minister of India. Follow for exclusive updates. DM for business.",
        followerCount: 1200,
        followingCount: 4800,
        postCount: 3,
        accountAge: "2 weeks",
        verified: false,
    });
    console.log("Verdict:", profileResult.verdict, "| Trust Score:", profileResult.trustScore);
    console.log("Summary:", profileResult.summary);
    console.log("Flags:", profileResult.flags);
    console.log();
    await delay(5000);

    // ── 3. WhatsApp Detection ────────────────────────────────────────────────
    console.log("━━━ [3/6] WHATSAPP DETECTION ━━━");
    const waResult = await detect("whatsapp", {
        text: `🚨🚨 URGENT MESSAGE FROM GOVERNMENT OF INDIA 🚨🚨
    
    Dear Citizen, due to new Mobile Tower Policy all SIM cards will be deactivated 
    after 48 hours unless you click this link and verify your Aadhaar:
    http://india-gov-verify.xyz/aadhaar
    
    This message is approved by Ministry of Telecommunications.
    FORWARD TO ALL CONTACTS IMMEDIATELY to save their numbers from deactivation.
    
    — PM Office, New Delhi`,
    });
    console.log("Verdict:", waResult.verdict, "| Trust Score:", waResult.trustScore);
    console.log("Summary:", waResult.summary);
    console.log("Recommended Action:", waResult.details?.recommendedAction);
    console.log();
    await delay(5000);

    // ── 4. Social Post Detection ─────────────────────────────────────────────
    console.log("━━━ [4/6] SOCIAL POST DETECTION ━━━");
    const postResult = await detect("social_post", {
        platform: "facebook",
        username: "daily_truth_india",
        caption: "Famous actor just revealed on live TV that the moon landing was FAKED by NASA. Here's the proof they banned! Share before they remove it!",
        likes: 847000,
        comments: 3,
        shares: 290000,
    });
    console.log("Verdict:", postResult.verdict, "| Trust Score:", postResult.trustScore);
    console.log("Summary:", postResult.summary);
    console.log("Flags:", postResult.flags);
    console.log();

    console.log("✅ Test complete! (Image and Video tests require file uploads via the API)");
}

run().catch(console.error);
