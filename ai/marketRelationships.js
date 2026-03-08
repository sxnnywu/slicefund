import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

dotenv.config({ path: envPath });

const MODEL_NAME = "gemini-2.5-flash-lite";

const RELATIONSHIP_TYPES = [
  "CAUSES", // A implies B will happen
  "PREVENTS", // A implies B won't happen
  "CONTRADICTS", // Can't both be YES
  "REQUIRES", // B requires A to be true first
  "MUTUALLY_EXCLUSIVE", // Only one can resolve YES
  "SIMILAR", // Same topic, related outcomes
  "SUB_EVENT", // B is a more specific instance of A
  "CORRELATED", // Tend to move together
  "PRECEDES", // A must resolve before B
  "SUPPORTS", // A being true increases likelihood of B
];

function initGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Find relationships between a target market and a list of candidate markets
 * @param {Object} targetMarket - The market to analyze { id, question, platform, description? }
 * @param {Array} candidateMarkets - List of markets to compare against
 * @param {Object} options - { maxResults: 5, minConfidence: 0.6 }
 * @returns {Promise<Array>} - Array of { marketId, question, relationship, confidence, explanation }
 */
export async function findMarketRelationships(targetMarket, candidateMarkets, options = {}) {
  const { maxResults = 5, minConfidence = 0.6 } = options;

  try {
    if (!targetMarket?.question || !Array.isArray(candidateMarkets) || candidateMarkets.length === 0) {
      return [];
    }

    const genAI = initGemini();
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Limit candidates to prevent token overflow
    const limitedCandidates = candidateMarkets.slice(0, 100);

    const candidateSummaries = limitedCandidates.map((m) => ({
      id: m.id,
      question: m.question,
      platform: m.platform || "Unknown",
      description: (m.description || "").slice(0, 150),
    }));

    const prompt = `You are an expert at analyzing prediction market relationships.

TARGET MARKET:
Platform: ${targetMarket.platform || "Unknown"}
Question: "${targetMarket.question}"
${targetMarket.description ? `Description: ${targetMarket.description.slice(0, 200)}` : ""}

CANDIDATE MARKETS:
${JSON.stringify(candidateSummaries, null, 2)}

RELATIONSHIP TYPES:
${RELATIONSHIP_TYPES.map((r) => `- ${r}`).join("\n")}

Task: Identify the top ${maxResults} most meaningful relationships between the target market and candidate markets.

For each relationship, return a JSON object with:
- marketId: the candidate market's id
- relationship: one of the relationship types above
- confidence: 0-1 score (only include if >= ${minConfidence})
- explanation: 1 sentence explaining why this relationship exists

Return ONLY a JSON array of relationships, ordered by confidence (highest first).
Example: [{"marketId": "abc", "relationship": "CAUSES", "confidence": 0.85, "explanation": "..."}]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn("[findMarketRelationships] No JSON array found in response");
      return [];
    }

    const relationships = JSON.parse(match[0]);

    // Merge back market details and filter by confidence
    const enriched = relationships
      .filter((r) => r.confidence >= minConfidence)
      .map((r) => {
        const market = candidateMarkets.find((m) => m.id === r.marketId);
        return {
          ...r,
          question: market?.question || "Unknown",
          platform: market?.platform || "Unknown",
          slug: market?.slug,
          url: market?.url,
        };
      })
      .slice(0, maxResults);

    return enriched;
  } catch (error) {
    console.error("[findMarketRelationships] Error:", error.message);
    
    // Return fallback similar markets based on keyword overlap
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      return fallbackSimilarMarkets(targetMarket, candidateMarkets, maxResults);
    }
    
    throw error;
  }
}

/**
 * Fallback relationship finder using simple keyword matching
 */
function fallbackSimilarMarkets(targetMarket, candidateMarkets, maxResults = 5) {
  const targetWords = new Set(
    targetMarket.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const scored = candidateMarkets
    .filter((m) => m.id !== targetMarket.id)
    .map((m) => {
      const candidateWords = m.question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);

      const overlap = candidateWords.filter((w) => targetWords.has(w)).length;
      const confidence = Math.min(overlap / Math.max(targetWords.size, 1), 0.8);

      return {
        marketId: m.id,
        question: m.question,
        platform: m.platform || "Unknown",
        relationship: "SIMILAR",
        confidence,
        explanation: `Shares ${overlap} keywords with target market`,
        slug: m.slug,
        url: m.url,
      };
    })
    .filter((m) => m.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);

  return scored;
}

// CLI test
async function main() {
  const targetMarket = {
    id: "test-1",
    question: "Will Trump win the 2024 election?",
    platform: "Polymarket",
  };

  const candidates = [
    { id: "c1", question: "Will Republicans control the Senate in 2025?", platform: "Polymarket" },
    { id: "c2", question: "Will Biden drop out before the election?", platform: "Manifold" },
    { id: "c3", question: "Will inflation exceed 4% in 2024?", platform: "Kalshi" },
    { id: "c4", question: "Will Trump's VP be DeSantis?", platform: "Polymarket" },
    { id: "c5", question: "Will Fed cut rates in Q1 2025?", platform: "Kalshi" },
  ];

  try {
    const relationships = await findMarketRelationships(targetMarket, candidates);
    console.log("[main] Found relationships:");
    console.dir(relationships, { depth: null });
  } catch (error) {
    console.error("[main] Failed:", error.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
