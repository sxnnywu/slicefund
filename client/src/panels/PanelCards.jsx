import React from "react";

export default function PanelCards({ searches = [] }) {
  const cards = searches.slice(0, 3).map(s => ({
    thesis: s.thesis,
    markets: s.picks,
    avg: s.avgOdds,
    vol: `$${(s.volume / 1000).toFixed(0)}K`,
    time: s.time,
  }));
  return (
    <>
      <div style={{ marginBottom: 36 }}><h2 style={{ fontSize: 24, fontWeight: 700 }}>Generated Cards</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Shareable Cloudinary OG cards for your theses</p></div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 15, fontWeight: 700 }}>Recent Cards</div><div style={s.action}>Generate new</div></div>
        {cards.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: 40 }}>No cards generated yet. Analyze a thesis to create shareable cards.</div>}
        {cards.map((c, i) => (
          <div key={i} style={s.row}>
            <div style={s.preview}>
              <div style={s.previewBar} />
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono',monospace", letterSpacing: 2, marginBottom: 6 }}>SLICEFUND</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>"{c.thesis}"</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <span style={s.pBlue}>{c.markets} markets</span>
                <span style={s.pGreen}>{c.avg} avg</span>
                <span style={s.pBlue}>{c.vol} vol</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace" }}>{c.time}</div>
            </div>
            <button style={s.copyBtn}>Copy URL</button>
          </div>
        ))}
      </div>
    </>
  );
}
const s = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border2)" },
  preview: { background: "linear-gradient(135deg,#0A0F2E,#0D1A40)", borderRadius: 10, padding: "14px 16px", width: 200, flexShrink: 0, position: "relative", overflow: "hidden" },
  previewBar: { position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,var(--blue),var(--green))" },
  pBlue: { fontSize: 10, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono',monospace", fontWeight: 500, background: "var(--blue-light)", color: "var(--blue)" },
  pGreen: { fontSize: 10, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono',monospace", fontWeight: 500, background: "var(--green-light)", color: "var(--green)" },
  copyBtn: { padding: "8px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "'Outfit',sans-serif", fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer" },
};
