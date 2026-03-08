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
import { findMarketRelationships } from "../ai/marketRelationships.js";
import { analyzeThesis } from "../agents/thesisResearcher.js";
import { checkBasketRebalance } from "../agents/indexRebalancer.js";
import { validateArbitrage } from "../agents/arbitrageScanner.js";
import { dispatchArbitrageAlert } from "../agents/alertDispatcher.js";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory cache for market relationships (TTL: 1 hour)
const relationshipCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms

function getCachedRelationships(marketId) {
  const cached = relationshipCache.get(marketId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedRelationships(marketId, data) {
  relationshipCache.set(marketId, { data, timestamp: Date.now() });
  // Clean old entries periodically
  if (relationshipCache.size > 1000) {
    const cutoff = Date.now() - CACHE_TTL;
    for (const [key, value] of relationshipCache.entries()) {
      if (value.timestamp < cutoff) {
        relationshipCache.delete(key);
      }
    }
  }
}

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
const KALSHI_MARKET_DATA_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
const GEMINI_MODEL_NAME = "gemini-2.5-flash-lite";
const GEMINI_MIN_GAP_MS = 2500;
const MIN_VALIDATED_PICK_RELEVANCE = 2.5;
const POLYMARKET_SEARCH_LIMIT = 50;
const POLYMARKET_TRENDING_LIMIT = 100;
const POLYMARKET_EVENT_PAGE_LIMIT = 100;
const POLYMARKET_SEARCH_EVENT_PAGES = 3;
const MANIFOLD_CATALOG_LIMIT = 1000;
const MANIFOLD_SEARCH_LIMIT = 100;
let nextGeminiRequestAt = 0;
let geminiRequestChain = Promise.resolve();

function isGeminiPermanentFailure(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("quota exceeded") ||
    normalized.includes("limit: 0") ||
    normalized.includes("billing") ||
    normalized.includes("api key expired") ||
    normalized.includes("api_key_invalid") ||
    normalized.includes("invalid api key")
  );
}

function parseKalshiPrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 1 ? value : value / 100;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed <= 1 ? parsed : parsed / 100;
    }
  }

  return null;
}

function parseKalshiMetric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeKalshiMarket(market) {
  const status = String(market?.status || "").toLowerCase();
  if (status && !["open", "active"].includes(status)) {
    return null;
  }

  const explicitYesPrice =
    parseKalshiPrice(market?.yes_price_dollars) ??
    parseKalshiPrice(market?.yes_price);
  const yesBid =
    parseKalshiPrice(market?.yes_bid_dollars) ??
    parseKalshiPrice(market?.yes_bid);
  const yesAsk =
    parseKalshiPrice(market?.yes_ask_dollars) ??
    parseKalshiPrice(market?.yes_ask);
  const lastTradePrice =
    parseKalshiPrice(market?.last_price_dollars) ??
    parseKalshiPrice(market?.last_price);
  const midpointPrice =
    yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : yesBid ?? yesAsk ?? null;
  const yesPrice =
    explicitYesPrice && explicitYesPrice > 0
      ? explicitYesPrice
      : lastTradePrice && lastTradePrice > 0
        ? lastTradePrice
        : midpointPrice ?? 0;

  const noPrice =
    parseKalshiPrice(market?.no_price_dollars) ??
    parseKalshiPrice(market?.no_price) ??
    parseKalshiPrice(market?.no_ask_dollars) ??
    parseKalshiPrice(market?.no_bid_dollars) ??
    parseKalshiPrice(market?.no_ask) ??
    parseKalshiPrice(market?.no_bid) ??
    Math.max(0, 1 - yesPrice);

  const volume =
    parseKalshiMetric(market?.volume) ??
    parseKalshiMetric(market?.volume_dollars) ??
    parseKalshiMetric(market?.volume_24h_fp) ??
    parseKalshiMetric(market?.volume_fp) ??
    parseKalshiMetric(market?.volume_24h) ??
    0;

  const liquidity =
    parseKalshiMetric(market?.liquidity_dollars) ??
    parseKalshiMetric(market?.liquidity) ??
    parseKalshiMetric(market?.open_interest_fp) ??
    parseKalshiMetric(market?.open_interest) ??
    0;

  const question = String(market?.title || market?.subtitle || market?.ticker || "").trim();
  if (!question) {
    return null;
  }

  return {
    id: market?.ticker || question,
    question,
    subtitle: market?.subtitle || null,
    ticker: market?.ticker || null,
    eventTicker: market?.event_ticker || null,
    outcomePrices: JSON.stringify([yesPrice]),
    yes_price: yesPrice,
    no_price: noPrice,
    volume,
    liquidity,
    openInterest: parseKalshiMetric(market?.open_interest_fp) ?? parseKalshiMetric(market?.open_interest) ?? 0,
    endDate: market?.close_time || market?.expiration_time || null,
    closeDate: market?.close_time || market?.expiration_time || null,
    rulesPrimary: market?.rules_primary || null,
    rulesSecondary: market?.rules_secondary || null,
    slug: market?.ticker || null,
    platform: "Kalshi",
  };
}

function normalizePolymarketMarket(market, event = null) {
  if (!market || typeof market !== "object") {
    return null;
  }

  const closed = event
    ? event.closed === true || event.active === false
    : market.closed === true || market.active === false;
  if (closed) {
    return null;
  }

  const question = String(
    market.question ||
    market.title ||
    event?.question ||
    event?.title ||
    ""
  ).trim();

  if (!question) {
    return null;
  }

  const slug = market.slug || event?.slug || null;
  const description = market.description || event?.description || event?.subtitle || "";

  return {
    id: market.id || slug || question,
    question,
    slug,
    outcomePrices: market.outcomePrices,
    outcomes: market.outcomes,
    volume: market.volume || event?.volume || 0,
    liquidity: market.liquidity || event?.liquidity || 0,
    endDate: market.endDate || market.end_date || event?.endDate || event?.end_date || null,
    image: market.image || event?.image || null,
    description,
    platform: "Polymarket",
  };
}

function flattenPolymarketEvents(events) {
  const flattened = [];

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== "object") continue;
    if (event.closed === true || event.active === false) continue;

    const eventMarkets = Array.isArray(event.markets) ? event.markets : [];
    for (const market of eventMarkets) {
      const normalizedMarket = normalizePolymarketMarket(market, event);
      if (normalizedMarket) {
        flattened.push(normalizedMarket);
      }
    }
  }

  return flattened;
}

async function fetchPolymarketEvents(params = {}) {
  const response = await axios.get("https://gamma-api.polymarket.com/events", {
    params: {
      active: true,
      closed: false,
      limit: POLYMARKET_EVENT_PAGE_LIMIT,
      offset: 0,
      ...params,
    },
    timeout: 10000,
  });

  return Array.isArray(response.data) ? response.data : [];
}

function dedupeMarketsById(markets) {
  const seen = new Set();
  return markets.filter((market) => {
    if (!market?.id || seen.has(market.id)) return false;
    seen.add(market.id);
    return true;
  });
}

function isOpenManifoldMarket(market) {
  if (!market || market.isResolved === true) {
    return false;
  }

  if (market.closeTime == null) {
    return true;
  }

  return Number(market.closeTime) > Date.now();
}

function normalizeManifoldMarket(market) {
  if (!isOpenManifoldMarket(market)) {
    return null;
  }

  return {
    id: market.id,
    question: market.question,
    description: market.description || market.textDescription || "",
    outcomePrices: JSON.stringify([market.probability || 0]),
    volume: market.volume || market.volume24Hours || 0,
    liquidity: market.totalLiquidity || 0,
    endDate: market.closeTime ? new Date(market.closeTime).toISOString() : null,
    closeDate: market.closeTime ? new Date(market.closeTime).toISOString() : null,
    slug: market.slug,
    platform: "Manifold",
    url: market.url,
    creatorName: market.creatorName,
    creatorUsername: market.creatorUsername,
  };
}

async function fetchKalshiMarkets(params = {}) {
  const requestedLimit = Number.parseInt(params.limit, 10);
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 500))
    : 200;

  const baseParams = {
    limit: safeLimit,
    status: "open",
    ...params,
  };

  delete baseParams.mve_filter;

  try {
    const response = await axios.get(`${KALSHI_MARKET_DATA_BASE_URL}/markets`, {
      params: baseParams,
      timeout: 10000,
    });

    const rawMarkets = Array.isArray(response.data?.markets) ? response.data.markets : [];
    return rawMarkets.map(normalizeKalshiMarket).filter(Boolean);
  } catch (error) {
    if (error?.response?.status !== 400) {
      throw error;
    }

    const fallbackParams = {
      limit: Math.min(safeLimit, 200),
      status: "open",
    };

    console.warn(`[Kalshi] Upstream rejected params ${JSON.stringify(baseParams)}. Retrying with ${JSON.stringify(fallbackParams)}.`);

    const fallbackResponse = await axios.get(`${KALSHI_MARKET_DATA_BASE_URL}/markets`, {
      params: fallbackParams,
      timeout: 10000,
    });

    const rawMarkets = Array.isArray(fallbackResponse.data?.markets) ? fallbackResponse.data.markets : [];
    return rawMarkets.map(normalizeKalshiMarket).filter(Boolean);
  }
}

// --- Helper: call Gemini with retry ---
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleGeminiRequest() {
  const previous = geminiRequestChain;
  let release;
  geminiRequestChain = new Promise((resolve) => {
    release = resolve;
  });

  await previous;

  const now = Date.now();
  const delay = Math.max(0, nextGeminiRequestAt - now);
  if (delay > 0) {
    console.log(`    Gemini throttle: waiting ${Math.ceil(delay / 1000)}s before next request...`);
    await wait(delay);
  }

  nextGeminiRequestAt = Date.now() + GEMINI_MIN_GAP_MS;

  return () => {
    release();
  };
}

async function geminiCall(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const release = await scheduleGeminiRequest();
    try {
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      const message = String(err?.message || "");
      const permanentFailure = isGeminiPermanentFailure(message);
      const transientFailure =
        message.includes("429") ||
        message.includes("404") ||
        message.includes("500") ||
        message.includes("503");
      const shouldRetry = transientFailure && !permanentFailure && i < retries - 1;

      if (shouldRetry) {
        const wait = (i + 1) * 3000; // 3s, 6s
        console.log(`    Gemini request failed (${message.includes("404") ? "model unavailable" : "rate limited"}), waiting ${wait / 1000}s...`);
        nextGeminiRequestAt = Math.max(nextGeminiRequestAt, Date.now() + wait);
      } else {
        throw err;
      }
    } finally {
      release();
    }
  }
}

// --- Agent 1: Parse thesis into search keywords ---
async function parseThesis(thesis, thesisHistory = []) {
  const historyContext = formatThesisHistoryContext(thesisHistory);
  const text = await geminiCall(
    `You are a financial research assistant. Given a user's market thesis, extract 3-5 concise search keywords or phrases that would help find relevant prediction markets across Polymarket, Kalshi, and Manifold. Favor portable concepts that work across platforms, not site-specific phrasing. Return ONLY a JSON array of strings, nothing else.\n\nUser thesis: "${thesis}"${historyContext}`
  );
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    return JSON.parse(match[0]);
  }
  return [thesis.slice(0, 50)];
}

function tokenizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function marketMatchesKeyword(keyword, values) {
  const normalizedKeyword = String(keyword || "").toLowerCase().trim();
  if (!normalizedKeyword) return false;

  const haystack = values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (haystack.includes(normalizedKeyword)) {
    return true;
  }

  const keywordTokens = tokenizeSearchText(normalizedKeyword);
  if (keywordTokens.length === 0) {
    return false;
  }

  const haystackTokens = new Set(tokenizeSearchText(haystack));
  const overlap = keywordTokens.filter((token) => haystackTokens.has(token)).length;

  if (keywordTokens.length === 1) {
    return overlap === 1;
  }

  return overlap >= Math.max(2, Math.ceil(keywordTokens.length * 0.6));
}

function computeTokenOverlap(tokens, tokenSet) {
  if (!Array.isArray(tokens) || tokens.length === 0 || !(tokenSet instanceof Set) || tokenSet.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of tokens) {
    if (tokenSet.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(1, Math.min(tokens.length, tokenSet.size));
}

function scoreMarketRelevance(thesis, market, keywords = []) {
  const thesisTokens = Array.from(new Set(tokenizeSearchText(thesis)));
  const questionText = [market?.question, market?.subtitle, market?.eventTicker, market?.ticker]
    .filter(Boolean)
    .join(" ");
  const detailText = [market?.description, market?.rulesPrimary, market?.rulesSecondary]
    .filter(Boolean)
    .join(" ");

  const questionTokens = new Set(tokenizeSearchText(questionText));
  const detailTokens = new Set(tokenizeSearchText(detailText));
  const normalizedQuestion = questionText.toLowerCase();
  const normalizedDetail = detailText.toLowerCase();
  const normalizedThesis = String(thesis || "").toLowerCase();

  let score = 0;
  score += computeTokenOverlap(thesisTokens, questionTokens) * 8;
  score += computeTokenOverlap(thesisTokens, detailTokens) * 3;

  if (normalizedThesis && normalizedQuestion.includes(normalizedThesis)) {
    score += 4;
  }

  for (const keyword of keywords) {
    const normalizedKeyword = String(keyword || "").toLowerCase().trim();
    if (!normalizedKeyword) continue;

    if (marketMatchesKeyword(normalizedKeyword, [questionText, detailText])) {
      score += normalizedQuestion.includes(normalizedKeyword) ? 2.5 : 1.25;
    }
  }

  const volume = Number(market?.volume) || 0;
  const liquidity = Number(market?.liquidity) || 0;
  score += Math.min(1.5, Math.log10(1 + volume + liquidity));

  return score;
}

function compareMarketsByRelevance(a, b, thesis, keywords = []) {
  const scoreA = scoreMarketRelevance(thesis, a, keywords);
  const scoreB = scoreMarketRelevance(thesis, b, keywords);

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  const activityA = (Number(a?.volume) || 0) + (Number(a?.liquidity) || 0);
  const activityB = (Number(b?.volume) || 0) + (Number(b?.liquidity) || 0);
  return activityB - activityA;
}

function sortMarketsByRelevance(markets, thesis, keywords = []) {
  return [...markets].sort((a, b) => compareMarketsByRelevance(a, b, thesis, keywords));
}

function selectMarketsForRanking(markets, thesis, keywords = [], limit = 24) {
  const byPlatform = {
    Polymarket: sortMarketsByRelevance(markets.filter((market) => market?.platform === "Polymarket"), thesis, keywords),
    Kalshi: sortMarketsByRelevance(markets.filter((market) => market?.platform === "Kalshi"), thesis, keywords),
    Manifold: sortMarketsByRelevance(markets.filter((market) => market?.platform === "Manifold"), thesis, keywords),
  };

  const selected = [];
  const seen = new Set();
  const platforms = ["Polymarket", "Kalshi", "Manifold"];

  while (selected.length < limit) {
    let added = false;

    for (const platform of platforms) {
      const nextMarket = byPlatform[platform].shift();
      if (!nextMarket || seen.has(nextMarket.id)) continue;
      selected.push(nextMarket);
      seen.add(nextMarket.id);
      added = true;

      if (selected.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }
  }

  if (selected.length < limit) {
    const remaining = sortMarketsByRelevance(markets, thesis, keywords);
    for (const market of remaining) {
      if (seen.has(market.id)) continue;
      selected.push(market);
      seen.add(market.id);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}

// --- Agent 2: Search Polymarket for relevant markets ---
async function searchPolymarket(keywords) {
  const allMarkets = [];
  const pagedEvents = [];

  for (let page = 0; page < POLYMARKET_SEARCH_EVENT_PAGES; page += 1) {
    try {
      const events = await fetchPolymarketEvents({
        order: "volume24hr",
        ascending: false,
        limit: POLYMARKET_EVENT_PAGE_LIMIT,
        offset: page * POLYMARKET_EVENT_PAGE_LIMIT,
      });
      pagedEvents.push(...events);
      if (events.length < POLYMARKET_EVENT_PAGE_LIMIT) {
        break;
      }
    } catch (err) {
      console.error(`Polymarket event fetch failed for page ${page + 1}:`, err.message);
      break;
    }
  }

  const markets = dedupeMarketsById(flattenPolymarketEvents(pagedEvents));
  console.log(`    Polymarket fetched ${pagedEvents.length} events -> ${markets.length} markets before keyword matching`);

  for (const keyword of keywords) {
    try {
      const matchedMarkets = markets.filter((market) =>
        marketMatchesKeyword(keyword, [
          market.question,
          market.description,
        ])
      );

      allMarkets.push(...matchedMarkets);
    } catch (err) {
      console.error(`Polymarket local match failed for "${keyword}":`, err.message);
    }
  }

  return dedupeMarketsById(allMarkets).slice(0, POLYMARKET_SEARCH_LIMIT * Math.max(1, keywords.length));
}

// --- Agent 2b: Search Kalshi for relevant markets ---
async function searchKalshi(keywords) {
  const allMarkets = [];
  let markets = [];

  try {
    markets = await fetchKalshiMarkets({ limit: 1000 });
  } catch (err) {
    console.error("Kalshi market fetch failed:", err.message);
    return [];
  }

  for (const keyword of keywords) {
    try {
      const matchedMarkets = markets.filter((market) =>
        marketMatchesKeyword(keyword, [
          market.question,
          market.subtitle,
          market.eventTicker,
          market.ticker,
          market.rulesPrimary,
          market.rulesSecondary,
        ])
      );

      allMarkets.push(...matchedMarkets);
    } catch (err) {
      console.error(`Kalshi search failed for "${keyword}":`, err.message);
    }
  }

  // Deduplicate by ticker
  const seen = new Set();
  return allMarkets.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// --- Agent 2c: Search Manifold for relevant markets ---
async function searchManifold(keywords) {
  const allMarkets = [];
  let catalog = [];

  try {
    const response = await axios.get(
      "https://api.manifold.markets/v0/markets",
      {
        params: {
          limit: MANIFOLD_CATALOG_LIMIT,
        },
        timeout: 10000,
      }
    );

    catalog = (response.data || []).filter(isOpenManifoldMarket);
  } catch (err) {
    console.error("Manifold catalog fetch failed:", err.message);
  }

  for (const keyword of keywords) {
    try {
      const response = await axios.get(
        "https://api.manifold.markets/v0/search-markets",
        {
          params: {
            term: keyword,
            limit: MANIFOLD_SEARCH_LIMIT,
          },
          timeout: 8000,
        }
      );

      const searchMatches = response.data || [];
      const catalogMatches = catalog.filter((market) =>
        marketMatchesKeyword(keyword, [
          market.question,
          market.description,
          market.textDescription,
          market.slug,
        ])
      );

      const markets = [...searchMatches, ...catalogMatches];

      for (const market of markets) {
        const normalizedMarket = normalizeManifoldMarket(market);
        if (normalizedMarket) {
          allMarkets.push(normalizedMarket);
        }
      }
    } catch (err) {
      console.error(`Manifold search failed for "${keyword}":`, err.message);
    }
  }

  // Deduplicate by id
  const dedupedMarkets = dedupeMarketsById(allMarkets);
  console.log(`    Manifold fetched ${catalog.length} catalog markets -> ${dedupedMarkets.length} matches after keyword search`);
  return dedupedMarkets;
}

function normalizeProbability(value) {
  const numeric = toFiniteNumber(value, null);
  if (!Number.isFinite(numeric)) return null;

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  if (numeric < 0 || numeric > 1) {
    return null;
  }

  return numeric;
}

function parseOutcomePrices(outcomePrices) {
  if (Array.isArray(outcomePrices)) {
    return outcomePrices;
  }

  if (typeof outcomePrices === "string") {
    try {
      const parsed = JSON.parse(outcomePrices);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function extractYesNoOdds(market) {
  let yesOdds = normalizeProbability(market?.yes_price);
  let noOdds = normalizeProbability(market?.no_price);

  const parsedOutcomePrices = parseOutcomePrices(market?.outcomePrices);
  const parsedYes = normalizeProbability(parsedOutcomePrices[0]);
  const parsedNo = normalizeProbability(parsedOutcomePrices[1]);

  if (yesOdds === null && parsedYes !== null) {
    yesOdds = parsedYes;
  }

  if (noOdds === null && parsedNo !== null) {
    noOdds = parsedNo;
  }

  if (yesOdds === null && noOdds !== null) {
    yesOdds = Math.max(0, Math.min(1, 1 - noOdds));
  }

  if (noOdds === null && yesOdds !== null) {
    noOdds = Math.max(0, Math.min(1, 1 - yesOdds));
  }

  return { yesOdds, noOdds };
}

function normalizeSuggestedPosition(value) {
  const normalized = String(value || "").toUpperCase();
  return normalized === "NO" ? "NO" : "YES";
}

function buildMarketUrl(platform, slug, original) {
  if (platform === "Polymarket" && slug) {
    return `https://polymarket.com/event/${slug}`;
  }

  if (platform === "Kalshi" && slug) {
    return `https://kalshi.com/markets/${slug}`;
  }

  if (platform === "Manifold") {
    return original?.url || (slug ? `https://manifold.markets/${slug}` : null);
  }

  return null;
}

function hydrateRankedPick(rankedPick, markets) {
  const original = markets.find((market) => market.id === rankedPick.id);
  const platform = rankedPick.platform || original?.platform || "Polymarket";
  const suggestedPosition = normalizeSuggestedPosition(rankedPick.suggested_position);
  const { yesOdds, noOdds } = extractYesNoOdds(original || {});
  const llmCurrentPrice = normalizeProbability(rankedPick.current_price);
  const resolvedCurrentPrice =
    llmCurrentPrice ?? (suggestedPosition === "YES" ? yesOdds : noOdds);

  return {
    ...rankedPick,
    platform,
    suggested_position: suggestedPosition,
    current_price: resolvedCurrentPrice,
    yes_odds: yesOdds,
    no_odds: noOdds,
    image: original?.image || null,
    volume: original?.volume || null,
    liquidity: original?.liquidity || null,
    endDate: original?.endDate || null,
    marketUrl: buildMarketUrl(platform, rankedPick.slug, original),
  };
}

function scoreExistingPick(pick, markets, thesis, keywords = []) {
  const original = markets.find((market) => market.id === pick?.id);
  const localRelevance = scoreMarketRelevance(thesis, original || pick, keywords);
  const llmRelevance = Math.max(0, Math.min(10, toFiniteNumber(pick?.relevance_score, 0)));

  return {
    ...pick,
    _localRelevance: localRelevance,
    _combinedRelevance: localRelevance + llmRelevance / 5,
  };
}

function stripInternalPickFields(pick) {
  if (!pick || typeof pick !== "object") return pick;

  const { _localRelevance, _combinedRelevance, ...cleaned } = pick;
  return cleaned;
}

function balanceRankedPicks(picks, markets, thesis, keywords = [], limit = 5) {
  const uniquePicks = [];
  const seen = new Set();

  for (const pick of picks) {
    if (!pick?.id || seen.has(pick.id)) continue;
    uniquePicks.push(scoreExistingPick(pick, markets, thesis, keywords));
    seen.add(pick.id);
  }

  const validatedPicks = uniquePicks
    .filter((pick) => pick._localRelevance >= MIN_VALIDATED_PICK_RELEVANCE)
    .sort((left, right) => right._combinedRelevance - left._combinedRelevance);

  const rejectedPicks = uniquePicks.filter((pick) => pick._localRelevance < MIN_VALIDATED_PICK_RELEVANCE);
  if (rejectedPicks.length > 0) {
    console.log(
      `    Rejected ${rejectedPicks.length} weak ranked picks: ${rejectedPicks
        .slice(0, 3)
        .map((pick) => `"${pick.question}" (${pick.platform}, ${pick._localRelevance.toFixed(2)})`)
        .join(", ")}`
    );
  }
  const result = [];
  const usedIds = new Set();
  const platformCounts = Object.fromEntries(["Polymarket", "Kalshi", "Manifold"].map((platform) => [platform, 0]));
  const maxPerPlatform = 2;

  for (const pick of validatedPicks) {
    const platform = pick.platform || "Polymarket";
    if ((platformCounts[platform] || 0) >= maxPerPlatform) continue;

    result.push(pick);
    usedIds.add(pick.id);
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  }

  return result
    .sort((left, right) => (right._combinedRelevance || 0) - (left._combinedRelevance || 0))
    .slice(0, limit)
    .map(stripInternalPickFields);
}

// --- Agent 3: Rank and explain picks ---
async function rankMarkets(thesis, markets, thesisHistory = [], keywords = []) {
  if (markets.length === 0) {
    return [];
  }

  const historyContext = formatThesisHistoryContext(thesisHistory);
  const rankingCandidates = selectMarketsForRanking(markets, thesis, keywords, 24);
  console.log(
    `    Ranking candidates: ${rankingCandidates.filter((market) => market.platform === "Polymarket").length} Polymarket, ` +
    `${rankingCandidates.filter((market) => market.platform === "Kalshi").length} Kalshi, ` +
    `${rankingCandidates.filter((market) => market.platform === "Manifold").length} Manifold`
  );

  const marketSummaries = rankingCandidates.map((m) => ({
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
    platform: m.platform || 'Polymarket',
  }));

  const text = await geminiCall(
    `You are Backboard, an expert prediction-market analyst. A user has the following market thesis:\n\n"${thesis}"${historyContext}\n\nSearch keywords used:\n${JSON.stringify(keywords, null, 2)}\n\nHere are prediction markets from Polymarket, Kalshi, and Manifold:\n${JSON.stringify(marketSummaries, null, 2)}\n\nSelect the top 5 most relevant REAL markets. Balance the output across platforms: include Polymarket, Kalshi, and Manifold whenever relevant candidates from those platforms are present. Do not over-index on Polymarket volume. Avoid weak or generic matches that only loosely connect to the thesis. For each, return a JSON object with: "id", "question", "relevance_score" (1-10), "suggested_position" ("YES" or "NO"), "current_price", "one_liner" (single sentence why it fits), "slug", "platform". Return ONLY a JSON array.`
  );

  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const ranked = JSON.parse(match[0]);
      const hydrated = ranked.map((entry) => hydrateRankedPick(entry, markets));
      return balanceRankedPicks(hydrated, markets, thesis, keywords);
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
    const { yesOdds, noOdds } = extractYesNoOdds(market);
    const platform = market.platform || 'Polymarket';
    let marketUrl = null;
    if (platform === 'Polymarket' && market.slug) {
      marketUrl = `https://polymarket.com/event/${market.slug}`;
    } else if (platform === 'Kalshi' && market.slug) {
      marketUrl = `https://kalshi.com/markets/${market.slug}`;
    } else if (platform === 'Manifold') {
      marketUrl = market.url || `https://manifold.markets/${market.slug}`;
    }

    return {
      id: market.id,
      question: market.question,
      relevance_score: Math.max(10 - index, 1),
      suggested_position: "YES",
      current_price: yesOdds,
      yes_odds: yesOdds,
      no_odds: noOdds,
      one_liner: `Fallback ranking for thesis: ${thesis}`,
      slug: market.slug || null,
      platform,
      image: market.image || null,
      volume: market.volume || null,
      liquidity: market.liquidity || null,
      endDate: market.endDate || null,
      marketUrl,
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

function buildFallbackRebalancePositions(basket, driftThreshold = 0.05) {
  if (!Array.isArray(basket)) return [];

  return basket
    .map((entry) => {
      const targetWeight = normalizeWeightFraction(
        entry?.target_weight ??
        entry?.weight ??
        entry?.allocation ??
        0
      );

      const currentWeight = normalizeWeightFraction(
        entry?.current_weight ??
        entry?.currentWeight ??
        targetWeight
      );

      const drift = currentWeight - targetWeight;
      const absDrift = Math.abs(drift);

      if (targetWeight <= 0 || absDrift < driftThreshold) {
        return null;
      }

      return {
        market: entry?.market || entry?.question || entry?.name || "Basket position",
        platform: entry?.platform || "Polymarket",
        direction: drift > 0 ? "DECREASE" : "INCREASE",
        adjustment_pct: absDrift,
        target_weight: targetWeight,
        current_weight: currentWeight,
        source: "drift_fallback",
      };
    })
    .filter(Boolean);
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

    // Step 2: Search Polymarket, Kalshi, and Manifold
    console.log("  → Agent 2: Searching markets...");
    const [polymarkets, kalshiMarkets, manifoldMarkets] = await Promise.all([
      searchPolymarket(keywords),
      searchKalshi(keywords),
      searchManifold(keywords),
    ]);
    const markets = [...polymarkets, ...kalshiMarkets, ...manifoldMarkets];
    console.log(`    Found ${markets.length} markets (${polymarkets.length} Polymarket, ${kalshiMarkets.length} Kalshi, ${manifoldMarkets.length} Manifold)`);

    // Step 3: Rank and explain
    console.log("  → Agent 3: Ranking markets...");
    let picks = [];
    let rankingStrategy = "gemini";

    try {
      picks = await rankMarkets(thesis, markets, thesisHistory, keywords);
      if (!Array.isArray(picks) || picks.length === 0) {
        rankingStrategy = "gemini_empty";
        picks = [];
      }
    } catch (rankingError) {
      rankingStrategy = "gemini_failed";
      picks = [];
      console.error("    Ranking failed, returning no picks:", rankingError.message);
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
    const requestedLimit = Number.parseInt(req.query._limit ?? req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 500)) : 20;
    const response = await axios.get("https://gamma-api.polymarket.com/markets", {
      params: {
        _limit: limit,
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
    const events = [];

    for (let page = 0; page < POLYMARKET_SEARCH_EVENT_PAGES; page += 1) {
      const fetchedEvents = await fetchPolymarketEvents({
        order: "volume24hr",
        ascending: false,
        limit: POLYMARKET_EVENT_PAGE_LIMIT,
        offset: page * POLYMARKET_EVENT_PAGE_LIMIT,
      });

      events.push(...fetchedEvents);
      if (fetchedEvents.length < POLYMARKET_EVENT_PAGE_LIMIT) {
        break;
      }
    }

    const matches = dedupeMarketsById(flattenPolymarketEvents(events))
      .filter((market) => marketMatchesKeyword(q, [market.question, market.description]))
      .slice(0, POLYMARKET_SEARCH_LIMIT);

    res.json({ markets: matches, count: matches.length, query: q });
  } catch (err) {
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

// Kalshi markets endpoints
app.get("/api/kalshi/trending", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const markets = await fetchKalshiMarkets({ limit: 2000 }); // Fetch more to ensure we have enough

    // Prefer markets with real trading activity, then fall back to quoted books.
    markets.sort((a, b) => {
      const activityA = (a.volume || 0) * 1000 + (a.openInterest || 0);
      const activityB = (b.volume || 0) * 1000 + (b.openInterest || 0);
      return activityB - activityA;
    });

    const activeMarkets = markets.filter((market) => (market.volume || 0) > 0 || (market.openInterest || 0) > 0);
    const topMarkets = (activeMarkets.length > 0 ? activeMarkets : markets).slice(0, limit);

    console.log(`[Kalshi] Requested ${limit}, got ${topMarkets.length} markets`);
    res.json({ markets: topMarkets, count: topMarkets.length });
  } catch (err) {
    console.error("Kalshi fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch from Kalshi", details: err.message });
  }
});

app.get("/api/kalshi/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Query param 'q' required" });

    const queryLower = q.toLowerCase();
    const markets = await fetchKalshiMarkets({ limit: 200 });
    const matches = markets.filter((market) =>
      [market.question, market.subtitle, market.eventTicker, market.ticker]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(queryLower))
    );

    res.json({ markets: matches.slice(0, 15), count: matches.length, query: q });
  } catch (err) {
    console.error("Kalshi search error:", err.message);
    res.status(500).json({ error: "Search failed", details: err.message });
  }
});

app.get("/api/manifold/trending", async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit ?? req.query._limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 500)) : 100;
    const apiLimit = Math.min(limit * 2, 500); // Fetch more to account for filtering

    const response = await axios.get("https://api.manifold.markets/v0/markets", {
      params: {
        limit: apiLimit,
      },
      timeout: 10000,
    });

    // Filter out resolved markets and sort by volume + liquidity
    const markets = (response.data || [])
      .filter((m) => !m.isResolved && m.closeTime > Date.now())
      .map((m) => ({
        id: m.id,
        question: m.question,
        slug: m.slug,
        url: m.url,
        probability: m.probability || 0,
        volume: m.volume || m.volume24Hours || 0,
        liquidity: m.totalLiquidity || 0,
        closeDate: m.closeTime ? new Date(m.closeTime).toISOString() : null,
        creatorName: m.creatorName,
        creatorUsername: m.creatorUsername,
      }))
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, limit);
    
    res.json({ markets, count: markets.length });
  } catch (err) {
    console.error("Manifold fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch from Manifold", details: err.message });
  }
});

app.get("/api/manifold/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Query param 'q' required" });
    
    const response = await axios.get("https://api.manifold.markets/v0/search-markets", {
      params: {
        term: q,
        limit: MANIFOLD_SEARCH_LIMIT,
      },
      timeout: 8000,
    });
    
    // Filter out resolved markets
    const markets = (response.data || [])
      .map(normalizeManifoldMarket)
      .filter(Boolean)
      .slice(0, 15);
    
    res.json({ markets, count: markets.length, query: q });
  } catch (err) {
    console.error("Manifold search error:", err.message);
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

// Find related markets for a given market
app.get("/api/markets/:platform/:id/related", async (req, res) => {
  try {
    const { platform, id } = req.params;
    const { maxResults = 5, minConfidence = 0.6 } = req.query;

    // Check cache first
    const cacheKey = `${platform}:${id}`;
    const cached = getCachedRelationships(cacheKey);
    if (cached) {
      return res.json({ relationships: cached, cached: true });
    }

    // Fetch target market based on platform
    let targetMarket = null;
    let candidateMarkets = [];

    // Fetch from all platforms to find candidates
    const [polymarkets, kalshiMarkets, manifoldMarkets] = await Promise.all([
      axios.get("https://gamma-api.polymarket.com/markets", {
        params: { limit: 50, closed: false },
        timeout: 8000,
      }).then(r => r.data || []).catch(() => []),

      axios.get("https://trading-api.kalshi.com/trade-api/v2/events", {
        params: { limit: 20, status: "open", with_nested_markets: true },
        timeout: 8000,
      }).then(r => {
        const events = r.data?.events || [];
        const markets = [];
        for (const event of events) {
          if (event.markets && Array.isArray(event.markets)) {
            for (const market of event.markets) {
              if (market.status === "open") {
                markets.push({
                  id: market.ticker,
                  question: market.title || event.title,
                  platform: 'Kalshi',
                  slug: market.ticker,
                });
              }
            }
          }
        }
        return markets;
      }).catch(() => []),

      axios.get("https://api.manifold.markets/v0/markets", {
        params: { limit: 50 },
        timeout: 8000,
      }).then(r => (r.data || []).filter(m => !m.isResolved && m.closeTime > Date.now()).map(m => ({
        id: m.id,
        question: m.question,
        platform: 'Manifold',
        slug: m.slug,
        url: m.url,
        description: m.description || m.textDescription,
      }))).catch(() => []),
    ]);

    // Normalize Polymarket markets
    const normalizedPolymarkets = polymarkets.map(m => ({
      id: m.id,
      question: m.question,
      platform: 'Polymarket',
      slug: m.slug,
      description: m.description,
    }));

    candidateMarkets = [...normalizedPolymarkets, ...kalshiMarkets, ...manifoldMarkets];

    // Find target market in the fetched data
    if (platform.toLowerCase() === 'polymarket') {
      targetMarket = normalizedPolymarkets.find(m => m.id === id);
    } else if (platform.toLowerCase() === 'kalshi') {
      targetMarket = kalshiMarkets.find(m => m.id === id);
    } else if (platform.toLowerCase() === 'manifold') {
      targetMarket = manifoldMarkets.find(m => m.id === id);
    }

    if (!targetMarket) {
      return res.status(404).json({ error: "Market not found" });
    }

    // Remove target market from candidates
    candidateMarkets = candidateMarkets.filter(m => m.id !== id);

    // Find relationships
    const relationships = await findMarketRelationships(
      targetMarket,
      candidateMarkets,
      { maxResults: parseInt(maxResults) || 5, minConfidence: parseFloat(minConfidence) || 0.6 }
    );

    // Cache the result
    setCachedRelationships(cacheKey, relationships);

    res.json({ relationships, cached: false });
  } catch (err) {
    console.error("Find related markets error:", err.message);
    res.status(500).json({ error: "Failed to find related markets", details: err.message });
  }
});

// Scanner endpoint: validates arb opportunity and formats as alert card
function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

const ARB_SCANNER_TIMEOUT_MS = 3000;
const ARB_DISPATCHER_TIMEOUT_MS = 1200;
const ARB_GEMINI_TIMEOUT_MS = 9000;
const ENABLE_ARB_DISPATCHER_ENRICH = process.env.ARB_SCAN_USE_DISPATCHER === "1";
const ENABLE_ARB_GEMINI_FALLBACK = process.env.ARB_SCAN_GEMINI_FALLBACK === "1";

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

    const buildHeuristicAlert = (summary, source = "heuristic_fallback") => {
      const spread = Math.abs(rightPrice - leftPrice);
      const adjustedSpread = Math.max(0, spread - 0.02);
      const confidence = Math.min(0.85, Math.max(0.35, 0.45 + Math.min(spread, 0.25)));
      const decision = adjustedSpread >= 0.03 ? "CONFIRMED" : "REJECTED";
      const urgency = adjustedSpread >= 0.1 ? "HIGH" : adjustedSpread >= 0.05 ? "MEDIUM" : "LOW";
      const titleWords = question.split(" ").slice(0, 8).join(" ");
      const title = titleWords.length > 1 ? titleWords : question.slice(0, 50);

      return {
        id: `scan-${Date.now()}`,
        decision,
        title,
        summary,
        platforms: [platformA, platformB],
        spread,
        adjusted_spread: adjustedSpread,
        confidence,
        priceA: leftPrice,
        priceB: rightPrice,
        question,
        actions: defaultActionsForSpread(platformA, platformB, leftPrice, rightPrice),
        urgency,
        risk_flags: ["heuristic_fallback"],
        source,
        timestamp: new Date().toISOString(),
      };
    };

    try {
      const scannerMessage = `Raw alert: ${platformA} YES @ ${leftPrice}, ${platformB} YES @ ${rightPrice}, question: ${question}. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), spread (number), reasoning (string), confidence (number 0..1). No markdown.`;
      const scannerResponse = await withTimeout(
        validateArbitrage(scannerMessage),
        ARB_SCANNER_TIMEOUT_MS,
        "ArbitrageScanner"
      );
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

      const titleWords = question.split(" ").slice(0, 8).join(" ");
      const defaultTitle = titleWords.length > 1 ? titleWords : question.slice(0, 50);
      const defaultUrgency =
        scannerSpread >= 0.12 && scannerConfidence >= 0.55
          ? "HIGH"
          : scannerSpread >= 0.07 && scannerConfidence >= 0.45
            ? "MEDIUM"
            : "LOW";

      const baseAlert = {
        id: `scan-${Date.now()}`,
        decision: scannerDecision,
        title: defaultTitle,
        summary: scannerReasoning,
        platforms: [platformA, platformB],
        spread: scannerSpread,
        adjusted_spread: Math.max(0, scannerSpread - 0.02),
        confidence: scannerConfidence,
        priceA: leftPrice,
        priceB: rightPrice,
        question,
        actions: defaultActionsForSpread(platformA, platformB, leftPrice, rightPrice),
        urgency: defaultUrgency,
        risk_flags: Array.isArray(scannerPayload.risk_flags)
          ? scannerPayload.risk_flags.filter((flag) => typeof flag === "string" && flag.trim().length > 0)
          : [],
        source: "agents_scanner",
        timestamp: new Date().toISOString(),
      };

      if (!ENABLE_ARB_DISPATCHER_ENRICH) {
        console.log(`  ✓ Scanner formatted: ${baseAlert.decision} ${baseAlert.title}`);
        return res.json(baseAlert);
      }

      const dispatchMessage = `Trade analysis: decision: ${scannerDecision}, ${platformA} YES @ ${leftPrice}, ${platformB} YES @ ${rightPrice}, question: ${question}, spread: ${scannerSpread}, confidence: ${scannerConfidence}, reasoning: ${scannerReasoning}. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), title, summary, platforms (array of 2 strings), spread (number), confidence (number 0..1), actions (array of {platform, action BUY/SELL}), urgency (LOW/MEDIUM/HIGH), risk_flags (array of strings). No markdown.`;
      try {
        const dispatcherResponse = await withTimeout(
          dispatchArbitrageAlert(dispatchMessage),
          ARB_DISPATCHER_TIMEOUT_MS,
          "AlertDispatcher"
        );
        const dispatcherPayload = parseAgentPayload(dispatcherResponse?.content);

        if (!dispatcherPayload || typeof dispatcherPayload !== "object") {
          throw new Error("AlertDispatcher returned unparseable output");
        }

        const alert = {
          ...baseAlert,
          decision: normalizeDecision(dispatcherPayload.decision, baseAlert.decision),
          title:
            typeof dispatcherPayload.title === "string" && dispatcherPayload.title.trim().length > 0
              ? dispatcherPayload.title.trim()
              : baseAlert.title,
          summary:
            typeof dispatcherPayload.summary === "string" && dispatcherPayload.summary.trim().length > 0
              ? dispatcherPayload.summary.trim()
              : baseAlert.summary,
          platforms: normalizePlatforms(dispatcherPayload.platforms, platformA, platformB),
          spread: toFiniteNumber(dispatcherPayload.spread, baseAlert.spread),
          adjusted_spread: toFiniteNumber(dispatcherPayload.adjusted_spread, baseAlert.adjusted_spread),
          confidence: clampConfidence(dispatcherPayload.confidence, baseAlert.confidence),
          actions: normalizeActions(
            dispatcherPayload.actions,
            platformA,
            platformB,
            leftPrice,
            rightPrice
          ),
          urgency: normalizeUrgency(dispatcherPayload.urgency, baseAlert.urgency),
          risk_flags: Array.isArray(dispatcherPayload.risk_flags)
            ? dispatcherPayload.risk_flags.filter((flag) => typeof flag === "string" && flag.trim().length > 0)
            : baseAlert.risk_flags,
          source: "agents_dispatcher",
        };

        console.log(`  ✓ Dispatcher enriched: ${alert.decision} ${alert.title}`);
        return res.json(alert);
      } catch (dispatcherError) {
        console.error(`  ! Dispatcher enrich skipped: ${dispatcherError.message}`);
        console.log(`  ✓ Scanner formatted: ${baseAlert.decision} ${baseAlert.title}`);
        return res.json(baseAlert);
      }
    } catch (agentChainError) {
      console.error(`  ! Agent chain failed, using Gemini fallback: ${agentChainError.message}`);

      if (!ENABLE_ARB_GEMINI_FALLBACK) {
        const quickAlert = buildHeuristicAlert(
          "Scanner unavailable. Returning fast heuristic score.",
          "heuristic_scanner_unavailable"
        );
        console.log(`  ✓ Heuristic fallback formatted: ${quickAlert.decision} ${quickAlert.title}`);
        return res.json(quickAlert);
      }
    }

    // Fallback: Gemini scorer
    try {
      const score = await withTimeout(
        scoreArbOpportunity(
          question,
          platformA,
          leftPrice,
          platformB,
          rightPrice
        ),
        ARB_GEMINI_TIMEOUT_MS,
        "GeminiArbScorer"
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

      return res.json(alert);
    } catch (fallbackError) {
      console.error(`  ! Gemini fallback failed: ${fallbackError.message}`);
      const quickAlert = buildHeuristicAlert(
        "Gemini fallback unavailable. Returning fast heuristic score.",
        "heuristic_gemini_unavailable"
      );
      console.log(`  ✓ Heuristic fallback formatted: ${quickAlert.decision} ${quickAlert.title}`);
      return res.json(quickAlert);
    }
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

    const parsedPositions =
      rebalancePayload?.positions ||
      rebalancePayload?.rebalances ||
      rebalancePayload?.instructions ||
      rebalancePayload?.rebalance_positions ||
      rebalancePayload?.rebalanceInstructions ||
      [];

    let positions = Array.isArray(parsedPositions) ? parsedPositions : [];

    if (positions.length === 0) {
      positions = buildFallbackRebalancePositions(basket, 0.05);
    }

    if (positions.length === 0) {
      return res.json({
        count: 0,
        trades: [],
        rebalance: rebalancePayload,
        noRebalanceNeeded: true,
        message: "No rebalance needed. All positions are within drift threshold.",
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

    if (trades.length === 0) {
      return res.json({
        count: 0,
        trades: [],
        rebalance: rebalancePayload,
        noRebalanceNeeded: true,
        message: "No rebalance needed. Suggested adjustments are below executable threshold.",
      });
    }

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

// AI-powered question similarity check
app.post("/api/arb/verify-similarity", async (req, res) => {
  const { questionA, questionB } = req.body;
  if (!questionA || !questionB) {
    return res.status(400).json({ error: "questionA and questionB required" });
  }

  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.json({ same: null, confidence: 0, reasoning: "No Gemini API key" });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    const prompt = `You are a prediction market analyst. Determine if these two questions are asking about the SAME real-world event/outcome (just worded differently), or if they are about DIFFERENT things.

Question A: "${questionA}"
Question B: "${questionB}"

Rules:
- "Will Italy qualify for the 2026 FIFA World Cup?" and "Will Italy make it to the 2026 World Cup?" = SAME (same country, same event, same action)
- "Will Italy qualify for the 2026 FIFA World Cup?" and "Will a previous winner win the 2026 FIFA World Cup?" = DIFFERENT (different subjects — Italy vs previous winner)
- "Will Italy qualify for the 2026 FIFA World Cup?" and "Will I get into MCSP 2026?" = DIFFERENT (completely unrelated)
- "Fairfield at Siena Winner?" and "Will a previous winner of the World Cup win?" = DIFFERENT (college sports vs World Cup)
- "Will Trump win the 2024 election?" and "Trump 2024 election winner" = SAME

Return ONLY a JSON object: {"same": true/false, "confidence": 0.0-1.0, "reasoning": "one sentence"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[verify-similarity] "${questionA.slice(0, 40)}" vs "${questionB.slice(0, 40)}" → same=${parsed.same} (${parsed.confidence})`);
      return res.json(parsed);
    }

    return res.json({ same: null, confidence: 0, reasoning: "Could not parse Gemini response" });
  } catch (err) {
    console.error("[verify-similarity] Error:", err.message);
    return res.json({ same: null, confidence: 0, reasoning: err.message });
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
