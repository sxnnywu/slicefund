import React, { useState, useEffect, useCallback, useRef } from "react";
import { findArbPairs } from "../utils/arbMatcher.js";

/* ── extract markets from any response shape ─────────── */

function extractMarkets(data) {
  // data is already an array of markets
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  // { markets: [...] }
  if (Array.isArray(data.markets)) return data.markets;
  // { data: [...] }
  if (Array.isArray(data.data)) return data.data;
  // { results: [...] }
  if (Array.isArray(data.results)) return data.results;
  // { items: [...] }
  if (Array.isArray(data.items)) return data.items;
  // Polymarket gamma sometimes nests: { data: { markets: [...] } }
  if (data.data && Array.isArray(data.data.markets)) return data.data.markets;
  return [];
}

/* ── fetch helpers — go through backend proxy ────────── */

async function fetchPolymarketMarkets(query, limit = 100) {
  try {
    const url = query
      ? `/api/polymarket/search?q=${encodeURIComponent(query)}&_limit=${limit}`
      : `/api/polymarket/trending?_limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Poly] ${url} → ${res.status}`);
      return [];
    }
    const data = await res.json();
    const markets = extractMarkets(data);
    console.log(`[Poly] ${url} → ${markets.length} markets`);
    return markets.map((m) => ({ ...m, platform: "Polymarket" }));
  } catch (e) {
    console.warn("Polymarket fetch:", e.message);
    return [];
  }
}

async function fetchKalshiMarkets(query) {
  try {
    const url = query
      ? `/api/kalshi/search?q=${encodeURIComponent(query)}`
      : `/api/kalshi/trending?limit=500`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Kalshi] ${url} → ${res.status}`);
      return [];
    }
    const data = await res.json();
    const markets = extractMarkets(data);
    console.log(`[Kalshi] ${url} → ${markets.length} markets`);
    return markets.map((m) => ({ ...m, platform: "Kalshi" }));
  } catch (e) {
    console.warn("Kalshi fetch:", e.message);
    return [];
  }
}

async function fetchManifoldMarkets(query) {
  try {
    const url = query
      ? `/api/manifold/search?q=${encodeURIComponent(query)}`
      : `/api/manifold/trending?limit=500`;
    const res = await fetch(url);
    let data;
    if (!res.ok) {
      // Fallback: call Manifold API directly
      console.warn(`[Manifold] proxy failed (${res.status}), trying direct API`);
      const directUrl = query
        ? `https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(query)}&limit=200`
        : `https://api.manifold.markets/v0/markets?limit=500`;
      const directRes = await fetch(directUrl);
      if (!directRes.ok) return [];
      data = await directRes.json();
    } else {
      data = await res.json();
    }
    const markets = extractMarkets(data);
    console.log(`[Manifold] → ${markets.length} markets (raw keys: ${Object.keys(data || {}).join(",")})`);
    return markets
      .filter((m) => {
        // Only open binary markets with real probability
        if (m.isResolved) return false;
        const prob = m.probability;
        return typeof prob === "number" && prob > 0.01 && prob < 0.99;
      })
      .map((m) => ({
        id: m.id,
        question: m.question,
        probability: m.probability,
        volume: m.volume || m.totalLiquidity || 0,
        slug: m.slug,
        url: m.url,
        platform: "Manifold",
      }));
  } catch (e) {
    console.warn("Manifold fetch:", e.message);
    return [];
  }
}

/* ── Also try fetching Polymarket directly if proxy gives 0 ── */

async function fetchPolymarketDirect(query, limit = 100) {
  try {
    const params = new URLSearchParams({
      _limit: String(limit),
      closed: "false",
      active: "true",
    });
    if (query) params.set("_q", query);
    const url = `https://gamma-api.polymarket.com/markets?${params}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const markets = Array.isArray(data) ? data : extractMarkets(data);
    console.log(`[Poly-Direct] → ${markets.length} markets`);
    return markets.map((m) => ({ ...m, platform: "Polymarket" }));
  } catch (e) {
    console.warn("Polymarket direct fetch:", e.message);
    return [];
  }
}

/* ── AI similarity verification ──────────────────────── */

async function verifySimilarityAI(questionA, questionB) {
  try {
    const res = await fetch("/api/arb/verify-similarity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionA, questionB }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── scan pair on backend ────────────────────────────── */

async function scanPairOnBackend(pair) {
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: pair.questionA,
        platformA: pair.marketA.platform,
        priceA: pair.priceA,
        platformB: pair.marketB.platform,
        priceB: pair.priceB,
        questionA: pair.questionA,
        questionB: pair.questionB,
        spread: pair.spread,
        sim: pair.similarity,
        aiVerified: pair._aiVerified || false,
        aiConfidence: pair._aiConfidence || 0,
        aiReasoning: pair._aiReason || null,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("Scan error:", e.message);
    return null;
  }
}

/* ── price / display helpers ─────────────────────────── */

function formatPrice(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return (p * 100).toFixed(0) + "¢";
}

function formatSpread(s) {
  if (!Number.isFinite(s)) return "—";
  return (s * 100).toFixed(0) + "¢";
}

function marketUrl(market) {
  if (market.platform === "Polymarket" && market.slug) return `https://polymarket.com/event/${market.slug}`;
  if (market.platform === "Kalshi" && (market.slug || market.ticker)) return `https://kalshi.com/markets/${market.slug || market.ticker}`;
  if (market.platform === "Manifold") return market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null);
  return null;
}

/* ── main component ──────────────────────────────────── */

export default function ArbScanner() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pairs, setPairs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [scanTime, setScanTime] = useState(0);
  const [progress, setProgress] = useState([]);
  const [fetchCounts, setFetchCounts] = useState({ poly: 0, kalshi: 0, manifold: 0 });
  const scanRef = useRef(false);
  const mountedRef = useRef(false);

  const PROGRESS_STEPS = [
    "Fetching markets from Polymarket",
    "Fetching markets from Kalshi",
    "Fetching markets from Manifold",
    "Finding cross-platform matches",
    "Verifying top pairs",
    "Scoring arbitrage opportunities",
  ];

  const advanceProgress = (step) => {
    setProgress((prev) => {
      const next = [...prev];
      for (let i = 0; i < step; i++) next[i] = "done";
      next[step] = "active";
      return next;
    });
  };

  const runScan = useCallback(async (searchQuery = "") => {
    if (scanRef.current) return;
    scanRef.current = true;
    setLoading(true);
    setError(null);
    setPairs([]);
    setAlerts([]);
    setProgress(PROGRESS_STEPS.map(() => "idle"));
    setFetchCounts({ poly: 0, kalshi: 0, manifold: 0 });
    const t0 = Date.now();

    try {
      // Fetch from all platforms - DEEP SEARCH with 500 markets each
      advanceProgress(0);

      // Polymarket: try proxy first, fallback to direct
      const polyProxyPromise = Promise.all([
        fetchPolymarketMarkets(null, 500),
        ...(searchQuery ? [fetchPolymarketMarkets(searchQuery, 200)] : []),
      ]).then((r) => r.flat());

      advanceProgress(1);
      const kalshiPromise = Promise.all([
        fetchKalshiMarkets(null),
        ...(searchQuery ? [fetchKalshiMarkets(searchQuery)] : []),
      ]).then((r) => r.flat());

      advanceProgress(2);
      const manifoldPromise = Promise.all([
        fetchManifoldMarkets(null),
        ...(searchQuery ? [fetchManifoldMarkets(searchQuery)] : []),
      ]).then((r) => r.flat());

      let [polyRaw, kalshiRaw, manifoldRaw] = await Promise.all([
        polyProxyPromise,
        kalshiPromise,
        manifoldPromise,
      ]);

      // If proxy returned 0 Polymarket results, try direct API
      if (polyRaw.length === 0) {
        console.log("[ArbScanner] Poly proxy returned 0, trying direct Gamma API...");
        const directResults = await Promise.all([
          fetchPolymarketDirect(null, 500),
          ...(searchQuery ? [fetchPolymarketDirect(searchQuery, 200)] : []),
        ]);
        polyRaw = directResults.flat();
      }

      // Dedupe
      const dedupe = (arr) => {
        const seen = new Set();
        return arr.filter((m) => {
          const key = m.id || m.condition_id || m.ticker || (m.question || "").slice(0, 80);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      const poly = dedupe(polyRaw);
      const kalshi = dedupe(kalshiRaw);
      const manifold = dedupe(manifoldRaw);

      setFetchCounts({ poly: poly.length, kalshi: kalshi.length, manifold: manifold.length });
      console.log(`[ArbScanner] Final: ${poly.length} Poly, ${kalshi.length} Kalshi, ${manifold.length} Manifold`);

      // Debug: log a sample from each platform
      if (poly.length > 0) console.log("[ArbScanner] Poly sample:", { question: poly[0].question || poly[0].title, outcomePrices: poly[0].outcomePrices, slug: poly[0].slug });
      if (kalshi.length > 0) console.log("[ArbScanner] Kalshi sample:", { question: kalshi[0].question || kalshi[0].title, yes_price: kalshi[0].yes_price, ticker: kalshi[0].ticker });
      if (manifold.length > 0) console.log("[ArbScanner] Manifold sample:", { question: manifold[0].question, probability: manifold[0].probability });

      if (poly.length === 0 && kalshi.length === 0 && manifold.length === 0) {
        setError("All platform fetches returned 0 markets. Check server logs.");
        setScanTime(((Date.now() - t0) / 1000).toFixed(1));
        setProgress(PROGRESS_STEPS.map(() => "done"));
        setLoading(false);
        scanRef.current = false;
        return;
      }

      // Find cross-platform pairs
      advanceProgress(3);
      // Smart matching with sport detection to prevent cross-sport matches
      const opts = { minSimilarity: 0.35, minSpread: 0.02, maxPairs: 50 };
      const allCombos = [];
      if (poly.length > 0 && kalshi.length > 0) allCombos.push(...findArbPairs(poly, kalshi, opts));
      if (poly.length > 0 && manifold.length > 0) allCombos.push(...findArbPairs(poly, manifold, opts));
      if (kalshi.length > 0 && manifold.length > 0) allCombos.push(...findArbPairs(kalshi, manifold, opts));

      allCombos.sort((a, b) => b.spread - a.spread);
      let allPairs = allCombos.slice(0, 30);

      console.log(`[ArbScanner] Found ${allPairs.length} candidate pairs`);
      if (allPairs.length > 0) {
        console.log("[ArbScanner] Top pair:", {
          qA: allPairs[0].questionA?.slice(0, 50),
          qB: allPairs[0].questionB?.slice(0, 50),
          pA: allPairs[0].priceA,
          pB: allPairs[0].priceB,
          spread: allPairs[0].spread,
          sim: allPairs[0].similarity,
        });
      }

      if (allPairs.length === 0) {
        setPairs([]);
        setAlerts([]);
        setScanTime(((Date.now() - t0) / 1000).toFixed(1));
        setProgress(PROGRESS_STEPS.map(() => "done"));
        setLoading(false);
        scanRef.current = false;
        return;
      }

      // AI-verify top pairs (only verify mid-similarity pairs to save quota)
      advanceProgress(4);
      const verifiedPairs = [];
      const topCount = Math.min(3, allPairs.length); // Reduced from 6 to 3 to save quota

      for (let i = 0; i < topCount; i++) {
        const pair = allPairs[i];
        // Skip AI verification for high similarity matches (trust the fingerprint)
        if (pair.similarity >= 0.75) {
          verifiedPairs.push(pair);
          continue;
        }
        // Also skip for very low similarity - those should have been filtered out
        if (pair.similarity < 0.5) {
          verifiedPairs.push(pair);
          continue;
        }
        // Only verify mid-range similarity (0.5 - 0.75)
        try {
          const aiResult = await verifySimilarityAI(pair.questionA, pair.questionB);
          // Only reject if AI is very confident they're different
          if (aiResult && aiResult.same === false && aiResult.confidence > 0.8) {
            console.log(`[ArbScanner] AI rejected: "${pair.questionA?.slice(0, 40)}" vs "${pair.questionB?.slice(0, 40)}"`);
            continue;
          }
          if (aiResult) {
            pair._aiVerified = true;
            pair._aiConfidence = aiResult.confidence;
            pair._aiReason = aiResult.reasoning;
          }
        } catch (err) {
          console.warn(`[ArbScanner] AI verification failed (quota?), accepting pair anyway:`, err.message);
        }
        verifiedPairs.push(pair);
      }

      const remaining = allPairs.slice(topCount);
      const finalPairs = [...verifiedPairs, ...remaining].slice(0, 20);
      setPairs(finalPairs);

      // Score top pairs via backend
      advanceProgress(5);
      const scanResults = [];
      for (const pair of finalPairs.slice(0, 5)) {
        const alert = await scanPairOnBackend(pair);
        if (alert) {
          scanResults.push({
            ...alert,
            _pair: pair,
            _similarity: pair.similarity,
            _similarityReason: pair.similarityReason,
            _aiVerified: pair._aiVerified || false,
            _aiReason: pair._aiReason,
          });
        }
      }

      setAlerts(scanResults);
      setProgress(PROGRESS_STEPS.map(() => "done"));
      setScanTime(((Date.now() - t0) / 1000).toFixed(1));
    } catch (e) {
      console.error("[ArbScanner] Scan failed:", e);
      setError(e.message || "Scan failed");
      setProgress(PROGRESS_STEPS.map(() => "done"));
    } finally {
      setLoading(false);
      scanRef.current = false;
    }
  }, []);

  // Auto-scan on mount (StrictMode-safe)
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    runScan("");
  }, [runScan]);

  const handleSearch = (e) => {
    e?.preventDefault?.();
    runScan(query);
  };

  const bestSpread = pairs.length > 0 ? Math.max(...pairs.map((p) => p.spread)) : 0;
  const avgSpread = pairs.length > 0 ? pairs.reduce((s, p) => s + p.spread, 0) / pairs.length : 0;
  const confirmedCount = alerts.filter((a) => a.decision === "CONFIRMED").length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Arb Scanner</h2>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
          {loading
            ? "Scanning cross-platform markets…"
            : pairs.length > 0
              ? `${pairs.length} cross-platform pairs found · ${fetchCounts.poly + fetchCounts.kalshi + fetchCounts.manifold} markets scanned`
              : "No pairs found yet"}
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={S.searchForm}>
        <input style={S.searchInput} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search markets (e.g., Trump, Bitcoin, Fed rates…)" />
        <button type="submit" style={S.searchBtn} disabled={loading}>
          {loading ? "Scanning…" : "🔍 Search"}
        </button>
        {query && (
          <button type="button" style={S.clearBtn} onClick={() => { setQuery(""); runScan(""); }}>
            ✕ Clear
          </button>
        )}
      </form>

      {/* Stats */}
      <div style={S.statRow}>
        <div style={S.stat}><div style={S.statL}>PAIRS FOUND</div><div style={S.statV}>{pairs.length}</div></div>
        <div style={S.stat}><div style={S.statL}>BEST SPREAD</div><div style={S.statV}>{bestSpread > 0 ? formatSpread(bestSpread) : "—"}</div></div>
        <div style={S.stat}><div style={S.statL}>AVG SPREAD</div><div style={S.statV}>{avgSpread > 0 ? formatSpread(avgSpread) : "—"}</div></div>
        <div style={S.stat}><div style={S.statL}>SCAN TIME</div><div style={S.statV}>{scanTime}s</div></div>
      </div>

      {/* Progress */}
      {loading && (
        <div style={S.progressWrap}>
          {PROGRESS_STEPS.map((step, i) => {
            const status = progress[i] || "idle";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ ...S.dot, ...(status === "done" ? S.dotDone : status === "active" ? S.dotActive : S.dotIdle) }}>
                  {status === "done" ? "✓" : status === "active" ? "⟳" : i + 1}
                </div>
                <span style={{ fontSize: 13, color: status === "active" ? "var(--text)" : status === "done" ? "var(--text-mid)" : "var(--text-dim)", fontWeight: status === "active" ? 600 : 400 }}>{step}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Results */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {alerts.length > 0 ? `${alerts.length} analyzed` : `${pairs.length} pairs`}
          </div>
          <button style={S.scanBtn} onClick={() => runScan(query)} disabled={loading}>
            {loading ? "Scanning…" : "Scan now"}
          </button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {!loading && pairs.length === 0 && !error && (
          <div style={S.empty}>
            {query ? `No arb opportunities for "${query}".` : "No cross-platform pairs found. The server must be running."}
          </div>
        )}

        {alerts.length > 0
          ? alerts.map((alert, i) => <AlertCard key={i} alert={alert} />)
          : pairs.map((pair, i) => (
            <PairCard key={i} pair={pair} onScan={async () => {
              const result = await scanPairOnBackend(pair);
              if (result) setAlerts((prev) => [...prev, { ...result, _pair: pair, _similarity: pair.similarity, _similarityReason: pair.similarityReason }]);
            }} />
          ))}
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const pair = alert._pair;
  const isConfirmed = alert.decision === "CONFIRMED";

  return (
    <div style={{ background: isConfirmed ? "rgba(0,196,140,0.04)" : "rgba(255,77,106,0.03)", border: `1px solid ${isConfirmed ? "rgba(0,196,140,0.2)" : "rgba(255,77,106,0.15)"}`, borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: isConfirmed ? "var(--green-light)" : "var(--red-light)", color: isConfirmed ? "var(--green)" : "var(--red)" }}>{alert.decision}</span>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{alert.title || pair?.questionA?.slice(0, 60)}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 600, color: "var(--green)" }}>{formatSpread(alert.spread || pair?.spread || 0)}</span>
      </div>

      {pair && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, position: "relative" }}>
          <div style={S.qBox}><div style={S.qLabel}>{pair.marketA.platform}</div><div style={S.qText}>{pair.questionA}</div><div style={{ fontSize: 11, color: "var(--blue)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{formatPrice(pair.priceA)}</div></div>
          <div style={S.qBox}><div style={S.qLabel}>{pair.marketB.platform}</div><div style={S.qText}>{pair.questionB}</div><div style={{ fontSize: 11, color: "var(--blue)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{formatPrice(pair.priceB)}</div></div>
          <div style={S.matchBadge}>Match: {Math.round((alert._similarity || 0) * 100)}%{alert._aiVerified && " ✓ AI"}</div>
        </div>
      )}

      {alert.summary && <div style={{ fontSize: 12, color: "var(--text-mid)", marginBottom: 10, lineHeight: 1.4 }}>{alert.summary}</div>}
      {alert._aiReason && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginBottom: 10 }}>🤖 {alert._aiReason}</div>}

      <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
        {pair && marketUrl(pair.marketA) && <a href={marketUrl(pair.marketA)} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>{pair.marketA.platform} ↗</a>}
        {pair && marketUrl(pair.marketB) && <a href={marketUrl(pair.marketB)} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>{pair.marketB.platform} ↗</a>}
      </div>
    </div>
  );
}

function PairCard({ pair, onScan }) {
  const [scanning, setScanning] = useState(false);

  return (
    <div style={{ background: "rgba(26,92,255,0.04)", border: "1px solid rgba(26,92,255,0.15)", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)", fontFamily: "'DM Mono',monospace" }}>{Math.round(pair.similarity * 100)}% match</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>· {pair.similarityReason}</span>
        <span style={{ marginLeft: "auto", fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 600, color: "var(--green)" }}>{formatSpread(pair.spread)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={S.qBox}><div style={S.qLabel}>{pair.marketA.platform}</div><div style={S.qText}>{pair.questionA}</div><div style={{ fontSize: 11, color: "var(--blue)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{formatPrice(pair.priceA)}</div></div>
        <div style={S.qBox}><div style={S.qLabel}>{pair.marketB.platform}</div><div style={S.qText}>{pair.questionB}</div><div style={{ fontSize: 11, color: "var(--blue)", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>{formatPrice(pair.priceB)}</div></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {marketUrl(pair.marketA) && <a href={marketUrl(pair.marketA)} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>{pair.marketA.platform} ↗</a>}
        {marketUrl(pair.marketB) && <a href={marketUrl(pair.marketB)} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>{pair.marketB.platform} ↗</a>}
        <button style={{ ...S.scanBtn, marginLeft: "auto" }} disabled={scanning} onClick={async () => { setScanning(true); await onScan(); setScanning(false); }}>
          {scanning ? "Scanning…" : "Analyze"}
        </button>
      </div>
    </div>
  );
}

const S = {
  searchForm: { display: "flex", gap: 12, marginBottom: 24 },
  searchInput: { flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--white)", fontFamily: "'Outfit',sans-serif", fontSize: 14, color: "var(--text)", outline: "none" },
  searchBtn: { padding: "12px 20px", borderRadius: 12, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  clearBtn: { padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  scanBtn: { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer" },
  error: { padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,77,106,0.3)", color: "var(--red)", fontSize: 12, marginBottom: 12, background: "var(--red-light)" },
  empty: { padding: "24px", color: "var(--text-dim)", textAlign: "center", fontSize: 13 },
  progressWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px", marginBottom: 24 },
  dot: { width: 28, height: 28, borderRadius: 50, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 },
  dotDone: { background: "rgba(0,196,140,0.15)", color: "var(--green)", border: "1px solid rgba(0,196,140,0.3)" },
  dotActive: { background: "rgba(26,92,255,0.15)", color: "var(--blue)", border: "1px solid rgba(26,92,255,0.3)" },
  dotIdle: { background: "rgba(255,255,255,0.05)", color: "var(--text-dim)", border: "1px solid var(--border)" },
  qBox: { background: "var(--white)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" },
  qLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--text-dim)", marginBottom: 4, fontFamily: "'DM Mono',monospace" },
  qText: { fontSize: 12, lineHeight: 1.4, color: "var(--text)", fontWeight: 500 },
  matchBadge: { position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", background: "var(--blue)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap", zIndex: 1 },
  linkBtn: { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", color: "var(--blue)", fontSize: 11, fontWeight: 600, textDecoration: "none", fontFamily: "'DM Mono',monospace", background: "var(--surface)" },
};
