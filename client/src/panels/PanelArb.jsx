import React from "react";

const ARBS = [
  { q: "Will Fed cut rates in March 2025?", k: "0.42", p: "0.61", spread: "19¢", liq: "$85K", confidence: "0.87", decision: "CONFIRMED", risk: "Medium", riskColor: "var(--green)" },
  { q: "Will Trump win 2026 midterms majority?", k: "0.55", p: "0.67", spread: "12¢", liq: "$120K", confidence: "0.64", decision: "REJECTED", risk: "Low", riskColor: "var(--red)" },
  { q: "Will BTC hit $80K before April?", k: "0.38", p: "0.49", spread: "11¢", liq: "$220K", confidence: "0.58", decision: "REJECTED", risk: "Low", riskColor: "var(--red)" },
];

function getDecisionStyles(decision) {
  if (decision === "CONFIRMED") {
    return {
      cardBg: "var(--green-light)",
      cardBorder: "1px solid rgba(0,196,140,0.25)",
      chipBg: "rgba(0,196,140,0.12)",
      chipColor: "var(--green)",
      actionLabel: "Execute on Solana →",
    };
  }

  return {
    cardBg: "var(--red-light)",
    cardBorder: "1px solid rgba(255,77,106,0.22)",
    chipBg: "rgba(255,77,106,0.12)",
    chipColor: "var(--red)",
    actionLabel: "View Analysis →",
  };
}

export default function PanelArb() {
  const liveCount = ARBS.filter((a) => a.decision === "CONFIRMED").length;

  return (
    <>
      <div style={{ marginBottom: 36 }}><h2 style={{ fontSize: 24, fontWeight: 700 }}>Arb Scanner</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>{liveCount} live opportunities detected</p></div>
      <div style={s.statRow}>
        {[{ l: "Live Opportunities", v: String(liveCount), c: "var(--green)" }, { l: "Best Spread", v: "19¢" }, { l: "Avg Spread", v: "14¢" }, { l: "Last Scan", v: "0s" }].map((x, i) => (
          <div key={i} className="sf-card-smooth" style={s.stat}><div style={s.statL}>{x.l}</div><div style={{ ...s.statV, color: x.c || "var(--text)" }}>{x.v}</div></div>
        ))}
      </div>
      <div className="sf-card-smooth" style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Live Opportunities</div><div style={s.action}>Execute all</div></div>
        {ARBS.map((a, i) => (
          <div key={i} className="sf-card-smooth" style={{ ...s.arb, background: getDecisionStyles(a.decision).cardBg, border: getDecisionStyles(a.decision).cardBorder }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.q}</div>
              <span style={{ ...s.decisionChip, background: getDecisionStyles(a.decision).chipBg, color: getDecisionStyles(a.decision).chipColor }}>{a.decision}</span>
            </div>
            <div style={s.platforms}>
              <div style={s.plat}><div style={s.platN}>KALSHI</div><div style={s.platO}>{a.k}</div></div>
              <div style={{ color: "var(--text-dim)" }}>→</div>
              <div style={s.plat}><div style={s.platN}>POLYMARKET</div><div style={s.platO}>{a.p}</div></div>
              <div style={{ ...s.plat, background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)" }}><div style={{ fontSize: 10, color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>SPREAD</div><div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--green)" }}>{a.spread}</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Liq: <b style={{ color: "var(--text)" }}>{a.liq}</b></span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Conf: <b style={{ color: "var(--text)" }}>{a.confidence}</b></span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Risk: <b style={{ color: a.riskColor }}>{a.risk}</b></span>
              </div>
              <button className="sf-btn-smooth" style={a.decision === "CONFIRMED" ? s.execBtn : s.analysisBtn}>{getDecisionStyles(a.decision).actionLabel}</button>
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
  decisionChip: {
    display: "inline-flex",
    alignItems: "center",
    height: 22,
    borderRadius: 99,
    padding: "0 10px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  platforms: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  plat: { flex: 1, background: "var(--white)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
  platN: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 1, fontFamily: "'DM Mono',monospace" },
  platO: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)", marginTop: 2 },
  execBtn: { padding: "8px 16px", background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  analysisBtn: { padding: "8px 16px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" },
};
