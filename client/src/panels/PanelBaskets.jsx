import React, { useEffect, useState } from "react";

const DEFAULT_BASKETS = [
  {
    name: "Trump Tariffs 2025",
    markets: [
      { market: "Will Trump impose 25%+ tariffs on Canada in 2025", platform: "Polymarket", target_weight: 0.4, current_weight: 0.42 },
      { market: "Will US-Canada trade volume drop >10% in 2025", platform: "Kalshi", target_weight: 0.3, current_weight: 0.28 },
      { market: "Will Canadian auto exports to US fall in Q1 2025", platform: "Manifold", target_weight: 0.3, current_weight: 0.3 },
    ],
    src: "POLYMARKET",
    odds: 71,
    yield: "+22.1%",
    up: true,
  },
  {
    name: "AI Regulation Wave",
    markets: [
      { market: "Will EU AI Act enforcement begin before Q4 2025", platform: "Polymarket", target_weight: 0.4, current_weight: 0.45 },
      { market: "Will US Congress pass an AI liability bill in 2025", platform: "Kalshi", target_weight: 0.35, current_weight: 0.30 },
      { market: "Will OpenAI face major regulatory action in 2025", platform: "Manifold", target_weight: 0.25, current_weight: 0.25 },
    ],
    src: "POLYMARKET",
    odds: 64,
    yield: "+12.4%",
    up: true,
  },
];

const STORAGE_KEY = "slicefund_baskets";

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
      };
    })
    .filter(Boolean);

  if (markets.length === 0) return null;

  const src = markets[0]?.platform ? String(markets[0].platform).toUpperCase() : "CUSTOM";
  const createdAt = raw.created ? new Date(raw.created) : null;
  const mintedLabel =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? `Minted ${createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "Minted";

  return {
    name,
    markets,
    src,
    odds: null,
    yield: mintedLabel,
    up: true,
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

async function checkRebalance(basket) {
  try {
    const response = await fetch("http://localhost:3001/api/basket/rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basket: basket.markets }),
    });

    if (!response.ok) {
      console.error(`Rebalance check failed for ${basket.name}:`, response.statusText);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`Error checking rebalance for ${basket.name}:`, error);
    return null;
  }
}

export default function PanelBaskets() {
  const [baskets, setBaskets] = useState(DEFAULT_BASKETS);
  const [selectedBasket, setSelectedBasket] = useState(null);
  const [rebalanceData, setRebalanceData] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const persistedBaskets = loadPersistedBaskets();
    setBaskets([...DEFAULT_BASKETS, ...persistedBaskets]);
  }, []);

  const persistedCount = Math.max(baskets.length - DEFAULT_BASKETS.length, 0);

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
        <div><h2 style={{ fontSize: 24, fontWeight: 700 }}>My Baskets</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>{baskets.length} active prediction market index funds</p></div>
        <button style={s.btn}>+ New Basket</button>
      </div>
      <div style={s.statRow}>
        {[{ l: "Total Baskets", v: String(baskets.length), d: persistedCount > 0 ? `+${persistedCount} minted locally` : "No local mints yet", c: persistedCount > 0 ? "var(--green)" : "var(--text-dim)" }, { l: "Best Performer", v: "+22.1%", d: "Trump Tariffs", c: "var(--green)" }, { l: "Avg Yield", v: "+14.2%", d: "↑ vs last month", c: "var(--green)" }, { l: "Total Volume", v: "$18.4M", d: "Across all baskets", c: "var(--green)" }].map((x, i) => (
          <div key={i} style={s.stat}><div style={s.statL}>{x.l}</div><div style={s.statV}>{x.v}</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: x.c }}>{x.d}</div></div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Active Baskets</div><div style={s.action}>Sort by yield</div></div>
        {baskets.map((b, i) => (
          <div key={i} style={s.row}>
            <div style={s.num}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={s.q}>{b.name}</div><div style={s.meta}>{b.markets.length} MARKETS · {b.src}</div></div>
            <div style={{ textAlign: "right" }}><div style={s.odds}>{typeof b.odds === "number" ? `${b.odds}¢` : "—"}</div><div style={{ fontSize: 10, color: b.isCustom ? "var(--text-dim)" : b.up ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{b.yield}</div></div>
            <button
              onClick={() => handleCheckRebalance(b)}
              disabled={isChecking}
              style={{
                ...s.checkBtn,
                opacity: isChecking ? 0.6 : 1,
              }}
            >
              {isChecking && selectedBasket === b ? "⟳" : "Check"}
            </button>
          </div>
        ))}
      </div>

      {/* Rebalance Analysis Panel */}
      {rebalanceData && (
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            🤖 Rebalancer Analysis: {selectedBasket?.name}
          </div>
          <div style={s.agentResponse}>
            {rebalanceData.rebalanceAnalysis?.content || "No analysis available"}
          </div>
        </div>
      )}
    </>
  );
}
const s = {
  btn: { padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24 },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", cursor: "pointer", borderRadius: 8, margin: "0 -8px" },
  num: { width: 32, height: 32, borderRadius: 8, background: "var(--blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--blue)", flexShrink: 0 },
  q: { fontSize: 13, fontWeight: 600 },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  checkBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  agentResponse: {
    background: "var(--blue-light)",
    border: "1px solid rgba(26,92,255,0.2)",
    borderRadius: 12,
    padding: "16px 18px",
    fontSize: 13,
    color: "var(--text)",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
};
