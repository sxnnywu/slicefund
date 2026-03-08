import React, { useCallback, useEffect, useMemo, useState } from "react";
import usePhantom from "../hooks/usePhantom.js";

function getDecisionStyles(decision) {
  if (decision === "CONFIRMED") {
    return {
      cardBg: "var(--green-light)",
      cardBorder: "1px solid rgba(0,196,140,0.25)",
      chipBg: "rgba(0,196,140,0.12)",
      chipColor: "var(--green)",
    };
  }

  return {
    cardBg: "var(--red-light)",
    cardBorder: "1px solid rgba(255,77,106,0.22)",
    chipBg: "rgba(255,77,106,0.12)",
    chipColor: "var(--red)",
  };
}

function toProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1 && numeric <= 100) return numeric / 100;
  if (numeric < 0 || numeric > 1) return null;
  return numeric;
}

function parsePolymarketPrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return toProbability(prices[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function tokenizeQuestion(question) {
  const stopWords = new Set([
    "will", "the", "and", "for", "with", "this", "that", "from", "have", "has", "are", "into", "over",
    "than", "what", "when", "where", "which", "about", "after", "before", "could", "would", "should", "market",
  ]);

  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function similarityScore(questionA, questionB) {
  const tokensA = tokenizeQuestion(questionA);
  const tokensB = tokenizeQuestion(questionB);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let overlap = 0;

  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  const minLength = Math.max(1, Math.min(setA.size, setB.size));
  return overlap / minLength;
}

function buildMarketUrl(platform, market) {
  if (platform === "Polymarket" && market.slug) return `https://polymarket.com/event/${market.slug}`;
  if (platform === "Kalshi" && (market.ticker || market.slug)) return `https://kalshi.com/markets/${market.ticker || market.slug}`;
  if (platform === "Manifold") return market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null);
  return null;
}

function normalizeMarketsByPlatform(payload, platform) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((market) => {
      let yesPrice = null;

      if (platform === "Polymarket") {
        yesPrice = parsePolymarketPrice(market.outcomePrices);
      } else if (platform === "Kalshi") {
        yesPrice = toProbability(market.yes_price);
      } else if (platform === "Manifold") {
        yesPrice = toProbability(market.probability);
      }

      if (yesPrice === null) return null;

      return {
        id: market.id,
        platform,
        question: market.question,
        yesPrice,
        slug: market.slug,
        ticker: market.ticker,
        url: buildMarketUrl(platform, market),
      };
    })
    .filter(Boolean);
}

async function fetchScan(opportunity) {
  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opportunity),
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

function buildLiveOpportunities(markets, maxPairs = 8) {
  const opportunities = [];

  for (let left = 0; left < markets.length; left += 1) {
    for (let right = left + 1; right < markets.length; right += 1) {
      const a = markets[left];
      const b = markets[right];

      if (a.platform === b.platform) continue;

      const sim = similarityScore(a.question, b.question);
      if (sim < 0.4) continue;

      const spread = Math.abs(a.yesPrice - b.yesPrice);
      if (spread < 0.04) continue;

      opportunities.push({
        question: a.question,
        platformA: a.platform,
        priceA: a.yesPrice,
        platformB: b.platform,
        priceB: b.yesPrice,
        urlA: a.url,
        urlB: b.url,
        questionA: a.question,
        questionB: b.question,
        spread,
        sim,
      });
    }
  }

  return opportunities
    .sort((a, b) => (b.spread - a.spread) || (b.sim - a.sim))
    .slice(0, maxPairs);
}

async function fetchLiveArbCandidates() {
  const [polyRes, kalshiRes, manifoldRes] = await Promise.all([
    fetch("/api/polymarket/trending"),
    fetch("/api/kalshi/trending"),
    fetch("/api/manifold/trending"),
  ]);

  const [polyJson, kalshiJson, manifoldJson] = await Promise.all([
    polyRes.json(),
    kalshiRes.json(),
    manifoldRes.json(),
  ]);

  if (!polyRes.ok || !kalshiRes.ok || !manifoldRes.ok) {
    throw new Error(
      polyJson?.error || kalshiJson?.error || manifoldJson?.error || "Failed to fetch live markets"
    );
  }

  const allMarkets = [
    ...normalizeMarketsByPlatform(polyJson?.markets || [], "Polymarket"),
    ...normalizeMarketsByPlatform(kalshiJson?.markets || [], "Kalshi"),
    ...normalizeMarketsByPlatform(manifoldJson?.markets || [], "Manifold"),
  ];

  return buildLiveOpportunities(allMarkets);
}

export default function PanelArb() {
  const [arbs, setArbs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [executingId, setExecutingId] = useState(null);
  const [execStatus, setExecStatus] = useState(null);
  const [execError, setExecError] = useState(null);
  const { walletAddress, connect, signMessage, phantomInstalled } = usePhantom();

  const runScans = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    try {
      const candidates = await fetchLiveArbCandidates();

      if (candidates.length === 0) {
        setArbs([]);
        setLastScanTime(new Date());
        return;
      }

      const scanResults = await Promise.all(
        candidates.map(async (candidate) => {
          const scanned = await fetchScan(candidate);
          if (!scanned) return null;

          return {
            ...scanned,
            questionA: candidate.questionA,
            questionB: candidate.questionB,
            urlA: candidate.urlA,
            urlB: candidate.urlB,
            rawSpread: candidate.spread,
          };
        })
      );

      setArbs(scanResults.filter(Boolean));
      setLastScanTime(new Date());
    } catch (scanError) {
      setError(scanError.message || "Scan failed");
      setArbs([]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleExecute = useCallback(async (alert) => {
    if (!alert) return;
    setExecutingId(alert.id);
    setExecStatus(null);
    setExecError(null);

    try {
      let activeWallet = walletAddress;
      if (!activeWallet) {
        const connected = await connect();
        activeWallet = connected?.toString?.() || walletAddress;
      }

      const payload = {
        type: "arb_execute",
        alertId: alert.id,
        question: alert.question || alert.title,
        platforms: alert.platforms,
        actions: alert.actions,
        priceA: alert.priceA,
        priceB: alert.priceB,
        timestamp: new Date().toISOString(),
      };

      const signature = activeWallet
        ? (await signMessage(JSON.stringify(payload), activeWallet)).signature
        : null;

      const response = await fetch("/api/mock/polymarket/execute-arb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert,
          walletAddress: activeWallet,
          solanaSignature: signature,
          metadata: { payload },
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Execution failed");
      }

      const result = await response.json();
      setExecStatus(`Executed ${result.count} mock legs`);
    } catch (err) {
      setExecError(err.message || "Execution failed");
    } finally {
      setExecutingId(null);
    }
  }, [connect, signMessage, walletAddress]);

  useEffect(() => {
    runScans();
  }, [runScans]);

  const liveCount = useMemo(() => arbs.filter((arb) => arb.decision === "CONFIRMED").length, [arbs]);
  const bestSpread = useMemo(() => (arbs.length > 0 ? Math.max(...arbs.map((arb) => Number(arb.spread) || 0)) : 0), [arbs]);
  const avgSpread = useMemo(() => {
    if (arbs.length === 0) return 0;
    return arbs.reduce((sum, arb) => sum + (Number(arb.spread) || 0), 0) / arbs.length;
  }, [arbs]);
  const secondsSinceScan = lastScanTime ? Math.floor((Date.now() - lastScanTime.getTime()) / 1000) : null;

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Arb Scanner</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
          {isScanning ? "Scanning live Polymarket/Kalshi/Manifold markets..." : `${liveCount} live opportunities detected`}
        </p>
      </div>

      <div style={s.statRow}>
        {[
          { l: "Live Opportunities", v: String(liveCount), c: "var(--green)" },
          { l: "Best Spread", v: bestSpread > 0 ? `${(bestSpread * 100).toFixed(0)}¢` : "—" },
          { l: "Avg Spread", v: avgSpread > 0 ? `${(avgSpread * 100).toFixed(0)}¢` : "—" },
          { l: "Last Scan", v: secondsSinceScan !== null ? `${secondsSinceScan}s` : "—" },
        ].map((item, index) => (
          <div key={index} className="sf-card-smooth" style={s.stat}>
            <div style={s.statL}>{item.l}</div>
            <div style={{ ...s.statV, color: item.c || "var(--text)" }}>{item.v}</div>
          </div>
        ))}
      </div>

      <div className="sf-card-smooth" style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {isScanning ? "Scanning markets..." : `${arbs.length} opportunities analyzed`}
          </div>
          <button style={s.scanBtn} onClick={runScans} disabled={isScanning}>
            {isScanning ? "Scanning..." : "Scan now"}
          </button>
        </div>

        {phantomInstalled === false && (
          <div style={s.notice}>Connect Phantom to sign mock trades.</div>
        )}
        {execStatus && (
          <div style={s.success}>{execStatus}</div>
        )}
        {execError && (
          <div style={s.error}>{execError}</div>
        )}

        {error && (
          <div style={s.error}>{error}</div>
        )}

        {!isScanning && arbs.length === 0 && !error && (
          <div style={s.empty}>No cross-platform opportunities found right now.</div>
        )}

        {arbs.map((arb) => (
          <div
            key={arb.id}
            className="sf-card-smooth"
            style={{
              ...s.arb,
              background: getDecisionStyles(arb.decision).cardBg,
              border: getDecisionStyles(arb.decision).cardBorder,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{arb.title}</div>
              <span
                style={{
                  ...s.decisionChip,
                  background: getDecisionStyles(arb.decision).chipBg,
                  color: getDecisionStyles(arb.decision).chipColor,
                }}
              >
                {arb.decision}
              </span>
            </div>

            <div style={s.platforms}>
              <div style={s.plat}>
                <div style={s.platN}>{arb.platforms?.[0]?.toUpperCase()}</div>
                <div style={s.platO}>{Number(arb.priceA).toFixed(2)}</div>
              </div>
              <div style={{ color: "var(--text-dim)" }}>→</div>
              <div style={s.plat}>
                <div style={s.platN}>{arb.platforms?.[1]?.toUpperCase()}</div>
                <div style={s.platO}>{Number(arb.priceB).toFixed(2)}</div>
              </div>
              <div style={{ ...s.plat, background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)" }}>
                <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>SPREAD</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--green)" }}>
                  {(Number(arb.spread || arb.rawSpread || 0) * 100).toFixed(0)}¢
                </div>
              </div>
            </div>

            <div style={s.summary}>{arb.summary || "No summary provided"}</div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Confidence: <b style={{ color: "var(--text)" }}>{((Number(arb.confidence) || 0) * 100).toFixed(0)}%</b>
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Urgency: <b style={{ color: "var(--text)" }}>{arb.urgency || "—"}</b>
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {arb.urlA && (
                  <a href={arb.urlA} target="_blank" rel="noopener noreferrer" style={s.linkBtn}>Open A ↗</a>
                )}
                {arb.urlB && (
                  <a href={arb.urlB} target="_blank" rel="noopener noreferrer" style={s.linkBtn}>Open B ↗</a>
                )}
                {arb.decision === "CONFIRMED" && (
                  <button
                    style={s.execBtn}
                    onClick={() => handleExecute(arb)}
                    disabled={executingId === arb.id}
                  >
                    {executingId === arb.id ? "Executing..." : "Execute (Mock)"}
                  </button>
                )}
              </div>
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
  scanBtn: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--blue)",
    cursor: "pointer",
  },
  execBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "none",
    background: "var(--green)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Outfit',sans-serif",
  },
  notice: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    color: "var(--text-dim)",
    fontSize: 12,
    marginBottom: 12,
    background: "var(--surface)",
  },
  success: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,196,140,0.2)",
    color: "var(--green)",
    fontSize: 12,
    marginBottom: 12,
    background: "var(--green-light)",
  },
  error: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,77,106,0.3)",
    color: "var(--red)",
    fontSize: 12,
    marginBottom: 12,
    background: "var(--red-light)",
  },
  empty: { padding: "24px", color: "var(--text-dim)", textAlign: "center", fontSize: 13 },
  arb: { borderRadius: 12, padding: "18px 20px", marginBottom: 12 },
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
  platforms: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  plat: {
    flex: 1,
    background: "var(--white)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    textAlign: "center",
  },
  platN: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 1, fontFamily: "'DM Mono',monospace" },
  platO: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)", marginTop: 2 },
  summary: { fontSize: 12, lineHeight: 1.4, color: "var(--text-mid)", marginBottom: 12 },
  linkBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    color: "var(--blue)",
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
    fontFamily: "'DM Mono',monospace",
    background: "var(--surface)",
  },
};
