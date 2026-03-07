import React, { useState, useEffect } from "react";

function parsePrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return (parseFloat(prices[0]) * 100).toFixed(0);
    }
  } catch {}
  return "—";
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

  const fetchMarkets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/polymarket/trending");
      if (!res.ok) throw new Error("Failed to fetch markets");
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Markets</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Browse all active prediction markets</p>
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Trending Markets</div>
          <div style={s.action} onClick={fetchMarkets}>↻ Refresh</div>
        </div>
        {loading && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>Loading markets...</div>}
        {error && <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", padding: 20 }}>{error}</div>}
        {!loading && !error && markets.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>No markets found</div>}
        {!loading && !error && markets.map((m, i) => {
          const odds = parsePrice(m.outcomePrices);
          const vol = m.volume ? `$${(Number(m.volume) / 1000).toFixed(0)}K` : "—";
          const end = m.endDate ? new Date(m.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
          return (
            <div key={i} style={s.row}>
              <div style={s.icon}>{getIcon(m.question)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.q}>{m.question}</div>
                <div style={s.meta}>POLYMARKET · EXPIRES {end} · {vol} VOL</div>
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
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", cursor: "pointer", borderRadius: 8, margin: "0 -8px" },
  icon: { width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "var(--blue-light)" },
  q: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  bar: { width: 60, height: 3, background: "var(--border)", borderRadius: 99, marginTop: 4, overflow: "hidden" },
};
