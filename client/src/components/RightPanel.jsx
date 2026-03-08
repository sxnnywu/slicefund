import React, { useEffect, useMemo, useState } from "react";

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

function toCents(probability) {
  const normalized = toProbability(probability);
  if (normalized === null) return "—";
  return `${Math.round(normalized * 100)}¢`;
}

function tokenizeQuestion(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapScore(a, b) {
  const setA = new Set(tokenizeQuestion(a));
  const setB = new Set(tokenizeQuestion(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }

  return overlap / Math.max(1, Math.min(setA.size, setB.size));
}

function normalizeMarkets(platform, markets) {
  return (markets || [])
    .map((market) => {
      const price =
        platform === "Polymarket"
          ? parsePolymarketPrice(market.outcomePrices)
          : platform === "Kalshi"
            ? toProbability(market.yes_price)
            : toProbability(market.probability);

      if (price === null) return null;

      const url =
        platform === "Polymarket"
          ? (market.slug ? `https://polymarket.com/event/${market.slug}` : null)
          : platform === "Kalshi"
            ? (market.ticker ? `https://kalshi.com/markets/${market.ticker}` : null)
            : (market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null));

      return {
        id: market.id,
        platform,
        question: market.question,
        price,
        volume: Number(market.volume) || 0,
        url,
      };
    })
    .filter(Boolean);
}

export default function RightPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pulse, setPulse] = useState([]);
  const [bestSpread, setBestSpread] = useState(null);
  const [snapshot, setSnapshot] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
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
          throw new Error(polyJson?.error || kalshiJson?.error || manifoldJson?.error || "Failed to load right panel data");
        }

        const polyMarkets = normalizeMarkets("Polymarket", (polyJson.markets || []).slice(0, 8));
        const kalshiMarkets = normalizeMarkets("Kalshi", (kalshiJson.markets || []).slice(0, 8));
        const manifoldMarkets = normalizeMarkets("Manifold", (manifoldJson.markets || []).slice(0, 8));

        const mergedPulse = [...polyMarkets.slice(0, 2), ...kalshiMarkets.slice(0, 2), ...manifoldMarkets.slice(0, 2)]
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 5);
        setPulse(mergedPulse);

        const allMarkets = [...polyMarkets, ...kalshiMarkets, ...manifoldMarkets];
        let spreadCandidate = null;

        for (let i = 0; i < allMarkets.length; i += 1) {
          for (let j = i + 1; j < allMarkets.length; j += 1) {
            const left = allMarkets[i];
            const right = allMarkets[j];
            if (left.platform === right.platform) continue;

            const score = overlapScore(left.question, right.question);
            if (score < 0.45) continue;

            const spread = Math.abs(left.price - right.price);
            if (!spreadCandidate || spread > spreadCandidate.spread) {
              spreadCandidate = {
                question: left.question,
                left,
                right,
                spread,
              };
            }
          }
        }

        setBestSpread(spreadCandidate);

        const platformStats = [
          { name: "Polymarket", markets: polyMarkets },
          { name: "Kalshi", markets: kalshiMarkets },
          { name: "Manifold", markets: manifoldMarkets },
        ].map((entry) => {
          const avgPrice =
            entry.markets.length > 0
              ? entry.markets.reduce((sum, market) => sum + market.price, 0) / entry.markets.length
              : null;
          const totalVolume = entry.markets.reduce((sum, market) => sum + market.volume, 0);

          return {
            ...entry,
            count: entry.markets.length,
            avgPrice,
            totalVolume,
          };
        });

        setSnapshot(platformStats);
      } catch (loadError) {
        setError(loadError.message || "Failed to load right panel data");
        setPulse([]);
        setBestSpread(null);
        setSnapshot([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const spreadText = useMemo(() => {
    if (!bestSpread) return null;
    return `${Math.round(bestSpread.spread * 100)}¢`;
  }, [bestSpread]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Spread Watch</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace" }}>Live</div>
        </div>

        {loading && <div style={styles.empty}>Loading spread data...</div>}
        {!loading && error && <div style={styles.error}>{error}</div>}
        {!loading && !error && !bestSpread && <div style={styles.empty}>No strong cross-platform pair right now.</div>}

        {!loading && !error && bestSpread && (
          <div style={styles.arb}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.35 }}>{bestSpread.question}</div>
            <div style={styles.platforms}>
              <div style={styles.platform}>
                <div style={styles.platName}>{bestSpread.left.platform.toUpperCase()}</div>
                <div style={styles.platOdds}>{toCents(bestSpread.left.price)}</div>
              </div>
              <div style={{ fontSize: 18, color: "var(--text-dim)" }}>↔</div>
              <div style={styles.platform}>
                <div style={styles.platName}>{bestSpread.right.platform.toUpperCase()}</div>
                <div style={styles.platOdds}>{toCents(bestSpread.right.price)}</div>
              </div>
            </div>
            <div style={styles.spreadRow}>
              <div>
                <div style={styles.spreadLabel}>SPREAD</div>
                <div style={styles.spreadValue}>{spreadText}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {bestSpread.left.url && (
                  <a href={bestSpread.left.url} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>Open A ↗</a>
                )}
                {bestSpread.right.url && (
                  <a href={bestSpread.right.url} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>Open B ↗</a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Market Pulse</div>
        {loading && <div style={styles.empty}>Loading pulse...</div>}
        {!loading && !error && pulse.length === 0 && <div style={styles.empty}>No pulse data.</div>}
        {!loading && !error && pulse.map((market) => (
          <a key={`${market.platform}-${market.id}`} href={market.url || "#"} target="_blank" rel="noopener noreferrer" style={styles.pulseItem}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.pulseName}>{market.question}</div>
              <div style={styles.pulseMeta}>{market.platform.toUpperCase()} · VOL {market.volume.toLocaleString()}</div>
            </div>
            <div style={styles.pulsePrice}>{toCents(market.price)}</div>
          </a>
        ))}
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Platform Snapshot</div>
        {loading && <div style={styles.empty}>Loading snapshot...</div>}
        {!loading && !error && snapshot.map((entry) => (
          <div key={entry.name} style={styles.snapshotRow}>
            <div>
              <div style={styles.snapshotName}>{entry.name}</div>
              <div style={styles.snapshotMeta}>{entry.count} markets · VOL {entry.totalVolume.toLocaleString()}</div>
            </div>
            <div style={styles.snapshotValue}>{toCents(entry.avgPrice)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "20px 22px",
    boxShadow: "var(--shadow)",
  },
  empty: { fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 14 },
  error: {
    fontSize: 12,
    color: "var(--red)",
    border: "1px solid rgba(255,77,106,0.3)",
    background: "var(--red-light)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  arb: {
    background: "linear-gradient(135deg, rgba(26,92,255,0.06), rgba(0,196,140,0.06))",
    border: "1px solid rgba(26,92,255,0.2)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  platforms: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  platform: { flex: 1, background: "var(--white)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 8px", textAlign: "center" },
  platName: { fontSize: 10, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 1, fontFamily: "'DM Mono', monospace" },
  platOdds: { fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, color: "var(--blue)", marginTop: 2 },
  spreadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  spreadLabel: { fontSize: 10, color: "rgba(0,196,140,0.7)", letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" },
  spreadValue: { fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: "var(--green)" },
  linkBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    color: "var(--blue)",
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
    fontFamily: "'DM Mono', monospace",
    background: "var(--surface)",
  },
  pulseItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "11px 0",
    borderBottom: "1px solid var(--border2)",
    textDecoration: "none",
  },
  pulseName: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 210,
  },
  pulseMeta: { fontSize: 10, color: "var(--text-dim)", marginTop: 2, fontFamily: "'DM Mono', monospace" },
  pulsePrice: { fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--blue)" },
  snapshotRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "11px 0",
    borderBottom: "1px solid var(--border2)",
  },
  snapshotName: { fontSize: 12, fontWeight: 600 },
  snapshotMeta: { fontSize: 10, color: "var(--text-dim)", marginTop: 2, fontFamily: "'DM Mono', monospace" },
  snapshotValue: { fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--blue)" },
};
