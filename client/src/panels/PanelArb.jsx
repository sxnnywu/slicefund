import React from "react";

const ARBS = [
  { q: "Will Fed cut rates in March 2025?", k: "0.42", p: "0.61", spread: "19¢", liq: "$85K", risk: "Medium", riskColor: "#FFB800" },
  { q: "Will Trump win 2026 midterms majority?", k: "0.55", p: "0.67", spread: "12¢", liq: "$120K", risk: "Low", riskColor: "var(--green)" },
  { q: "Will BTC hit $80K before April?", k: "0.38", p: "0.49", spread: "11¢", liq: "$220K", risk: "Low", riskColor: "var(--green)" },
];

export default function PanelArb() {
  return (
    <>
      <div style={{ marginBottom: 36 }}><h2 style={{ fontSize: 24, fontWeight: 700 }}>Arb Scanner</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>3 live opportunities detected</p></div>
      <div style={s.statRow}>
        {[{ l: "Live Opportunities", v: "3", c: "var(--green)" }, { l: "Best Spread", v: "19¢" }, { l: "Avg Spread", v: "14¢" }, { l: "Last Scan", v: "0s" }].map((x, i) => (
          <div key={i} style={s.stat}><div style={s.statL}>{x.l}</div><div style={{ ...s.statV, color: x.c || "var(--text)" }}>{x.v}</div></div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Live Opportunities</div><div style={s.action}>Execute all</div></div>
        {ARBS.map((a, i) => (
          <div key={i} style={s.arb}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{a.q}</div>
            <div style={s.platforms}>
              <div style={s.plat}><div style={s.platN}>KALSHI</div><div style={s.platO}>{a.k}</div></div>
              <div style={{ color: "var(--text-dim)" }}>→</div>
              <div style={s.plat}><div style={s.platN}>POLYMARKET</div><div style={s.platO}>{a.p}</div></div>
              <div style={{ ...s.plat, background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)" }}><div style={{ fontSize: 10, color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>SPREAD</div><div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--green)" }}>{a.spread}</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Liq: <b style={{ color: "var(--text)" }}>{a.liq}</b></span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Risk: <b style={{ color: a.riskColor }}>{a.risk}</b></span>
              </div>
              <button style={s.execBtn}>Execute on Solana →</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
const s = {
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  arb: { background: "var(--blue-light)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 12 },
  platforms: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  plat: { flex: 1, background: "var(--white)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
  platN: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 1, fontFamily: "'DM Mono',monospace" },
  platO: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)", marginTop: 2 },
  execBtn: { padding: "8px 16px", background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" },
};
