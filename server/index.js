import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { mapThesisToMarkets } from "../ai/thesisMapper.js";
import { scoreArbOpportunity } from "../ai/arbScorer.js";
import { analyzeThesis } from "../agents/thesisResearcher.js";
import { checkBasketRebalance } from "../agents/indexRebalancer.js";
import { validateArbitrage } from "../agents/arbitrageScanner.js";
import { dispatchArbitrageAlert } from "../agents/alertDispatcher.js";

const app = express();
app.use(cors());
app.use(express.json());

const BACKBOARD_BASE_URL = "https://app.backboard.io/api";
const backboardApiKey = process.env.BACKBOARD_API_KEY;
const backboardHttp = backboardApiKey
  ? axios.create({
    baseURL: BACKBOARD_BASE_URL,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": backboardApiKey,
    },
  })
  : null;

const AGENT_REGISTRY = {
  thesis: {
    name: "ThesisResearcher",
    assistantEnv: "THESIS_RESEARCHER_ASSISTANT_ID",
    threadEnv: "THESIS_RESEARCHER_THREAD_ID",
  },
  arb: {
    name: "ArbitrageScanner",
    assistantEnv: "ARB_SCANNER_ASSISTANT_ID",
    threadEnv: "ARB_SCANNER_THREAD_ID",
  },
  rebalancer: {
    name: "IndexRebalancer",
    assistantEnv: "INDEX_REBALANCER_ASSISTANT_ID",
    threadEnv: "INDEX_REBALANCER_THREAD_ID",
  },
  dispatcher: {
    name: "AlertDispatcher",
    assistantEnv: "ALERT_DISPATCHER_ASSISTANT_ID",
    threadEnv: "ALERT_DISPATCHER_THREAD_ID",
  },
};

const AGENT_ALIASES = {
  thesis: "thesis",
  thesisresearcher: "thesis",
  arb: "arb",
  scanner: "arb",
  arbitragescanner: "arb",
  rebalancer: "rebalancer",
  index: "rebalancer",
  indexrebalancer: "rebalancer",
  basket: "rebalancer",
  dispatcher: "dispatcher",
  alert: "dispatcher",
  alertdispatcher: "dispatcher",
};

const MOCK_DATA_DIR = path.resolve(__dirname, "data");
const MOCK_POLY_TRADES_FILE = path.join(MOCK_DATA_DIR, "mock_polymarket_trades.json");

const MOCK_POLYMARKET_MARKETS = [
  {
    id: "pm-m1",
    slug: "fed-cut-q1-2025",
    question: "Will the Fed cut rates in Q1 2025?",
    outcomes: ["YES", "NO"],
    clobTokenIds: ["yes-fed-cut-q1-2025", "no-fed-cut-q1-2025"],
    lastPrice: 0.58,
  },
  {
    id: "pm-m2",
    slug: "btc-80k-apr-2025",
    question: "Will BTC hit $80K before April 2025?",
    outcomes: ["YES", "NO"],
    clobTokenIds: ["yes-btc-80k-apr-2025", "no-btc-80k-apr-2025"],
    lastPrice: 0.49,
  },
  {
    id: "pm-m3",
    slug: "ai-regulation-2025",
    question: "Will AI regulation tighten in 2025?",
    outcomes: ["YES", "NO"],
    clobTokenIds: ["yes-ai-reg-2025", "no-ai-reg-2025"],
    lastPrice: 0.64,
  },
];

// Debug: log all incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, JSON.stringify(req.body));
  next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Helper: call Gemini with retry ---
async function geminiCall(prompt, retries = 3) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
async function parseThesis(thesis, thesisHistory = []) {
  const historyContext = formatThesisHistoryContext(thesisHistory);
  const text = await geminiCall(
    `You are a financial research assistant. Given a user's market thesis, extract 3-5 concise search keywords or phrases that would help find relevant prediction markets on Polymarket. Return ONLY a JSON array of strings, nothing else.\n\nUser thesis: "${thesis}"${historyContext}`
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
async function rankMarkets(thesis, markets, thesisHistory = []) {
  if (markets.length === 0) {
    return [];
  }

  const historyContext = formatThesisHistoryContext(thesisHistory);

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
    `You are Backboard, an expert prediction-market analyst. A user has the following market thesis:\n\n"${thesis}"${historyContext}\n\nHere are prediction markets from Polymarket:\n${JSON.stringify(marketSummaries, null, 2)}\n\nSelect the top 5 most relevant markets. For each, return a JSON object with: "id", "question", "relevance_score" (1-10), "suggested_position" ("YES" or "NO"), "current_price", "one_liner" (single sentence why it fits), "slug". Return ONLY a JSON array.`
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

function sanitizeThesisHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 10);
}

function formatThesisHistoryContext(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return "";
  }

  return `\n\nUser prior thesis history (context only, prioritize current thesis and avoid duplicate recommendations):\n${history
    .map((entry, index) => `${index + 1}. ${entry}`)
    .join("\n")}`;
}

function stripCodeFences(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseAgentPayload(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content;
  }

  if (typeof content !== "string") {
    return null;
  }

  const normalized = stripCodeFences(content);

  try {
    return JSON.parse(normalized);
  } catch {
    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

function toFiniteNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampConfidence(value, fallback = 0.5) {
  const numeric = toFiniteNumber(value, fallback);
  return Math.max(0, Math.min(1, numeric));
}

function normalizeDecision(value, fallback = "REJECTED") {
  const decision = String(value || "").toUpperCase();
  return ["CONFIRMED", "REJECTED"].includes(decision) ? decision : fallback;
}

function normalizeUrgency(value, fallback = "MEDIUM") {
  const urgency = String(value || "").toUpperCase();
  return ["LOW", "MEDIUM", "HIGH"].includes(urgency) ? urgency : fallback;
}

function normalizePlatforms(platforms, platformA, platformB) {
  if (Array.isArray(platforms) && platforms.length >= 2) {
    return platforms.slice(0, 2).map((platform) => String(platform));
  }
  return [platformA, platformB];
}

function defaultActionsForSpread(platformA, platformB, leftPrice, rightPrice) {
  const buyFirst = leftPrice < rightPrice;

  return [
    {
      platform: platformA,
      action: buyFirst ? "BUY" : "SELL",
    },
    {
      platform: platformB,
      action: buyFirst ? "SELL" : "BUY",
    },
  ];
}

function normalizeActions(actions, platformA, platformB, leftPrice, rightPrice) {
  const fallback = defaultActionsForSpread(platformA, platformB, leftPrice, rightPrice);

  if (!Array.isArray(actions) || actions.length < 2) {
    return fallback;
  }

  const normalized = actions.slice(0, 2).map((entry, index) => {
    const fallbackEntry = fallback[index];
    const platform = typeof entry?.platform === "string" && entry.platform.trim().length > 0
      ? entry.platform
      : fallbackEntry.platform;

    const action = String(entry?.action || fallbackEntry.action).toUpperCase();
    const normalizedAction = action === "BUY" || action === "SELL" ? action : fallbackEntry.action;

    return {
      platform,
      action: normalizedAction,
    };
  });

  return normalized.length === 2 ? normalized : fallback;
}

function resolveAgentConfig(agentInput) {
  if (typeof agentInput !== "string" || agentInput.trim().length === 0) {
    return null;
  }

  const canonicalKey = AGENT_ALIASES[agentInput.trim().toLowerCase()];
  if (!canonicalKey) {
    return null;
  }

  const config = AGENT_REGISTRY[canonicalKey];
  return {
    key: canonicalKey,
    ...config,
  };
}

function parseBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function normalizeHistoryMessage(message) {
  return {
    id: message?.message_id || null,
    role: message?.role || null,
    status: message?.status || null,
    createdAt: message?.created_at || null,
    content: typeof message?.content === "string" ? message.content : "",
    modelProvider: message?.model_provider || null,
    modelName: message?.model_name || null,
    metadata: message?.metadata_ || null,
    attachments: Array.isArray(message?.attachments) ? message.attachments : [],
  };
}

function filterHistoryMessages(messages, options) {
  const {
    role,
    status,
    contains,
    limit,
  } = options;

  const roleFilter = typeof role === "string" ? role.toLowerCase() : "all";
  const statusFilter = typeof status === "string" ? status.toUpperCase() : "ALL";
  const containsFilter = typeof contains === "string" ? contains.trim().toLowerCase() : "";

  const normalized = Array.isArray(messages)
    ? messages.map(normalizeHistoryMessage)
    : [];

  const filtered = normalized.filter((message) => {
    if (roleFilter !== "all" && String(message.role || "").toLowerCase() !== roleFilter) {
      return false;
    }

    if (statusFilter !== "ALL" && String(message.status || "").toUpperCase() !== statusFilter) {
      return false;
    }

    if (containsFilter && !String(message.content || "").toLowerCase().includes(containsFilter)) {
      return false;
    }

    return true;
  });

  if (!Number.isFinite(limit) || limit <= 0) {
    return filtered;
  }

  return filtered.slice(-limit);
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(MOCK_DATA_DIR, { recursive: true });
  const serialized = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, serialized, "utf8");
}

async function appendMockTrades(newTrades) {
  const existing = await readJsonFile(MOCK_POLY_TRADES_FILE, []);
  const updated = existing.concat(newTrades);
  await writeJsonFile(MOCK_POLY_TRADES_FILE, updated);
  return updated;
}

function createMockId(prefix) {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now()}-${suffix}`;
}

function normalizeAdjustmentPct(value) {
  const numeric = toFiniteNumber(value, null);
  if (numeric === null) return 0;
  if (numeric > 1) return numeric / 100;
  return Math.max(0, numeric);
}

function normalizeWeightFraction(value) {
  const numeric = toFiniteNumber(value, null);
  if (numeric === null) return 0;
  if (numeric > 1) return numeric / 100;
  return Math.max(0, numeric);
}

function buildMockTrade({
  walletAddress,
  solanaSignature,
  marketLabel,
  platform,
  side,
  price,
  size,
  source,
  metadata,
}) {
  const normalizedPrice = Number.isFinite(price) ? price : 0.5;
  const normalizedSize = Number.isFinite(size) ? size : 0;

  return {
    id: createMockId("pm"),
    walletAddress: walletAddress || null,
    solanaSignature: solanaSignature || null,
    market: marketLabel || "Unknown market",
    platform: platform || "Polymarket",
    side: String(side || "BUY").toUpperCase(),
    price: normalizedPrice,
    size: normalizedSize,
    status: "FILLED",
    filledSize: normalizedSize,
    avgPrice: normalizedPrice,
    source: source || "mock",
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: new Date().toISOString(),
  };
}

// --- Main endpoint ---
app.post("/api/analyze", async (req, res) => {
  try {
    const { thesis, history } = req.body;
    if (!thesis || thesis.trim().length === 0) {
      return res.status(400).json({ error: "Thesis is required" });
    }

    const thesisHistory = sanitizeThesisHistory(history);

    console.log(`\n🔍 Analyzing thesis: "${thesis}"`);
    if (thesisHistory.length > 0) {
      console.log(`  → Using thesis history context (${thesisHistory.length} prior entries)`);
    }

    // Step 1: Parse thesis into keywords
    console.log("  → Agent 1: Parsing thesis...");
    let keywords = [];
    let keywordStrategy = "gemini";

    try {
      keywords = await parseThesis(thesis, thesisHistory);
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
      picks = await rankMarkets(thesis, markets, thesisHistory);
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
      const mapperInput = thesisHistory.length > 0
        ? `${thesis}${formatThesisHistoryContext(thesisHistory)}`
        : thesis;
      thesisMapping = await mapThesisToMarkets(mapperInput);
      const mappedCount = Array.isArray(thesisMapping?.markets)
        ? thesisMapping.markets.length
        : 0;
      console.log(`    Mapped ${mappedCount} cross-platform markets`);
    } catch (mappingError) {
      thesisMappingError = mappingError.message;
      console.error("    Thesis mapping failed:", thesisMappingError);
    }

    // ThesisResearcher agent from Backboard
    console.log("  → ThesisResearcher agent...");
    let agentAnalysis = null;
    let agentAnalysisError = null;

    try {
      const agentInput = thesisHistory.length > 0
        ? `${thesis}${formatThesisHistoryContext(thesisHistory)}`
        : thesis;
      agentAnalysis = await analyzeThesis(agentInput);
      console.log(`    Agent response received (${agentAnalysis?.content?.length || 0} chars)`);
    } catch (agentError) {
      agentAnalysisError = agentError.message;
      console.error("    Agent analysis failed:", agentAnalysisError);
    }

    res.json({
      thesis,
      keywords,
      keywordStrategy,
      totalMarketsFound: markets.length,
      picks,
      rankingStrategy,
      historyContextUsed: thesisHistory,
      thesisMapping,
      thesisMappingError,
      agentAnalysis,
      agentAnalysisError,
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

// Scanner endpoint: validates arb opportunity and formats as alert card
app.post("/api/scan", async (req, res) => {
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

    console.log(`[/api/scan] Analyzing: "${question}"`);
    console.log(`  ${platformA} @ ${leftPrice} vs ${platformB} @ ${rightPrice}`);

    try {
      const scannerMessage = `Raw alert: ${platformA} YES @ ${leftPrice}, ${platformB} YES @ ${rightPrice}, question: ${question}. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), spread (number), reasoning (string), confidence (number 0..1). No markdown.`;
      const scannerResponse = await validateArbitrage(scannerMessage);
      const scannerPayload = parseAgentPayload(scannerResponse?.content);

      if (!scannerPayload || typeof scannerPayload !== "object") {
        throw new Error("ArbitrageScanner returned unparseable output");
      }

      const scannerDecision = normalizeDecision(scannerPayload.decision, "REJECTED");
      const scannerSpread = toFiniteNumber(
        scannerPayload.spread,
        Math.abs(rightPrice - leftPrice)
      );
      const scannerConfidence = clampConfidence(scannerPayload.confidence, 0.5);
      const scannerReasoning =
        typeof scannerPayload.reasoning === "string" && scannerPayload.reasoning.trim().length > 0
          ? scannerPayload.reasoning.trim()
          : "Arbitrage scan completed.";

      console.log(
        `  → ArbitrageScanner: ${scannerDecision}, Spread: ${scannerSpread}, Confidence: ${scannerConfidence}`
      );

      const dispatchMessage = `Trade analysis: decision: ${scannerDecision}, ${platformA} YES @ ${leftPrice}, ${platformB} YES @ ${rightPrice}, question: ${question}, spread: ${scannerSpread}, confidence: ${scannerConfidence}, reasoning: ${scannerReasoning}. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), title, summary, platforms (array of 2 strings), spread (number), confidence (number 0..1), actions (array of {platform, action BUY/SELL}), urgency (LOW/MEDIUM/HIGH), risk_flags (array of strings). No markdown.`;
      const dispatcherResponse = await dispatchArbitrageAlert(dispatchMessage);
      const dispatcherPayload = parseAgentPayload(dispatcherResponse?.content);

      if (!dispatcherPayload || typeof dispatcherPayload !== "object") {
        throw new Error("AlertDispatcher returned unparseable output");
      }

      const decision = normalizeDecision(dispatcherPayload.decision, scannerDecision);
      const spread = toFiniteNumber(dispatcherPayload.spread, scannerSpread);
      const confidence = clampConfidence(dispatcherPayload.confidence, scannerConfidence);
      const titleWords = question.split(" ").slice(0, 8).join(" ");
      const title =
        typeof dispatcherPayload.title === "string" && dispatcherPayload.title.trim().length > 0
          ? dispatcherPayload.title.trim()
          : titleWords.length > 1
            ? titleWords
            : question.slice(0, 50);
      const summary =
        typeof dispatcherPayload.summary === "string" && dispatcherPayload.summary.trim().length > 0
          ? dispatcherPayload.summary.trim()
          : scannerReasoning;
      const platforms = normalizePlatforms(dispatcherPayload.platforms, platformA, platformB);
      const actions = normalizeActions(
        dispatcherPayload.actions,
        platformA,
        platformB,
        leftPrice,
        rightPrice
      );
      const urgency = normalizeUrgency(dispatcherPayload.urgency, "MEDIUM");
      const riskFlags = Array.isArray(dispatcherPayload.risk_flags)
        ? dispatcherPayload.risk_flags.filter(
            (flag) => typeof flag === "string" && flag.trim().length > 0
          )
        : [];

      const alert = {
        id: `scan-${Date.now()}`,
        decision,
        title,
        summary,
        platforms,
        spread,
        adjusted_spread: toFiniteNumber(dispatcherPayload.adjusted_spread, null),
        confidence,
        priceA: leftPrice,
        priceB: rightPrice,
        question,
        actions,
        urgency,
        risk_flags: riskFlags,
        source: "agents",
        timestamp: new Date().toISOString(),
      };

      console.log(`  ✓ AlertDispatcher formatted: ${alert.decision} ${alert.title}`);

      return res.json(alert);
    } catch (agentChainError) {
      console.error(`  ! Agent chain failed, using Gemini fallback: ${agentChainError.message}`);
    }

    // Fallback: Gemini scorer
    const score = await scoreArbOpportunity(
      question,
      platformA,
      leftPrice,
      platformB,
      rightPrice
    );

    console.log(`  → Gemini fallback: ${score.decision}, Spread: ${score.spread}, Confidence: ${score.confidence}`);

    const decision = score.decision === "EXPLOIT" ? "CONFIRMED" : "REJECTED";
    const titleWords = question.split(" ").slice(0, 8).join(" ");
    const title = titleWords.length > 1 ? titleWords : question.slice(0, 50);

    const alert = {
      id: `scan-${Date.now()}`,
      decision,
      title,
      summary: score.reasoning || "Market opportunity detected.",
      platforms: [platformA, platformB],
      spread: score.spread,
      adjusted_spread: score.adjusted_spread,
      confidence: score.confidence,
      priceA: leftPrice,
      priceB: rightPrice,
      question,
      actions: defaultActionsForSpread(platformA, platformB, leftPrice, rightPrice),
      urgency: score.urgency || "MEDIUM",
      risk_flags: score.risk_flags || [],
      source: "gemini_fallback",
      timestamp: new Date().toISOString(),
    };

    console.log(`  ✓ Fallback alert formatted: ${alert.decision} ${alert.title}`);

    res.json(alert);
  } catch (err) {
    console.error("Scan error:", err.message);
    res.status(500).json({ error: "Scan failed", details: err.message });
  }
});

// Basket rebalancing endpoint: checks if basket needs rebalancing
app.post("/api/basket/rebalance", async (req, res) => {
  try {
    const { basket } = req.body;

    if (!Array.isArray(basket) || basket.length === 0) {
      return res.status(400).json({ error: "basket array is required and must not be empty" });
    }

    console.log(`[/api/basket/rebalance] Checking ${basket.length} positions`);

    // Send basket to IndexRebalancer agent
    const response = await checkBasketRebalance(basket);

    console.log(`  ✓ Rebalancer response received`);

    res.json({
      basket,
      rebalanceAnalysis: response,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Basket rebalance error:", err.message);
    res.status(500).json({ error: "Basket rebalance failed", details: err.message });
  }
});

// Mock Polymarket: list sample markets
app.get("/api/mock/polymarket/markets", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const limit = parseBoundedInt(req.query.limit, 25, 1, 100);
  const filtered = query
    ? MOCK_POLYMARKET_MARKETS.filter((market) =>
      String(market.question).toLowerCase().includes(query))
    : MOCK_POLYMARKET_MARKETS;

  res.json({
    count: Math.min(filtered.length, limit),
    markets: filtered.slice(0, limit),
  });
});

// Mock Polymarket: create an order (auto-filled)
app.post("/api/mock/polymarket/orders", async (req, res) => {
  try {
    const {
      walletAddress,
      solanaSignature,
      marketId,
      market,
      platform,
      side,
      price,
      size,
      metadata,
    } = req.body || {};

    if (!marketId && !market) {
      return res.status(400).json({ error: "marketId or market is required" });
    }

    const selectedMarket = marketId
      ? MOCK_POLYMARKET_MARKETS.find((m) => m.id === marketId || m.slug === marketId)
      : null;
    const marketLabel = market || selectedMarket?.question || marketId;

    const trade = buildMockTrade({
      walletAddress,
      solanaSignature,
      marketLabel,
      platform,
      side,
      price: toFiniteNumber(price, selectedMarket?.lastPrice ?? 0.5),
      size: toFiniteNumber(size, 0),
      source: "mock_order",
      metadata: {
        marketId: selectedMarket?.id || marketId || null,
        tokenIds: selectedMarket?.clobTokenIds || [],
        ...metadata,
      },
    });

    await appendMockTrades([trade]);

    res.json(trade);
  } catch (err) {
    console.error("Mock order error:", err.message);
    res.status(500).json({ error: "Mock order failed", details: err.message });
  }
});

// Mock Polymarket: list saved trades
app.get("/api/mock/polymarket/trades", async (req, res) => {
  try {
    const wallet = typeof req.query.wallet === "string" ? req.query.wallet.trim() : "";
    const limit = parseBoundedInt(req.query.limit, 50, 1, 500);
    const trades = await readJsonFile(MOCK_POLY_TRADES_FILE, []);
    const filtered = wallet
      ? trades.filter((trade) => trade.walletAddress === wallet)
      : trades;

    res.json({
      count: Math.min(filtered.length, limit),
      trades: filtered.slice(-limit),
    });
  } catch (err) {
    console.error("Mock trades error:", err.message);
    res.status(500).json({ error: "Failed to load mock trades", details: err.message });
  }
});

// Mock Polymarket: execute an arbitrage alert (two legs)
app.post("/api/mock/polymarket/execute-arb", async (req, res) => {
  try {
    const { alert, walletAddress, solanaSignature, size, metadata } = req.body || {};

    if (!alert || typeof alert !== "object") {
      return res.status(400).json({ error: "alert payload is required" });
    }

    const platforms = Array.isArray(alert.platforms) ? alert.platforms : [];
    const actions = Array.isArray(alert.actions) ? alert.actions : [];
    const question = alert.question || alert.title || "Arb opportunity";
    const baseSize = toFiniteNumber(size, 100);

    const priceByPlatform = {
      [platforms[0]]: toFiniteNumber(alert.priceA, 0.5),
      [platforms[1]]: toFiniteNumber(alert.priceB, 0.5),
    };

    const trades = actions.length > 0
      ? actions.map((action) =>
        buildMockTrade({
          walletAddress,
          solanaSignature,
          marketLabel: question,
          platform: action.platform,
          side: action.action,
          price: priceByPlatform[action.platform] ?? 0.5,
          size: baseSize,
          source: "mock_arb",
          metadata: { alertId: alert.id || null, ...metadata },
        }))
      : platforms.map((platform, index) =>
        buildMockTrade({
          walletAddress,
          solanaSignature,
          marketLabel: question,
          platform,
          side: index === 0 ? "BUY" : "SELL",
          price: priceByPlatform[platform] ?? 0.5,
          size: baseSize,
          source: "mock_arb",
          metadata: { alertId: alert.id || null, ...metadata },
        }));

    await appendMockTrades(trades);

    res.json({
      count: trades.length,
      trades,
    });
  } catch (err) {
    console.error("Mock arb execute error:", err.message);
    res.status(500).json({ error: "Mock arb execution failed", details: err.message });
  }
});

// Mock Polymarket: execute a basket rebalance
app.post("/api/mock/polymarket/execute-basket", async (req, res) => {
  try {
    const { basket, walletAddress, solanaSignature, notional } = req.body || {};

    if (!Array.isArray(basket) || basket.length === 0) {
      return res.status(400).json({ error: "basket array is required" });
    }

    const rebalanceResponse = await checkBasketRebalance(basket);
    const rebalancePayload = parseAgentPayload(rebalanceResponse?.content);

    const positions =
      rebalancePayload?.positions ||
      rebalancePayload?.rebalances ||
      rebalancePayload?.instructions ||
      rebalancePayload?.rebalance_positions ||
      rebalancePayload?.rebalanceInstructions ||
      [];

    if (!Array.isArray(positions) || positions.length === 0) {
      return res.status(422).json({
        error: "Rebalancer did not return positions",
        details: rebalancePayload,
      });
    }

    const baseNotional = toFiniteNumber(notional, 100);

    const trades = positions
      .map((position) => {
        const adjustment = normalizeAdjustmentPct(
          position?.adjustment_pct ??
          position?.adjustmentPct ??
          position?.adjustment ??
          position?.size_pct ??
          position?.sizePct ??
          position?.delta ??
          0
        );

        if (adjustment <= 0) {
          return null;
        }

        const rawDirection = String(
          position?.direction ||
          position?.action ||
          position?.side ||
          ""
        ).toUpperCase();

        const side = rawDirection === "DECREASE" || rawDirection === "SELL"
          ? "SELL"
          : "BUY";

        const marketLabel =
          position?.market ||
          position?.question ||
          position?.name ||
          "Basket position";

        const basketEntry = basket.find((entry) => entry?.market === marketLabel);
        const price = toFiniteNumber(basketEntry?.current_weight, 0.5);

        return buildMockTrade({
          walletAddress,
          solanaSignature,
          marketLabel,
          platform: position?.platform || basketEntry?.platform || "Polymarket",
          side,
          price,
          size: baseNotional * adjustment,
          source: "mock_basket",
          metadata: {
            adjustment_pct: adjustment,
            urgency: rebalancePayload?.urgency_score ?? null,
          },
        });
      })
      .filter(Boolean);

    await appendMockTrades(trades);

    res.json({
      count: trades.length,
      trades,
      rebalance: rebalancePayload,
    });
  } catch (err) {
    console.error("Mock basket execute error:", err.message);
    res.status(500).json({ error: "Mock basket execution failed", details: err.message });
  }
});

// Mock Polymarket: buy a basket by target weights
app.post("/api/mock/polymarket/buy-basket", async (req, res) => {
  try {
    const { basket, walletAddress, solanaSignature, notional } = req.body || {};

    if (!Array.isArray(basket) || basket.length === 0) {
      return res.status(400).json({ error: "basket array is required" });
    }

    const baseNotional = toFiniteNumber(notional, 100);

    const trades = basket
      .map((entry) => {
        const weight = normalizeWeightFraction(
          entry?.target_weight ??
          entry?.weight ??
          entry?.allocation ??
          0
        );

        if (weight <= 0) return null;

        const marketLabel = entry?.market || entry?.question || entry?.name || "Basket position";
        const price = toFiniteNumber(entry?.current_weight, 0.5);

        return buildMockTrade({
          walletAddress,
          solanaSignature,
          marketLabel,
          platform: entry?.platform || "Polymarket",
          side: "BUY",
          price,
          size: baseNotional * weight,
          source: "mock_basket_buy",
          metadata: {
            target_weight: weight,
          },
        });
      })
      .filter(Boolean);

    await appendMockTrades(trades);

    res.json({
      count: trades.length,
      trades,
    });
  } catch (err) {
    console.error("Mock basket buy error:", err.message);
    res.status(500).json({ error: "Mock basket buy failed", details: err.message });
  }
});

// Backboard history endpoint: retrieve persisted thread history for an agent
app.get("/api/agents/history", async (req, res) => {
  try {
    if (!backboardHttp) {
      return res.status(500).json({
        error: "BACKBOARD_API_KEY is missing",
        details: "Set BACKBOARD_API_KEY in .env to retrieve agent history.",
      });
    }

    const agentInput = typeof req.query.agent === "string" ? req.query.agent : "";
    const agent = resolveAgentConfig(agentInput);

    if (!agent) {
      return res.status(400).json({
        error: "Invalid agent query parameter",
        details: "Use one of: thesis, arb, rebalancer, dispatcher",
      });
    }

    const scopeRaw = typeof req.query.scope === "string" ? req.query.scope.toLowerCase() : "thread";
    const scope = scopeRaw === "assistant" ? "assistant" : "thread";

    const role = typeof req.query.role === "string" ? req.query.role.toLowerCase() : "all";
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "ALL";
    const contains = typeof req.query.contains === "string" ? req.query.contains : "";
    const limit = parseBoundedInt(req.query.limit, 50, 1, 500);
    const threadLimit = parseBoundedInt(req.query.threadLimit, 10, 1, 100);

    const assistantId = process.env[agent.assistantEnv] || null;
    const requestedThreadId = typeof req.query.threadId === "string" && req.query.threadId.trim().length > 0
      ? req.query.threadId.trim()
      : null;
    const savedThreadId = process.env[agent.threadEnv] || null;
    const threadId = requestedThreadId || savedThreadId;

    if (scope === "thread") {
      if (!threadId) {
        return res.status(404).json({
          error: "No thread ID found for agent",
          details: `Missing ${agent.threadEnv} and no threadId query was provided.`,
        });
      }

      const response = await backboardHttp.get(`/threads/${threadId}`);
      const thread = response.data || {};
      const messages = filterHistoryMessages(thread.messages, {
        role,
        status,
        contains,
        limit,
      });

      return res.json({
        agent: agent.key,
        agentName: agent.name,
        scope,
        assistantId,
        threadId,
        totalMessages: messages.length,
        filters: {
          role,
          status,
          contains,
          limit,
        },
        messages,
      });
    }

    if (!assistantId) {
      return res.status(404).json({
        error: "No assistant ID found for agent",
        details: `Missing ${agent.assistantEnv}.`,
      });
    }

    const response = await backboardHttp.get(`/assistants/${assistantId}/threads`);
    const rawThreads = Array.isArray(response.data) ? response.data : [];
    const scopedThreads = rawThreads.slice(0, threadLimit).map((thread) => {
      const messages = filterHistoryMessages(thread?.messages, {
        role,
        status,
        contains,
        limit,
      });

      return {
        threadId: thread?.thread_id || null,
        createdAt: thread?.created_at || null,
        totalMessages: messages.length,
        messages,
      };
    });

    const threads = contains || role !== "all" || status !== "ALL"
      ? scopedThreads.filter((thread) => thread.totalMessages > 0)
      : scopedThreads;

    res.json({
      agent: agent.key,
      agentName: agent.name,
      scope,
      assistantId,
      totalThreads: rawThreads.length,
      returnedThreads: threads.length,
      filters: {
        role,
        status,
        contains,
        limit,
        threadLimit,
      },
      threads,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    console.error("Agent history error:", status, details);
    res.status(status).json({
      error: "Failed to retrieve agent history",
      details,
    });
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
