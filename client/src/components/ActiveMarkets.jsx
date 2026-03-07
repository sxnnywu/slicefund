import React from "react";

const MARKETS = [
  { icon: "🇺🇸", q: "Will Trump impose 25%+ tariffs on all Chinese goods by June 2025?", src: "POLYMARKET", exp: "JUN 30", odds: 71 },
  { icon: "🤖", q: "Will EU AI Act enforcement begin before Q4 2025?", src: "POLYMARKET", exp: "SEP 30", odds: 67 },
  { icon: "📈", q: "Will the Fed cut rates at the March 2025 FOMC meeting?", src: "KALSHI", exp: "MAR 20", odds: 38 },
  { icon: "₿", q: "Will Bitcoin hit $100,000 before June 2025?", src: "POLYMARKET", exp: "JUN 1", odds: 54 },
];

export default function ActiveMarkets() {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Active Markets in Your Baskets</div>
        <div style={styles.action}>View all →</div>
      </div>
      {MARKETS.map((m, i) => (
        <div key={i} style={styles.row}>
          <div style={styles.icon}>{m.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.q}>{m.q}</div>
            <div style={styles.meta}>{m.src} · EXPIRES {m.exp}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={styles.odds}>{m.odds}¢</div>
            <div style={styles.bar}><div style={{ ...styles.fill, width: `${m.odds}%` }} /></div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>YES</div>
          </div>
        </div>
      ))}
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
