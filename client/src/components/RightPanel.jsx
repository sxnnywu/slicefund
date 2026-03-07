import React from "react";

export default function RightPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Arb Alert */}
      <div style={styles.card}>
        <div style={styles.arb}>
          <div style={styles.arbHeader}>
            <div style={styles.arbDot} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "var(--green)", textTransform: "uppercase" }}>Live Arb · 0s ago</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>Will Fed cut rates in March 2025?</div>
          <div style={styles.platforms}>
            <div style={styles.platform}><div style={styles.platName}>KALSHI</div><div style={styles.platOdds}>0.42</div></div>
            <div style={{ fontSize: 18, color: "var(--text-dim)" }}>→</div>
            <div style={styles.platform}><div style={styles.platName}>POLYMARKET</div><div style={styles.platOdds}>0.61</div></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(0,196,140,0.7)", letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>SPREAD</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 500, color: "var(--green)" }}>19¢</div>
            </div>
            <button style={styles.execBtn}>Execute →</button>
          </div>
        </div>
      </div>

      {/* Market Pulse */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Market Pulse</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Refresh</div>
        </div>
        {[
          { name: "Trump Tariffs", sub: "Polymarket basket", price: "0.71", delta: "↑ +0.04", up: true, bars: [40,55,50,65,60,75,70,85,80,100] },
          { name: "AI Regulation", sub: "EU + US combined", price: "0.64", delta: "↓ -0.02", up: false, bars: [70,65,75,60,70,65,55,60,65,64] },
          { name: "Fed Rate Cuts", sub: "2025 total cuts", price: "0.52", delta: "↓ -0.06", up: false, bars: [80,70,60,50,55,45,40,50,45,52] },
        ].map((p) => (
          <div key={p.name} style={styles.pulseItem}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{p.sub}</div>
              <div style={styles.miniChart}>
                {p.bars.map((h, j) => <div key={j} style={{ width: 4, borderRadius: 2, background: "var(--blue-mid)", height: `${h}%` }} />)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500 }}>{p.price}</div>
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, fontFamily: "'DM Mono', monospace", color: p.up ? "var(--green)" : "var(--red)" }}>{p.delta}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Share Card */}
      <div style={styles.card}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", animation: "blink 1.5s infinite" }} />
          Latest Generated Card
        </div>
        <div style={styles.preview}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>BACKBOARD · THESIS CARD</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.4 }}>"AI regulation will tighten significantly in 2025"</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div><div style={styles.cldL}>Markets</div><div style={styles.cldV}>5</div></div>
            <div><div style={styles.cldL}>Avg Odds</div><div style={styles.cldV}>0.64</div></div>
            <div><div style={styles.cldL}>Signal</div><div style={{ ...styles.cldV, color: "#00C48C" }}>+12.4%</div></div>
          </div>
          <button style={styles.shareBtn}>Share Card · Copy URL</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "20px 22px", boxShadow: "var(--shadow)" },
  arb: { background: "linear-gradient(135deg, rgba(26,92,255,0.06), rgba(0,196,140,0.06))", border: "1px solid rgba(26,92,255,0.2)", borderRadius: 14, padding: "18px 20px" },
  arbHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  arbDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--green)", animation: "blink 1s infinite" },
  platforms: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  platform: { flex: 1, background: "var(--white)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
  platName: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 1, fontFamily: "'DM Mono', monospace" },
  platOdds: { fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)", marginTop: 2 },
  execBtn: { padding: "8px 16px", background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  pulseItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border2)" },
  miniChart: { display: "flex", alignItems: "flex-end", gap: 2, height: 24, marginTop: 8 },
  preview: { background: "linear-gradient(135deg, #0A0F2E, #0D1A40)", borderRadius: 14, padding: 20, position: "relative", overflow: "hidden" },
  cldL: { fontSize: 9, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", fontFamily: "'DM Mono', monospace" },
  cldV: { fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, color: "#fff" },
  shareBtn: { width: "100%", marginTop: 14, padding: 9, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(255,255,255,0.6)", fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
