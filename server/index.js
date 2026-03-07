import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { mapThesisToMarkets } from "../ai/thesisMapper.js";
import { scoreArbOpportunity } from "../ai/arbScorer.js";

const app = express();
app.use(cors());
app.use(express.json());

// Debug: log all incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, JSON.stringify(req.body));
  next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Helper: call Gemini with retry ---
async function geminiCall(prompt, retries = 3) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      if (err.message?.includes("429") && i < retries - 1) {
        const wait = (i + 1) * 15000; // 15s, 30s, 45s
        console.log(`    Rate limited, waiting ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

// --- Agent 1: Parse thesis into search keywords ---
async function parseThesis(thesis) {
  const text = await geminiCall(
    `You are a financial research assistant. Given a user's market thesis, extract 3-5 concise search keywords or phrases that would help find relevant prediction markets on Polymarket. Return ONLY a JSON array of strings, nothing else.\n\nUser thesis: "${thesis}"`
  );
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    return JSON.parse(match[0]);
  }
  return [thesis.slice(0, 50)];
}

// --- Agent 2: Search Polymarket for relevant markets ---
async function searchPolymarket(keywords) {
  const allMarkets = [];

  for (const keyword of keywords) {
    try {
      const response = await axios.get(
        "https://gamma-api.polymarket.com/markets",
        {
          params: {
            _limit: 10,
            closed: false,
            active: true,
            _q: keyword,
          },
          timeout: 8000,
        }
      );
      if (response.data && Array.isArray(response.data)) {
        allMarkets.push(...response.data);
      }
    } catch (err) {
      console.error(`Polymarket search failed for "${keyword}":`, err.message);
    }
  }

  // Deduplicate by market id
  const seen = new Set();
  return allMarkets.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// --- Agent 3: Rank and explain picks ---
async function rankMarkets(thesis, markets) {
  if (markets.length === 0) {
    return [];
  }

  const marketSummaries = markets.slice(0, 20).map((m) => ({
    id: m.id,
    question: m.question,
    description: (m.description || "").slice(0, 200),
    outcomePrices: m.outcomePrices,
    outcomes: m.outcomes,
    volume: m.volume,
    liquidity: m.liquidity,
    endDate: m.endDate,
    image: m.image,
    slug: m.slug,
  }));

  const text = await geminiCall(
    `You are Backboard, an expert prediction-market analyst. A user has the following market thesis:\n\n"${thesis}"\n\nHere are prediction markets from Polymarket:\n${JSON.stringify(marketSummaries, null, 2)}\n\nSelect the top 5 most relevant markets. For each, return a JSON object with: "id", "question", "relevance_score" (1-10), "suggested_position" ("YES" or "NO"), "current_price", "one_liner" (single sentence why it fits), "slug". Return ONLY a JSON array.`
  );

  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const ranked = JSON.parse(match[0]);
      // Merge image data back in
      return ranked.map((r) => {
        const original = markets.find((m) => m.id === r.id);
        return {
          ...r,
          image: original?.image || null,
          volume: original?.volume || null,
          liquidity: original?.liquidity || null,
          endDate: original?.endDate || null,
          polymarketUrl: r.slug
            ? `https://polymarket.com/event/${r.slug}`
            : null,
        };
      });
    } catch (e) {
      console.error("Failed to parse ranked markets:", e.message);
    }
  }
  return [];
}

function fallbackKeywordsFromThesis(thesis) {
  const stopWords = new Set([
    "will",
    "with",
    "that",
    "this",
    "from",
    "have",
    "about",
    "into",
    "market",
    "markets",
    "thesis",
  ]);

  const cleaned = thesis
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const unique = Array.from(new Set(cleaned)).slice(0, 5);
  return unique.length > 0 ? unique : [thesis.slice(0, 50)];
}

function fallbackRankMarkets(markets, thesis) {
  return markets.slice(0, 5).map((market, index) => {
    const prices = Array.isArray(market.outcomePrices) ? market.outcomePrices : [];
    const firstPrice = prices.length > 0 ? Number(prices[0]) : null;

    return {
      id: market.id,
      question: market.question,
      relevance_score: Math.max(10 - index, 1),
      suggested_position: "YES",
      current_price: Number.isFinite(firstPrice) ? firstPrice : null,
      one_liner: `Fallback ranking for thesis: ${thesis}`,
      slug: market.slug || null,
      image: market.image || null,
      volume: market.volume || null,
      liquidity: market.liquidity || null,
      endDate: market.endDate || null,
      polymarketUrl: market.slug
        ? `https://polymarket.com/event/${market.slug}`
        : null,
    };
  });
}

// --- Main endpoint ---
app.post("/api/analyze", async (req, res) => {
  try {
    const { thesis } = req.body;
    if (!thesis || thesis.trim().length === 0) {
      return res.status(400).json({ error: "Thesis is required" });
    }

    console.log(`\n🔍 Analyzing thesis: "${thesis}"`);

    // Step 1: Parse thesis into keywords
    console.log("  → Agent 1: Parsing thesis...");
    let keywords = [];
    let keywordStrategy = "gemini";

    try {
      keywords = await parseThesis(thesis);
    } catch (keywordError) {
      keywordStrategy = "fallback";
      keywords = fallbackKeywordsFromThesis(thesis);
      console.error("    Keyword parsing failed, using fallback:", keywordError.message);
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
      keywordStrategy = "fallback";
      keywords = fallbackKeywordsFromThesis(thesis);
    }

    console.log(`    Keywords (${keywordStrategy}):`, keywords);

    // Step 2: Search Polymarket
    console.log("  → Agent 2: Searching Polymarket...");
    const markets = await searchPolymarket(keywords);
    console.log(`    Found ${markets.length} markets`);

    // Step 3: Rank and explain
    console.log("  → Agent 3: Ranking markets...");
    let picks = [];
    let rankingStrategy = "gemini";

    try {
      picks = await rankMarkets(thesis, markets);
      if (!Array.isArray(picks) || picks.length === 0) {
        rankingStrategy = "fallback";
        picks = fallbackRankMarkets(markets, thesis);
      }
    } catch (rankingError) {
      rankingStrategy = "fallback";
      picks = fallbackRankMarkets(markets, thesis);
      console.error("    Ranking failed, using fallback:", rankingError.message);
    }

    console.log(`    Returned ${picks.length} picks (${rankingStrategy})`);

    // Gemini structured mapping (multi-platform)
    console.log("  → Gemini thesis mapper...");
    let thesisMapping = null;
    let thesisMappingError = null;

    try {
      thesisMapping = await mapThesisToMarkets(thesis);
      const mappedCount = Array.isArray(thesisMapping?.markets)
        ? thesisMapping.markets.length
        : 0;
      console.log(`    Mapped ${mappedCount} cross-platform markets`);
    } catch (mappingError) {
      thesisMappingError = mappingError.message;
      console.error("    Thesis mapping failed:", thesisMappingError);
    }

    res.json({
      thesis,
      keywords,
      keywordStrategy,
      totalMarketsFound: markets.length,
      picks,
      rankingStrategy,
      thesisMapping,
      thesisMappingError,
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analysis failed", details: err.message });
  }
});

// Direct Polymarket browse endpoint (no AI needed)
app.get("/api/polymarket/trending", async (req, res) => {
  try {
    const response = await axios.get("https://gamma-api.polymarket.com/markets", {
      params: {
        _limit: 20,
        closed: false,
        active: true,
        _sort: "volume",
        _order: "desc",
      },
      timeout: 10000,
    });
    const markets = (response.data || []).map((m) => ({
      id: m.id,
      question: m.question,
      slug: m.slug,
      outcomePrices: m.outcomePrices,
      outcomes: m.outcomes,
      volume: m.volume,
      liquidity: m.liquidity,
      endDate: m.endDate,
      image: m.image,
      description: (m.description || "").slice(0, 300),
    }));
    res.json({ markets, count: markets.length });
  } catch (err) {
    console.error("Polymarket fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch from Polymarket", details: err.message });
  }
});

app.get("/api/polymarket/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Query param 'q' required" });
    const response = await axios.get("https://gamma-api.polymarket.com/markets", {
      params: { _limit: 15, closed: false, active: true, _q: q },
      timeout: 8000,
    });
    const markets = (response.data || []).map((m) => ({
      id: m.id,
      question: m.question,
      slug: m.slug,
      outcomePrices: m.outcomePrices,
      outcomes: m.outcomes,
      volume: m.volume,
      liquidity: m.liquidity,
      endDate: m.endDate,
      image: m.image,
    }));
    res.json({ markets, count: markets.length, query: q });
  } catch (err) {
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// Structured thesis mapping endpoint (Gemini function-calling)
app.post("/api/thesis/map", async (req, res) => {
  try {
    const { thesis } = req.body;
    if (!thesis || typeof thesis !== "string" || thesis.trim().length === 0) {
      return res.status(400).json({ error: "Thesis is required" });
    }

    const mapping = await mapThesisToMarkets(thesis);
    res.json(mapping);
  } catch (err) {
    console.error("Thesis map error:", err.message);
    res.status(500).json({ error: "Thesis mapping failed", details: err.message });
  }
});

// Structured arbitrage scoring endpoint (Gemini function-calling)
app.post("/api/arb/score", async (req, res) => {
  try {
    const { question, platformA, priceA, platformB, priceB } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    if (!platformA || typeof platformA !== "string" || !platformB || typeof platformB !== "string") {
      return res.status(400).json({ error: "platformA and platformB are required" });
    }

    const leftPrice = Number(priceA);
    const rightPrice = Number(priceB);

    if (!Number.isFinite(leftPrice) || !Number.isFinite(rightPrice)) {
      return res.status(400).json({ error: "priceA and priceB must be valid numbers" });
    }

    const score = await scoreArbOpportunity(
      question,
      platformA,
      leftPrice,
      platformB,
      rightPrice
    );

    res.json({
      question,
      platformA,
      priceA: leftPrice,
      platformB,
      priceB: rightPrice,
      score,
    });
  } catch (err) {
    console.error("Arb score error:", err.message);
    res.status(500).json({ error: "Arbitrage scoring failed", details: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backboard server running on http://localhost:${PORT}`);
});
