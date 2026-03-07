import React from "react";
import MarketCard from "./MarketCard.jsx";

export default function ResultsPanel({ data }) {
  const { thesis, keywords, totalMarketsFound, picks } = data;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={styles.meta}>
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Thesis:</span>
          <span>"{thesis}"</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Keywords:</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {keywords.map((k) => (
              <span key={k} style={styles.chip}>{k}</span>
            ))}
          </span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>Markets scanned:</span>
          <span>{totalMarketsFound}</span>
        </div>
      </div>

      {picks.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>
          No relevant markets found. Try a different thesis.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            Top {picks.length} Polymarket Picks
          </h3>
          {picks.map((pick, i) => (
            <MarketCard key={pick.id || i} pick={pick} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  meta: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 24,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 13,
  },
  metaLabel: {
    color: "var(--text-dim)",
    minWidth: 120,
    flexShrink: 0,
  },
  chip: {
    background: "rgba(108,92,231,0.15)",
    color: "var(--accent)",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 12,
  },
};
