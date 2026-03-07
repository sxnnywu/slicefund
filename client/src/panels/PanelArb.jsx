import React, { useState, useEffect } from "react";

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

// Fetch markets from Polymarket API for scanning
async function fetchMarketsForScanning() {
  try {
    const res = await fetch("/api/polymarket/trending");
    if (!res.ok) return [];
    const data = await res.json();
    const markets = data.markets || [];
    
    // Convert Polymarket markets into scan opportunities
    return markets.slice(0, 3).map(m => ({
      question: m.question,
      platformA: "Kalshi",
      priceA: Math.random() * 0.3 + 0.3, // Simulated Kalshi price
      platformB: "Polymarket",
      priceB: m.outcomePrices ? parseFloat(JSON.parse(m.outcomePrices)[0]) : Math.random() * 0.3 + 0.4,
    }));
  } catch (err) {
    console.error("Failed to fetch markets for scanning:", err);
    return [];
  }
}

async function fetchScan(opportunity) {
  try {
    const response = await fetch("http://localhost:3001/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opportunity),
    });

    if (!response.ok) {
      console.error(`Scan failed for ${opportunity.question}:`, response.statusText);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`Error scanning ${opportunity.question}:`, error);
    return null;
  }
}

export default function PanelArb() {
  const [arbs, setArbs] = useState([]);
  const [isScanning, setIsScanning] = useState(true);
  const [lastScanTime, setLastScanTime] = useState(null);

  useEffect(() => {
    const runScans = async () => {
      setIsScanning(true);
      const scans = await fetchMarketsForScanning();
      if (scans.length === 0) {
        setIsScanning(false);
        return;
      }
      const results = await Promise.all(scans.map(fetchScan));
      const validResults = results.filter((r) => r !== null);
      setArbs(validResults);
      setLastScanTime(new Date());
      setIsScanning(false);
    };

    runScans();
  }, []);

  const liveCount = arbs.filter((a) => a.decision === "CONFIRMED").length;
  const bestSpread = arbs.length > 0 ? Math.max(...arbs.map((a) => a.spread)) : 0;
  const avgSpread = arbs.length > 0 ? (arbs.reduce((sum, a) => sum + a.spread, 0) / arbs.length).toFixed(2) : 0;
  const timeSinceLastScan = lastScanTime ? Math.floor((Date.now() - lastScanTime) / 1000) : null;

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Arb Scanner</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
          {isScanning ? "Scanning..." : `${liveCount} live opportunities detected`}
        </p>
      </div>
      <div style={s.statRow}>
        {[
          { l: "Live Opportunities", v: String(liveCount), c: "var(--green)" },
          { l: "Best Spread", v: bestSpread > 0 ? `${(bestSpread * 100).toFixed(0)}¢` : "—" },
          { l: "Avg Spread", v: avgSpread > 0 ? `${(avgSpread * 100).toFixed(0)}¢` : "—" },
          { l: "Last Scan", v: timeSinceLastScan !== null ? `${timeSinceLastScan}s` : "—" },
        ].map((x, i) => (
          <div key={i} className="sf-card-smooth" style={s.stat}>
            <div style={s.statL}>{x.l}</div>
            <div style={{ ...s.statV, color: x.c || "var(--text)" }}>{x.v}</div>
          </div>
        ))}
      </div>
      <div className="sf-card-smooth" style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {isScanning ? "Scanning markets..." : `${arbs.length} opportunities analyzed`}
          </div>
          <div style={s.action} onClick={() => { /* TODO: re-run scan */ }}>
            Scan now
          </div>
        </div>
        {arbs.length === 0 && !isScanning && (
          <div style={{ padding: "24px", color: "var(--text-dim)", textAlign: "center", fontSize: 13 }}>
            No opportunities found. Try scanning again.
          </div>
        )}
        {arbs.map((a) => (
          <div key={a.id} className="sf-card-smooth" style={{ ...s.arb, background: getDecisionStyles(a.decision).cardBg, border: getDecisionStyles(a.decision).cardBorder }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
              <span style={{ ...s.decisionChip, background: getDecisionStyles(a.decision).chipBg, color: getDecisionStyles(a.decision).chipColor }}>
                {a.decision}
              </span>
            </div>
            <div style={s.platforms}>
              <div style={s.plat}>
                <div style={s.platN}>{a.platforms?.[0]?.toUpperCase()}</div>
                <div style={s.platO}>{a.priceA?.toFixed(2)}</div>
              </div>
              <div style={{ color: "var(--text-dim)" }}>→</div>
              <div style={s.plat}>
                <div style={s.platN}>{a.platforms?.[1]?.toUpperCase()}</div>
                <div style={s.platO}>{a.priceB?.toFixed(2)}</div>
              </div>
              <div style={{ ...s.plat, background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)" }}>
                <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>SPREAD</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--green)" }}>
                  {(a.spread * 100).toFixed(0)}¢
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Confidence: <b style={{ color: "var(--text)" }}>{(a.confidence * 100).toFixed(0)}%</b>
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Urgency: <b style={{ color: "var(--text)" }}>{a.urgency || "—"}</b>
                </span>
              </div>
              <button className="sf-btn-smooth" style={a.decision === "CONFIRMED" ? s.execBtn : s.analysisBtn}>
                {getDecisionStyles(a.decision).actionLabel}
              </button>
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
