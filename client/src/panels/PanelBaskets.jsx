import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "slicefund_baskets";

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

function normalizeWeight(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toCustomBasket(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : `Custom Basket ${index + 1}`;

  const rawMarkets = Array.isArray(raw.markets) ? raw.markets : [];
  const markets = rawMarkets
    .map((market) => {
      const marketName =
        typeof market?.market === "string" && market.market.trim().length > 0
          ? market.market.trim()
          : typeof market?.question === "string" && market.question.trim().length > 0
            ? market.question.trim()
            : null;

      if (!marketName) return null;

      const platform =
        typeof market?.platform === "string" && market.platform.trim().length > 0
          ? market.platform.trim()
          : "Unknown";

      const targetWeight = normalizeWeight(market?.target_weight, 0);
      const currentWeight = normalizeWeight(market?.current_weight, targetWeight);

      return {
        market: marketName,
        platform,
        target_weight: targetWeight,
        current_weight: currentWeight,
        marketUrl: typeof market?.marketUrl === "string" ? market.marketUrl : null,
      };
    })
    .filter(Boolean);

  if (markets.length === 0) return null;

  const avgOdds =
    markets.reduce((sum, market) => sum + normalizeWeight(market.current_weight, 0), 0) /
    Math.max(markets.length, 1);

  return {
    name,
    markets,
    src: "CUSTOM",
    odds: Math.round(avgOdds * 100),
    yield: "Custom",
    isCustom: true,
  };
}

function loadPersistedBaskets() {
  if (typeof window === "undefined") return [];

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((basket, index) => toCustomBasket(basket, index)).filter(Boolean);
  } catch (error) {
    console.error("Failed to load persisted baskets:", error);
    return [];
  }
}

function formatVolume(volume) {
  const numeric = Number(volume);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `$${(numeric / 1_000).toFixed(1)}K`;
  return `$${numeric.toFixed(0)}`;
}

function buildLiveBasket(name, sourceLabel, items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const targetWeight = 1 / items.length;
  const markets = items.map((item) => {
    const yesPrice = toProbability(item.yesPrice) ?? targetWeight;
    return {
      market: item.question,
      platform: item.platform,
      target_weight: targetWeight,
      current_weight: yesPrice,
      marketUrl: item.marketUrl,
      volume: item.volume,
    };
  });

  const averageOdds =
    markets.reduce((sum, market) => sum + normalizeWeight(market.current_weight, 0), 0) /
    Math.max(markets.length, 1);

  const totalVolume = markets.reduce((sum, market) => sum + (Number(market.volume) || 0), 0);

  return {
    name,
    markets,
    src: sourceLabel,
    odds: Math.round(averageOdds * 100),
    yield: formatVolume(totalVolume),
    isCustom: false,
  };
}

async function fetchLiveBaskets() {
  const [polyRes, kalshiRes, manifoldRes] = await Promise.all([
    fetch("/api/polymarket/trending"),
    fetch("/api/kalshi/trending"),
    fetch("/api/manifold/trending"),
  ]);

  const [polyJson, kalshiJson, manifoldJson] = await Promise.all([
    polyRes.json(),
    kalshiRes.json(),
    manifoldRes.json(),
  ]);

  if (!polyRes.ok || !kalshiRes.ok || !manifoldRes.ok) {
    throw new Error(polyJson?.error || kalshiJson?.error || manifoldJson?.error || "Failed to load live baskets");
  }

  const polyMarkets = (polyJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Polymarket",
    yesPrice: parsePolymarketPrice(market.outcomePrices),
    marketUrl: market.slug ? `https://polymarket.com/event/${market.slug}` : null,
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const kalshiMarkets = (kalshiJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Kalshi",
    yesPrice: toProbability(market.yes_price),
    marketUrl: market.ticker ? `https://kalshi.com/markets/${market.ticker}` : null,
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const manifoldMarkets = (manifoldJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Manifold",
    yesPrice: toProbability(market.probability),
    marketUrl: market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null),
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const crossPlatformCore = [polyMarkets[0], kalshiMarkets[0], manifoldMarkets[0]].filter(Boolean);

  return [
    buildLiveBasket("Polymarket Momentum", "POLYMARKET", polyMarkets),
    buildLiveBasket("Kalshi Macro", "KALSHI", kalshiMarkets),
    buildLiveBasket("Manifold Signal", "MANIFOLD", manifoldMarkets),
    buildLiveBasket("Cross-Platform Core", "LIVE", crossPlatformCore),
  ].filter(Boolean);
}

async function checkRebalance(basket) {
  try {
    const response = await fetch("/api/basket/rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basket: basket.markets }),
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default function PanelBaskets() {
  const [liveBaskets, setLiveBaskets] = useState([]);
  const [customBaskets, setCustomBaskets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedBasket, setSelectedBasket] = useState(null);
  const [rebalanceData, setRebalanceData] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [fetchedLive, persisted] = await Promise.all([
          fetchLiveBaskets(),
          Promise.resolve(loadPersistedBaskets()),
        ]);

        setLiveBaskets(fetchedLive);
        setCustomBaskets(persisted);
      } catch (loadError) {
        setError(loadError.message || "Failed to load baskets");
        setLiveBaskets([]);
        setCustomBaskets(loadPersistedBaskets());
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const baskets = [...liveBaskets, ...customBaskets];

  const stats = useMemo(() => {
    const totalBaskets = baskets.length;
    const avgOdds =
      baskets.length > 0
        ? Math.round(baskets.reduce((sum, basket) => sum + (Number(basket.odds) || 0), 0) / baskets.length)
        : 0;
    const totalMarkets = baskets.reduce((sum, basket) => sum + (Array.isArray(basket.markets) ? basket.markets.length : 0), 0);
    const customCount = customBaskets.length;

    return {
      totalBaskets,
      avgOdds,
      totalMarkets,
      customCount,
    };
  }, [baskets, customBaskets]);

  const handleCheckRebalance = async (basket) => {
    setIsChecking(true);
    setSelectedBasket(basket);
    const data = await checkRebalance(basket);
    setRebalanceData(data);
    setIsChecking(false);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>My Baskets</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            {loading ? "Loading live baskets..." : `${stats.totalBaskets} live/custom baskets from Polymarket, Kalshi, Manifold`}
          </p>
        </div>
      </div>

      <div style={s.statRow}>
        {[
          { l: "Total Baskets", v: String(stats.totalBaskets), d: `${stats.customCount} custom`, c: "var(--text-dim)" },
          { l: "Avg Odds", v: stats.avgOdds ? `${stats.avgOdds}¢` : "—", d: "Implied YES", c: "var(--green)" },
          { l: "Total Markets", v: String(stats.totalMarkets), d: "Across all baskets", c: "var(--green)" },
          { l: "Data Sources", v: "3", d: "Polymarket · Kalshi · Manifold", c: "var(--green)" },
        ].map((item, index) => (
          <div key={index} style={s.stat}>
            <div style={s.statL}>{item.l}</div>
            <div style={s.statV}>{item.v}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: item.c }}>{item.d}</div>
          </div>
        ))}
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Active Baskets</div>
          <div style={s.action}>Live data only</div>
        </div>

        {!loading && baskets.length === 0 && (
          <div style={s.empty}>No baskets available yet.</div>
        )}

        {baskets.map((basket, index) => (
          <div key={`${basket.name}-${index}`} style={s.row}>
            <div style={s.num}>{index + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.q}>{basket.name}</div>
              <div style={s.meta}>{basket.markets.length} MARKETS · {basket.src}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={s.odds}>{typeof basket.odds === "number" ? `${basket.odds}¢` : "—"}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{basket.yield}</div>
            </div>
            <button
              onClick={() => handleCheckRebalance(basket)}
              disabled={isChecking}
              style={{ ...s.checkBtn, opacity: isChecking ? 0.6 : 1 }}
            >
              {isChecking && selectedBasket === basket ? "⟳" : "Check"}
            </button>
          </div>
        ))}
      </div>

      {rebalanceData && (
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            🤖 Rebalancer Analysis: {selectedBasket?.name}
          </div>
          <div style={s.agentResponse}>
            {rebalanceData.rebalanceAnalysis?.content || "No analysis available"}
          </div>
          {selectedBasket?.markets?.some((market) => market.marketUrl) && (
            <div style={s.linksRow}>
              {selectedBasket.markets
                .filter((market) => market.marketUrl)
                .slice(0, 3)
                .map((market, index) => (
                  <a key={`${market.market}-${index}`} href={market.marketUrl} target="_blank" rel="noopener noreferrer" style={s.linkBtn}>
                    Open {market.platform} ↗
                  </a>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const s = {
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24 },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--border2)" },
  num: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--blue)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  q: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  checkBtn: {
    padding: "8px 14px",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--blue)",
    cursor: "pointer",
  },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
  empty: { padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" },
  agentResponse: {
    background: "var(--blue-light)",
    border: "1px solid rgba(26,92,255,0.2)",
    borderRadius: 12,
    padding: "16px 18px",
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  linksRow: {
    marginTop: 14,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  linkBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    color: "var(--blue)",
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
    fontFamily: "'DM Mono',monospace",
    background: "var(--surface)",
  },
};
