import React, { useEffect, useMemo, useState } from "react";
import usePhantom from "../hooks/usePhantom.js";

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function PanelTrades() {
  const { walletAddress } = usePhantom();
  const [trades, setTrades] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [marketsRes, tradesRes] = await Promise.all([
        fetch("/api/mock/polymarket/markets?limit=100"),
        fetch(`/api/mock/polymarket/trades?limit=200${walletAddress ? `&wallet=${walletAddress}` : ""}`),
      ]);

      if (!marketsRes.ok) {
        throw new Error("Failed to load markets");
      }
      if (!tradesRes.ok) {
        throw new Error("Failed to load trades");
      }

      const marketsPayload = await marketsRes.json();
      const tradesPayload = await tradesRes.json();

      setMarkets(Array.isArray(marketsPayload.markets) ? marketsPayload.markets : []);
      setTrades(Array.isArray(tradesPayload.trades) ? tradesPayload.trades.slice().reverse() : []);
    } catch (err) {
      setError(err.message || "Failed to load trades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [walletAddress]);

  const marketIndex = useMemo(() => {
    const index = new Map();
    markets.forEach((market) => {
      const key = normalizeKey(market.question);
      if (key) index.set(key, market);
    });
    return index;
  }, [markets]);

  const rows = trades.map((trade) => {
    const market = marketIndex.get(normalizeKey(trade.market));
    const markPrice = Number.isFinite(market?.lastPrice) ? market.lastPrice : trade.price;
    const size = Number(trade.size || 0);
    const entry = Number(trade.price || 0);
    const side = String(trade.side || "BUY").toUpperCase();
    const pnl = side === "SELL" ? (entry - markPrice) * size : (markPrice - entry) * size;

    return {
      ...trade,
      markPrice,
      pnl,
    };
  });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Trades</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            {walletAddress ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "No wallet connected"}
          </p>
        </div>
        <button className="sf-btn-smooth" style={s.refreshBtn} onClick={fetchData} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={s.error}>
          {error}
        </div>
      )}

      <div style={s.card}>
        <div style={s.tableHead}>
          <div style={s.colTime}>Time</div>
          <div style={s.colMarket}>Market</div>
          <div style={s.col}>Platform</div>
          <div style={s.col}>Side</div>
          <div style={s.col}>Size</div>
          <div style={s.col}>Entry</div>
          <div style={s.col}>Mark</div>
          <div style={s.colPnl}>P&L</div>
        </div>
        {loading && rows.length === 0 && (
          <div style={s.empty}>Loading trades...</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={s.empty}>No trades yet. Execute an arb or buy a basket to see activity.</div>
        )}
        {rows.map((trade) => (
          <div key={trade.id} style={s.tableRow}>
            <div style={s.colTime}>{formatDate(trade.createdAt)}</div>
            <div style={s.colMarket}>
              <div style={{ fontWeight: 600 }}>{trade.market}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{trade.id}</div>
            </div>
            <div style={s.col}>{trade.platform}</div>
            <div style={{ ...s.col, color: trade.side === "SELL" ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{trade.side}</div>
            <div style={s.col}>{formatNumber(Number(trade.size || 0), 2)}</div>
            <div style={s.col}>{formatNumber(Number(trade.price || 0), 3)}</div>
            <div style={s.col}>{formatNumber(Number(trade.markPrice || 0), 3)}</div>
            <div style={{ ...s.colPnl, color: trade.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
              {formatMoney(trade.pnl)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const s = {
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "18px 22px",
    boxShadow: "var(--shadow)",
  },
  tableHead: {
    display: "grid",
    gridTemplateColumns: "160px 1.2fr 120px 80px 90px 90px 90px 90px",
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
    gridTemplateColumns: "160px 1.2fr 120px 80px 90px 90px 90px 90px",
    gap: 12,
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid var(--border2)",
    fontSize: 12,
  },
  colTime: { fontSize: 11, color: "var(--text-dim)" },
  colMarket: { minWidth: 0 },
  col: { fontFamily: "'DM Mono',monospace" },
  colPnl: { fontFamily: "'DM Mono',monospace", fontWeight: 700 },
  empty: { padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, color: "var(--red)", fontSize: 13 },
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
};
