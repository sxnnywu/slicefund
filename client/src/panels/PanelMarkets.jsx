import React, { useState, useEffect } from "react";

function parsePrice(outcomePrices) {
  if (typeof outcomePrices === 'number') {
    return (outcomePrices * 100).toFixed(0);
  }
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return (parseFloat(prices[0]) * 100).toFixed(0);
    }
  } catch {}
  return "—";
}

function formatVolume(value, platform) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (platform === "Kalshi") {
    if (numeric >= 1000) {
      return `${(numeric / 1000).toFixed(1)}K`;
    }
    return numeric.toFixed(numeric >= 100 ? 0 : 1).replace(/\.0$/, "");
  }

  if (numeric >= 1000) {
    return `$${(numeric / 1000).toFixed(0)}K`;
  }

  return `$${numeric.toFixed(0)}`;
}

function getIcon(question) {
  const q = question.toLowerCase();
  if (q.includes("trump") || q.includes("tariff")) return "🇺🇸";
  if (q.includes("ai") || q.includes("tech")) return "🤖";
  if (q.includes("fed") || q.includes("rate") || q.includes("interest")) return "📈";
  if (q.includes("bitcoin") || q.includes("crypto")) return "₿";
  if (q.includes("congress") || q.includes("bill") || q.includes("law")) return "🏛️";
  if (q.includes("recession") || q.includes("economy")) return "🌍";
  return "📊";
}

export default function PanelMarkets() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState("all"); // "all", "polymarket", "kalshi"

  const fetchPlatformMarkets = async (url, platformLabel) => {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.details || data?.error || `Failed to fetch ${platformLabel} markets`);
    }

    const markets = Array.isArray(data?.markets) ? data.markets : [];
    return markets.map((market) => ({ ...market, platform: platformLabel }));
  };

  const fetchMarkets = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoints = [];
      if (platform === "all" || platform === "polymarket") {
        endpoints.push(fetchPlatformMarkets("/api/polymarket/trending", "Polymarket"));
      }
      if (platform === "all" || platform === "kalshi") {
        endpoints.push(fetchPlatformMarkets("/api/kalshi/trending", "Kalshi"));
      }
      if (platform === "all" || platform === "manifold") {
        endpoints.push(fetchPlatformMarkets("/api/manifold/trending", "Manifold"));
      }
      
      const results = await Promise.all(endpoints);
      const allMarkets = results.flat();
      setMarkets(allMarkets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, [platform]);

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Markets</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Browse all active prediction markets</p>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button 
              style={{ ...s.filterBtn, ...(platform === "all" ? s.filterBtnActive : {}) }}
              onClick={() => setPlatform("all")}
            >
              All
            </button>
            <button 
              style={{ ...s.filterBtn, ...(platform === "polymarket" ? s.filterBtnActive : {}) }}
              onClick={() => setPlatform("polymarket")}
            >
              Polymarket
            </button>
            <button 
              style={{ ...s.filterBtn, ...(platform === "kalshi" ? s.filterBtnActive : {}) }}
              onClick={() => setPlatform("kalshi")}
            >
              Kalshi
            </button>
            <button 
              style={{ ...s.filterBtn, ...(platform === "manifold" ? s.filterBtnActive : {}) }}
              onClick={() => setPlatform("manifold")}
            >
              Manifold
            </button>
          </div>
          <div style={s.action} onClick={fetchMarkets}>↻ Refresh</div>
        </div>
        {loading && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>Loading markets...</div>}
        {error && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", padding: 20 }}>{error}</div>}
        {!loading && !error && markets.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>No markets found</div>}
        {!loading && !error && markets.map((m, i) => {
          const odds = parsePrice(m.outcomePrices || m.yes_price || m.probability);
          const vol = formatVolume(m.volume, m.platform);
          const end = (m.endDate || m.closeDate) ? new Date(m.endDate || m.closeDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
          const metaVolumeLabel = m.platform === "Kalshi" ? `${vol} VOL` : `${vol} VOL`;
          return (
            <div key={i} style={s.row}>
              <div style={s.icon}>{getIcon(m.question)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.q}>{m.question}</div>
                <div style={s.meta}>{m.platform?.toUpperCase() || 'POLYMARKET'} · EXPIRES {end} · {metaVolumeLabel}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={s.odds}>{odds}¢</div>
                <div style={s.bar}>
                  <div style={{ height: "100%", width: `${odds}%`, background: "linear-gradient(90deg,var(--blue),var(--green))", borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>YES</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
const s = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  filterBtn: {
    padding: "6px 12px",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  filterBtnActive: {
    background: "var(--blue)",
    color: "#fff",
    borderColor: "var(--blue)",
  },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", cursor: "pointer", borderRadius: 8, margin: "0 -8px" },
  icon: { width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "var(--blue-light)" },
  q: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  bar: { width: 60, height: 3, background: "var(--border)", borderRadius: 99, marginTop: 4, overflow: "hidden" },
};
