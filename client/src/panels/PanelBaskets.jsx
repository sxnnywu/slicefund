import React from "react";

const BASKETS = [
  { name: "Trump Tariffs 2025", markets: 4, src: "POLYMARKET", odds: 71, yield: "+22.1%", up: true },
  { name: "AI Regulation Wave", markets: 4, src: "POLYMARKET", odds: 64, yield: "+12.4%", up: true },
  { name: "Fed Rate Path", markets: 4, src: "KALSHI", odds: 52, yield: "+4.2%", up: true },
  { name: "BTC Supercycle", markets: 4, src: "POLYMARKET", odds: 43, yield: "-3.1%", up: false },
  { name: "EU Policy Basket", markets: 4, src: "POLYMARKET", odds: 58, yield: "+9.8%", up: true },
  { name: "US Election Plays", markets: 4, src: "POLYMARKET", odds: 67, yield: "+15.2%", up: true },
  { name: "Tech Regulation", markets: 4, src: "KALSHI", odds: 39, yield: "+1.4%", up: true },
];

export default function PanelBaskets() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div><h2 style={{ fontSize: 24, fontWeight: 700 }}>My Baskets</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>7 active prediction market index funds</p></div>
        <button style={s.btn}>+ New Basket</button>
      </div>
      <div style={s.statRow}>
        {[{ l: "Total Baskets", v: "7", d: "↑ 2 this week" }, { l: "Best Performer", v: "+22.1%", d: "Trump Tariffs" }, { l: "Avg Yield", v: "+14.2%", d: "↑ vs last month" }, { l: "Total Volume", v: "$18.4M", d: "Across all baskets" }].map((x, i) => (
          <div key={i} style={s.stat}><div style={s.statL}>{x.l}</div><div style={s.statV}>{x.v}</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: "var(--green)" }}>{x.d}</div></div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Active Baskets</div><div style={s.action}>Sort by yield</div></div>
        {BASKETS.map((b, i) => (
          <div key={i} style={s.row}>
            <div style={s.num}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={s.q}>{b.name}</div><div style={s.meta}>{b.markets} MARKETS · {b.src}</div></div>
            <div style={{ textAlign: "right" }}><div style={s.odds}>{b.odds}¢</div><div style={{ fontSize: 10, color: b.up ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{b.yield}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
const s = {
  btn: { padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", cursor: "pointer", borderRadius: 8, margin: "0 -8px" },
  num: { width: 32, height: 32, borderRadius: 8, background: "var(--blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--blue)", flexShrink: 0 },
  q: { fontSize: 13, fontWeight: 600 },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
};
