import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

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
    const keywords = await parseThesis(thesis);
    console.log("    Keywords:", keywords);

    // Step 2: Search Polymarket
    console.log("  → Agent 2: Searching Polymarket...");
    const markets = await searchPolymarket(keywords);
    console.log(`    Found ${markets.length} markets`);

    // Step 3: Rank and explain
    console.log("  → Agent 3: Ranking markets...");
    const picks = await rankMarkets(thesis, markets);
    console.log(`    Returned ${picks.length} picks`);

    res.json({
      thesis,
      keywords,
      totalMarketsFound: markets.length,
      picks,
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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backboard server running on http://localhost:${PORT}`);
});
