import React from "react";

const MKTS = [
  { icon: "🇺🇸", q: "Will Trump impose 25%+ tariffs on all Chinese goods by June 2025?", src: "POLYMARKET", exp: "JUN 30", vol: "$2.4M", odds: 71 },
  { icon: "🤖", q: "Will EU AI Act enforcement begin before Q4 2025?", src: "POLYMARKET", exp: "SEP 30", vol: "$1.8M", odds: 67 },
  { icon: "📈", q: "Will the Fed cut rates at the March 2025 FOMC meeting?", src: "KALSHI", exp: "MAR 20", vol: "$3.2M", odds: 38 },
  { icon: "₿", q: "Will Bitcoin hit $100,000 before June 2025?", src: "POLYMARKET", exp: "JUN 1", vol: "$2.8M", odds: 54 },
  { icon: "🏛️", q: "Will the US pass a federal AI bill in 2025?", src: "KALSHI", exp: "DEC 31", vol: "$740K", odds: 31 },
  { icon: "🌍", q: "Will Canada enter a recession in 2025?", src: "POLYMARKET", exp: "DEC 31", vol: "$560K", odds: 44 },
];

export default function PanelMarkets() {
  return (
    <>
      <div style={{ marginBottom: 36 }}><h2 style={{ fontSize: 24, fontWeight: 700 }}>Markets</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Browse all active prediction markets</p></div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Trending Markets</div><div style={s.action}>Filter</div></div>
        {MKTS.map((m, i) => (
          <div key={i} style={s.row}>
            <div style={s.icon}>{m.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={s.q}>{m.q}</div><div style={s.meta}>{m.src} · EXPIRES {m.exp} · {m.vol} VOL</div></div>
            <div style={{ textAlign: "right", flexShrink: 0 }}><div style={s.odds}>{m.odds}¢</div><div style={s.bar}><div style={{ height: "100%", width: `${m.odds}%`, background: "linear-gradient(90deg,var(--blue),var(--green))", borderRadius: 99 }} /></div><div style={{ fontSize: 10, color: "var(--text-dim)" }}>YES</div></div>
          </div>
        ))}
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
