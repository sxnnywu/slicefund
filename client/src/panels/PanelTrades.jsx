import React, { useEffect, useMemo, useState } from "react";
import { getAllTrending } from "../lib/trendingCache.js";

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

function formatOdds(probability) {
  const normalized = toProbability(probability);
  if (normalized === null) return "—";
  return `${Math.round(normalized * 100)}¢`;
}

function formatVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return numeric.toFixed(0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizeMarkets(platform, markets) {
  return (markets || [])
    .map((market) => {
      const odds =
        platform === "Polymarket"
          ? parsePolymarketPrice(market.outcomePrices)
          : platform === "Kalshi"
            ? toProbability(market.yes_price)
            : toProbability(market.probability);

      if (odds === null) return null;

      const closeDate = market.endDate || market.closeDate || null;
      const url =
        platform === "Polymarket"
          ? (market.slug ? `https://polymarket.com/event/${market.slug}` : null)
          : platform === "Kalshi"
            ? (market.ticker ? `https://kalshi.com/markets/${market.ticker}` : null)
            : (market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null));

      return {
        id: `${platform}-${market.id}`,
        question: market.question,
        platform,
        odds,
        noOdds: Math.max(0, Math.min(1, 1 - odds)),
        volume: Number(market.volume) || 0,
        closeDate,
        url,
      };
    })
    .filter(Boolean);
}

export default function PanelTrades() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState("all");

  const fetchData = async ({ force = false } = {}) => {
    setLoading(true);
    setError(null);

    try {
      const { polymarket: polyJson, kalshi: kalshiJson, manifold: manifoldJson } = await getAllTrending({ force });

      const merged = [
        ...normalizeMarkets("Polymarket", polyJson?.markets || []),
        ...normalizeMarkets("Kalshi", kalshiJson?.markets || []),
        ...normalizeMarkets("Manifold", manifoldJson?.markets || []),
      ]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 30);

      setRows(merged);
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load market tape");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    if (platform === "all") return rows;
    return rows.filter((row) => row.platform.toLowerCase() === platform);
  }, [rows, platform]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Market Tape</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            Live market snapshots from Polymarket, Kalshi, and Manifold
          </p>
        </div>
        <button className="sf-btn-smooth" style={s.refreshBtn} onClick={() => fetchData({ force: true })} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={s.filterRow}>
        {[
          { id: "all", label: "All" },
          { id: "polymarket", label: "Polymarket" },
          { id: "kalshi", label: "Kalshi" },
          { id: "manifold", label: "Manifold" },
        ].map((item) => (
          <button
            key={item.id}
            style={{ ...s.filterBtn, ...(platform === item.id ? s.filterBtnActive : {}) }}
            onClick={() => setPlatform(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={s.error}>{error}</div>
      )}

      <div style={s.card}>
        <div style={s.tableHead}>
          <div style={s.colMarket}>Market</div>
          <div style={s.col}>Platform</div>
          <div style={s.col}>YES</div>
          <div style={s.col}>NO</div>
          <div style={s.col}>Volume</div>
          <div style={s.col}>Close</div>
          <div style={s.col}>Link</div>
        </div>

        {loading && filteredRows.length === 0 && (
          <div style={s.empty}>Loading market tape...</div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div style={s.empty}>No markets available.</div>
        )}

        {filteredRows.map((row) => (
          <div key={row.id} style={s.tableRow}>
            <div style={s.colMarket}>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.question}</div>
            </div>
            <div style={s.col}>{row.platform}</div>
            <div style={s.colYes}>{formatOdds(row.odds)}</div>
            <div style={s.colNo}>{formatOdds(row.noOdds)}</div>
            <div style={s.col}>{formatVolume(row.volume)}</div>
            <div style={s.col}>{formatDate(row.closeDate)}</div>
            <div style={s.col}>
              {row.url ? (
                <a href={row.url} target="_blank" rel="noopener noreferrer" style={s.link}>Open ↗</a>
              ) : (
                "—"
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const s = {
  filterRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "var(--blue)",
    color: "#fff",
    borderColor: "var(--blue)",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "18px 22px",
    boxShadow: "var(--shadow)",
  },
  tableHead: {
    display: "grid",
    gridTemplateColumns: "1.6fr 110px 80px 80px 90px 90px 90px",
    gap: 12,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.1,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    paddingBottom: 10,
    borderBottom: "1px solid var(--border2)",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1.6fr 110px 80px 80px 90px 90px 90px",
    gap: 12,
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid var(--border2)",
    fontSize: 12,
  },
  colMarket: { minWidth: 0 },
  col: { fontFamily: "'DM Mono',monospace", fontSize: 11 },
  colYes: { fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--green)" },
  colNo: { fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--red)" },
  empty: { padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" },
  error: {
    background: "var(--red-light)",
    border: "1px solid rgba(255,77,106,0.3)",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 16,
    color: "var(--red)",
    fontSize: 13,
  },
  refreshBtn: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
    cursor: "pointer",
  },
  link: {
    color: "var(--blue)",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 11,
  },
};
