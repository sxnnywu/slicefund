import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Sidebar from "../components/Sidebar.jsx";
import ThesisCard from "../components/ThesisCard.jsx";
import ActiveMarkets from "../components/ActiveMarkets.jsx";
import PastSearches from "../components/PastSearches.jsx";
import RightPanel from "../components/RightPanel.jsx";
import ResultsPanel from "../components/ResultsPanel.jsx";
import PanelThesis from "../panels/PanelThesis.jsx";
import PanelBaskets from "../panels/PanelBaskets.jsx";
import PanelMarkets from "../panels/PanelMarkets.jsx";
import PanelArb from "../panels/PanelArb.jsx";
import PanelIndex from "../panels/PanelIndex.jsx";
import PanelPolymarket from "../panels/PanelPolymarket.jsx";
import PanelKalshi from "../panels/PanelKalshi.jsx";
import PanelManifold from "../panels/PanelManifold.jsx";
import PanelProfile from "../panels/PanelProfile.jsx";
import WalletConnect from "../components/WalletConnect.jsx";
import { getAllTrending } from "../lib/trendingCache.js";

const SEARCH_HISTORY_KEY = "slicefund_thesis_history";
const ACTIVE_PANEL_KEY = "slicefund_active_panel";
const VALID_PANELS = new Set([
  "home",
  "thesis",
  "polymarket",
  "kalshi",
  "manifold",
  "baskets",
  "markets",
  "arb",
  "index",
  "profile",
  "trades",
]);
const ANALYZE_PROGRESS_STEPS = [
  "Agent 1: Parsing thesis into search keywords",
  "Agent 2: Searching Polymarket, Kalshi, and Manifold",
  "Agent 3: Ranking and scoring top market picks",
  "Mapper: Building cross-platform thesis mapping",
  "Researcher: Generating concise thesis analysis",
];
const ARB_PROGRESS_STEPS = [
  "Agent: Fetching live market candidates",
  "Agent: Scoring arbitrage opportunities",
];
const REBALANCE_PROGRESS_STEPS = [
  "Agent: Analyzing basket drift",
  "Agent: Generating rebalance recommendations",
];

function toProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1 && numeric <= 100) return numeric / 100;
  if (numeric < 0 || numeric > 1) return null;
  return numeric;
}

function parsePolymarketPrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return toProbability(prices[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function tokenizeQuestion(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(questionA, questionB) {
  const setA = new Set(tokenizeQuestion(questionA));
  const setB = new Set(tokenizeQuestion(questionB));
  if (setA.size === 0 || setB.size === 0) return 0;

  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  return overlap / Math.max(1, Math.min(setA.size, setB.size));
}

function normalizeOverviewMarkets(platform, markets) {
  return (markets || [])
    .map((market) => {
      const yesPrice =
        platform === "Polymarket"
          ? parsePolymarketPrice(market.outcomePrices)
          : platform === "Kalshi"
            ? toProbability(market.yes_price)
            : toProbability(market.probability);

      if (yesPrice === null) return null;

      return {
        id: `${platform}-${market.id}`,
        platform,
        question: market.question,
        yesPrice,
      };
    })
    .filter(Boolean);
}

async function fetchLiveOverview() {
  const { polymarket: polyJson, kalshi: kalshiJson, manifold: manifoldJson } = await getAllTrending();

  const allMarkets = [
    ...normalizeOverviewMarkets("Polymarket", polyJson?.markets || []),
    ...normalizeOverviewMarkets("Kalshi", kalshiJson?.markets || []),
    ...normalizeOverviewMarkets("Manifold", manifoldJson?.markets || []),
  ];

  const avgOdds =
    allMarkets.length > 0
      ? allMarkets.reduce((sum, market) => sum + market.yesPrice, 0) / allMarkets.length
      : null;

  let arbCount = 0;
  let bestSpread = 0;

  for (let i = 0; i < allMarkets.length; i += 1) {
    for (let j = i + 1; j < allMarkets.length; j += 1) {
      const left = allMarkets[i];
      const right = allMarkets[j];
      if (left.platform === right.platform) continue;

      const similarity = overlapScore(left.question, right.question);
      if (similarity < 0.45) continue;

      const spread = Math.abs(left.yesPrice - right.yesPrice);
      if (spread >= 0.04) {
        arbCount += 1;
        if (spread > bestSpread) bestSpread = spread;
      }
    }
  }

  return {
    totalMarkets: allMarkets.length,
    avgOdds,
    arbCount,
    bestSpread,
  };
}

function loadStoredSearches() {
  if (typeof window === "undefined") return [];

  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((entry) => entry && typeof entry === "object" && typeof entry.thesis === "string")
      .map((entry) => ({
        thesis: entry.thesis,
        picks: Number.isFinite(Number(entry.picks)) ? Number(entry.picks) : 0,
        avgOdds: typeof entry.avgOdds === "string" ? entry.avgOdds : "—",
        volume: Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : 0,
        time: typeof entry.time === "string" ? entry.time : "Earlier",
      }))
      .slice(0, 25);
  } catch (error) {
    console.error("Failed to load thesis history:", error);
    return [];
  }
}

function loadStoredPanel() {
  if (typeof window === "undefined") return "home";

  try {
    const panel = localStorage.getItem(ACTIVE_PANEL_KEY);
    return VALID_PANELS.has(panel) ? panel : "home";
  } catch (error) {
    console.error("Failed to load active panel:", error);
    return "home";
  }
}

export default function Dashboard() {
  const { user } = useAuth0();
  const [panel, setPanel] = useState(() => loadStoredPanel());
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyzeStepIndex, setAnalyzeStepIndex] = useState(-1);
  const [searches, setSearches] = useState(() => loadStoredSearches());
  const analyzeProgressTimerRef = useRef(null);
  const [arbStepIndex, setArbStepIndex] = useState(-1);
  const arbProgressTimerRef = useRef(null);
  const [rebalanceStepIndex, setRebalanceStepIndex] = useState(-1);
  const rebalanceProgressTimerRef = useRef(null);
  const [liveOverview, setLiveOverview] = useState({
    loading: true,
    error: null,
    totalMarkets: 0,
    avgOdds: null,
    arbCount: 0,
    bestSpread: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searches.slice(0, 25)));
    } catch (saveError) {
      console.error("Failed to persist thesis history:", saveError);
    }
  }, [searches]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(ACTIVE_PANEL_KEY, panel);
    } catch (saveError) {
      console.error("Failed to persist active panel:", saveError);
    }
  }, [panel]);

  useEffect(() => () => {
    if (analyzeProgressTimerRef.current) {
      clearInterval(analyzeProgressTimerRef.current);
      analyzeProgressTimerRef.current = null;
    }
    if (arbProgressTimerRef.current) {
      clearInterval(arbProgressTimerRef.current);
      arbProgressTimerRef.current = null;
    }
    if (rebalanceProgressTimerRef.current) {
      clearInterval(rebalanceProgressTimerRef.current);
      rebalanceProgressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadOverview = async () => {
      try {
        const overview = await fetchLiveOverview();
        if (cancelled) return;
        setLiveOverview({ loading: false, error: null, ...overview });
      } catch (overviewError) {
        if (cancelled) return;
        setLiveOverview((prev) => ({
          ...prev,
          loading: false,
          error: overviewError.message || "Failed to load live overview",
        }));
      }
    };

    setLiveOverview((prev) => ({ ...prev, loading: true, error: null }));
    loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  const rawFirstName =
    user?.given_name ||
    user?.name?.trim()?.split(/\s+/)?.[0] ||
    user?.nickname ||
    (user?.email ? user.email.split("@")[0] : null);
  const firstName = rawFirstName
    ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
    : "there";

  const stopAnalyzeProgress = useCallback((reset = true) => {
    if (analyzeProgressTimerRef.current) {
      clearInterval(analyzeProgressTimerRef.current);
      analyzeProgressTimerRef.current = null;
    }

    if (reset) {
      setAnalyzeStepIndex(-1);
    }
  }, []);

  const startAnalyzeProgress = useCallback(() => {
    stopAnalyzeProgress(false);

    let nextStep = 0;
    setAnalyzeStepIndex(0);

    analyzeProgressTimerRef.current = setInterval(() => {
      nextStep += 1;

      if (nextStep >= ANALYZE_PROGRESS_STEPS.length) {
        stopAnalyzeProgress(false);
        return;
      }

      setAnalyzeStepIndex(nextStep);
    }, 1600);
  }, [stopAnalyzeProgress]);

  const stopArbProgress = useCallback((reset = true) => {
    if (arbProgressTimerRef.current) {
      clearInterval(arbProgressTimerRef.current);
      arbProgressTimerRef.current = null;
    }

    if (reset) {
      setArbStepIndex(-1);
    }
  }, []);

  const startArbProgress = useCallback(() => {
    stopArbProgress(false);

    let nextStep = 0;
    setArbStepIndex(0);

    arbProgressTimerRef.current = setInterval(() => {
      nextStep += 1;

      if (nextStep >= ARB_PROGRESS_STEPS.length) {
        stopArbProgress(false);
        return;
      }

      setArbStepIndex(nextStep);
    }, 1600);
  }, [stopArbProgress]);

  const stopRebalanceProgress = useCallback((reset = true) => {
    if (rebalanceProgressTimerRef.current) {
      clearInterval(rebalanceProgressTimerRef.current);
      rebalanceProgressTimerRef.current = null;
    }

    if (reset) {
      setRebalanceStepIndex(-1);
    }
  }, []);

  const startRebalanceProgress = useCallback(() => {
    stopRebalanceProgress(false);

    let nextStep = 0;
    setRebalanceStepIndex(0);

    rebalanceProgressTimerRef.current = setInterval(() => {
      nextStep += 1;

      if (nextStep >= REBALANCE_PROGRESS_STEPS.length) {
        stopRebalanceProgress(false);
        return;
      }

      setRebalanceStepIndex(nextStep);
    }, 1600);
  }, [stopRebalanceProgress]);

  const analyzeProgress = loading
    ? {
      steps: ANALYZE_PROGRESS_STEPS,
      currentStep: Math.max(0, analyzeStepIndex),
    }
    : null;

  const arbProgress = {
    steps: ARB_PROGRESS_STEPS,
    currentStep: Math.max(0, arbStepIndex),
  };

  const rebalanceProgress = {
    steps: REBALANCE_PROGRESS_STEPS,
    currentStep: Math.max(0, rebalanceStepIndex),
  };

  const analyze = async (thesis) => {
    setLoading(true);
    setError(null);
    setResults(null);
    startAnalyzeProgress();

    const history = searches
      .map((entry) => entry?.thesis)
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .slice(0, 10);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis, history }),
      });
      if (!res.ok) {
        let msg = "Request failed";
        try { const d = await res.json(); msg = d.details || d.error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      setResults(data);
      setSearches((prev) => [
        {
          thesis,
          picks: data.picks.length,
          avgOdds: data.picks.length > 0
            ? (data.picks.reduce((s, p) => s + (parseFloat(p.current_price) || 0), 0) / data.picks.length).toFixed(2)
            : "—",
          volume: data.picks.reduce((s, p) => s + (Number(p.volume) || 0), 0),
          time: "Just now",
        },
        ...prev.filter((entry) => entry?.thesis !== thesis),
      ].slice(0, 10));
    } catch (err) {
      setError(err.message);
    } finally {
      stopAnalyzeProgress();
      setLoading(false);
    }
  };

  const renderPanel = () => {
    switch (panel) {
      case "thesis":
        return <PanelThesis onAnalyze={analyze} loading={loading} error={error} results={results} searches={searches} progress={analyzeProgress} />;
      case "polymarket":
        return <PanelPolymarket />;
      case "kalshi":
        return <PanelKalshi />;
      case "manifold":
        return <PanelManifold />;
      case "baskets":
        return <PanelBaskets progress={rebalanceProgress} onStartProgress={startRebalanceProgress} onStopProgress={stopRebalanceProgress} />;
      case "markets":
        return <PanelMarkets />;
      case "arb":
        return <PanelArb progress={arbProgress} onStartProgress={startArbProgress} onStopProgress={stopArbProgress} />;
      case "index":
        return <PanelIndex />;
      case "profile":
        return <PanelProfile />;
      case "trades":
        return <PanelMarkets />;
      default:
        return (
          <>
            <div style={styles.topbar}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Hello, {firstName} 👋</h2>
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
                  {results
                    ? `${results.picks.length} picks found`
                    : liveOverview.loading
                      ? "Loading live market feeds..."
                      : `${liveOverview.arbCount} cross-platform spreads · ${liveOverview.totalMarkets} live markets`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button className="sf-btn-smooth" style={styles.topBtn} onClick={() => setPanel("arb")}>🔔 Alerts <span style={styles.badge}>{liveOverview.arbCount}</span></button>
                <button className="sf-btn-smooth" style={styles.topBtnPrimary} onClick={() => setPanel("thesis")}>+ New Thesis</button>
                <WalletConnect />
              </div>
            </div>
            <div style={styles.statRow}>
              {[
                {
                  label: "Live Markets",
                  value: liveOverview.loading ? "—" : String(liveOverview.totalMarkets),
                  delta: "Across 3 APIs",
                  color: "var(--green)",
                },
                {
                  label: "Avg YES Odds",
                  value: liveOverview.loading || liveOverview.avgOdds === null ? "—" : `${Math.round(liveOverview.avgOdds * 100)}¢`,
                  delta: "Cross-platform",
                  color: "var(--green)",
                },
                {
                  label: "Arb Opportunities",
                  value: liveOverview.loading ? "—" : String(liveOverview.arbCount),
                  delta: liveOverview.loading ? "Scanning" : `Best spread ${(liveOverview.bestSpread * 100).toFixed(0)}¢`,
                  color: "var(--green)",
                },
                {
                  label: "Searches Made",
                  value: String(searches.length || 0),
                  delta: liveOverview.error ? "Overview unavailable" : "All time",
                  color: liveOverview.error ? "var(--red)" : "var(--text-dim)",
                },
              ].map((s, i) => (
                <div key={i} className="sf-card-smooth" style={styles.statCard}>
                  <div style={styles.statLabel}>{s.label}</div>
                  <div style={styles.statValue}>{s.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: s.color }}>{s.delta}</div>
                </div>
              ))}
            </div>
            <div style={styles.grid}>
              <div>
                <ThesisCard onAnalyze={analyze} loading={loading} progress={analyzeProgress} />
                {error && <div style={styles.error}>⚠️ {error}</div>}
                {results && <ResultsPanel data={results} />}
                <ActiveMarkets />
                <PastSearches searches={searches} />
              </div>
              <RightPanel />
            </div>
          </>
        );
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <Sidebar activePanel={panel} onNavigate={setPanel} />
      <div style={styles.main}>
        <div key={panel} className="sf-panel-transition">{renderPanel()}</div>
      </div>
    </div>
  );
}

const styles = {
  main: { flex: 1, overflowY: "auto", padding: "40px 40px", position: "relative", zIndex: 1 },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  topBtn: {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer",
  },
  topBtnPrimary: {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    border: "1px solid var(--blue)", background: "var(--blue)", fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)",
  },
  badge: { background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 50, marginLeft: 2 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 },
  statCard: { background: "var(--surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statLabel: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statValue: { fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 500, color: "var(--text)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
};
