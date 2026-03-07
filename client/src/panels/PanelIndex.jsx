import React from "react";

export default function PanelIndex() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div><h2 style={{ fontSize: 24, fontWeight: 700 }}>Index Builder</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Build and mint custom prediction market baskets as SPL tokens</p></div>
        <button style={s.btn}>Mint Basket →</button>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Basket Configuration</div>
        <div style={{ marginBottom: 16 }}><div style={s.label}>Basket Name</div><input style={s.input} defaultValue="AI Regulation Wave 2025" /></div>
        <div style={{ marginBottom: 20 }}><div style={s.label}>Rebalance Threshold</div><input style={s.input} defaultValue="5% drift" /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><div style={{ fontSize: 13, fontWeight: 700 }}>Markets in Basket</div><div style={s.action}>+ Add market</div></div>
        {[
          { w: "40%", q: "Will EU AI Act enforcement begin before Q4 2025?" },
          { w: "35%", q: "Will US Congress pass an AI liability bill in 2025?" },
          { w: "25%", q: "Will OpenAI face a major regulatory action in 2025?" },
        ].map((m, i) => (
          <div key={i} style={s.row}>
            <div style={s.wBadge}>{m.w}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{m.q}</div><div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 }}>WEIGHT: {m.w}</div></div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, color: "var(--text-dim)", cursor: "pointer" }}>✕</div>
          </div>
        ))}
      </div>
    </>
  );
}
const s = {
  btn: { padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", maxWidth: 700 },
  label: { fontSize: 11, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6, letterSpacing: 0.3 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontFamily: "'Outfit',sans-serif", fontSize: 14, color: "var(--text)", outline: "none", background: "var(--bg)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", margin: "0 -8px" },
  wBadge: { width: 36, height: 36, borderRadius: 10, background: "var(--blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--blue)", flexShrink: 0 },
};
