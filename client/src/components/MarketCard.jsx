import React from "react";

export default function MarketCard({ pick, rank }) {
  const isYes = pick.suggested_position === "YES";
  const priceNum = parseFloat(pick.current_price);
  const priceDisplay = !isNaN(priceNum)
    ? `${(priceNum < 1 ? priceNum * 100 : priceNum).toFixed(0)}¢`
    : pick.current_price || "—";

  const scoreColor =
    pick.relevance_score >= 8 ? "var(--green)" : pick.relevance_score >= 5 ? "var(--yellow)" : "var(--text-dim)";

  return (
    <div style={styles.card}>
      <div style={styles.rankBadge}>#{rank}</div>
      <div style={styles.content}>
        <div style={styles.topRow}>
          <h4 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>
            {pick.question}
          </h4>
          <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor, flexShrink: 0 }}>
            {pick.relevance_score}/10
          </div>
        </div>

        <p style={styles.oneLiner}>{pick.one_liner}</p>

        <div style={styles.bottomRow}>
          <div
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: isYes ? "rgba(0,214,143,0.12)" : "rgba(255,107,107,0.12)",
              color: isYes ? "var(--green)" : "var(--red)",
            }}
          >
            {pick.suggested_position} @ {priceDisplay}
          </div>

          {pick.volume && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              Vol: ${Number(pick.volume).toLocaleString()}
            </span>
          )}

          {pick.polymarketUrl && (
            <a
              href={pick.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontSize: 12, textDecoration: "none", marginLeft: "auto" }}
            >
              View on Polymarket ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 20,
    display: "flex",
    gap: 16,
  },
  rankBadge: {
    background: "var(--accent)",
    color: "#fff",
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  oneLiner: {
    fontSize: 13,
    color: "var(--text-dim)",
    lineHeight: 1.5,
    fontStyle: "italic",
  },
  bottomRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
};
