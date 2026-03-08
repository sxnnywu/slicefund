import React, { useState, useEffect } from "react";
import { getAllTrending } from "../lib/trendingCache.js";

function getIcon(question) {
  const q = question.toLowerCase();
  if (q.includes("trump") || q.includes("tariff")) return "🇺🇸";
  if (q.includes("ai") || q.includes("tech")) return "🤖";
  if (q.includes("fed") || q.includes("rate") || q.includes("interest")) return "📈";
  if (q.includes("bitcoin") || q.includes("crypto") || q.includes("btc")) return "₿";
  if (q.includes("congress") || q.includes("bill") || q.includes("law")) return "🏛️";
  if (q.includes("recession") || q.includes("economy")) return "🌍";
  return "📊";
}

function parsePrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return Math.round(parseFloat(prices[0]) * 100);
    }
  } catch {}
  return null;
}

function toProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1 && numeric <= 100) return numeric / 100;
  if (numeric < 0 || numeric > 1) return null;
  return numeric;
}

export default function ActiveMarkets() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const { polymarket: polyJson, kalshi: kalshiJson, manifold: manifoldJson } = await getAllTrending();

        const polymarket = (polyJson?.markets || []).map((market) => ({
          ...market,
          platform: "Polymarket",
          odds: parsePrice(market.outcomePrices),
          expires: market.endDate,
        }));

        const kalshi = (kalshiJson?.markets || []).map((market) => ({
          ...market,
          platform: "Kalshi",
          odds: (() => {
            const normalized = toProbability(market.yes_price);
            return normalized === null ? null : Math.round(normalized * 100);
          })(),
          expires: market.closeDate,
        }));

        const manifold = (manifoldJson?.markets || []).map((market) => ({
          ...market,
          platform: "Manifold",
          odds: (() => {
            const normalized = toProbability(market.probability);
            return normalized === null ? null : Math.round(normalized * 100);
          })(),
          expires: market.closeDate,
        }));

        const merged = [...polymarket, ...kalshi, ...manifold]
          .filter((market) => market.odds !== null)
          .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))
          .slice(0, 4);

        setMarkets(merged);
      } catch (err) {
        console.error("Failed to fetch markets:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMarkets();
  }, []);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Active Markets in Your Baskets</div>
        <div style={styles.action}>View all →</div>
      </div>
      {loading && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>Loading...</div>}
      {!loading && markets.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>No markets found</div>}
      {!loading && markets.map((m, i) => {
        const odds = Number.isFinite(Number(m.odds)) ? Number(m.odds) : null;
        const exp = m.expires ? new Date(m.expires).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase() : "—";
        return (
        <div key={m.id || m.id || i} style={styles.row}>
          <div style={styles.icon}>{getIcon(m.question)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.q}>{m.question}</div>
            <div style={styles.meta}>{String(m.platform || "Unknown").toUpperCase()} · EXPIRES {exp}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={styles.odds}>{odds !== null ? `${odds}¢` : "—"}</div>
            <div style={styles.bar}><div style={{ ...styles.fill, width: odds !== null ? `${odds}%` : "0%" }} /></div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>YES</div>
          </div>
        </div>
      );})}
    </div>
  );
}

const styles = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono', monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", cursor: "pointer", borderRadius: 8, margin: "0 -8px" },
  icon: { width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "var(--blue-light)" },
  q: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  bar: { width: 60, height: 3, background: "var(--border)", borderRadius: 99, marginTop: 4, overflow: "hidden" },
  fill: { height: "100%", background: "linear-gradient(90deg, var(--blue), var(--green))", borderRadius: 99 },
};
