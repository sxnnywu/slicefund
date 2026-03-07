import React from "react";

export default function PastSearches({ searches = [] }) {
  if (searches.length === 0) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Past Searches</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: 40 }}>
          No search history yet. Start by analyzing a thesis above.
        </div>
      </div>
    );
  }

  const items = searches;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Past Searches</div>
        <div style={styles.action}>Clear history</div>
      </div>
      {items.map((s, i) => (
        <div key={i} style={styles.row}>
          <div style={styles.num}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ flex: 1 }}>
            <div style={styles.thesis}>"{s.thesis}"</div>
            <div style={styles.pills}>
              <span style={styles.pillBlue}>{s.picks} markets</span>
              <span style={styles.pillGreen}>{s.avgOdds} avg odds</span>
              <span style={styles.pillBlue}>${(s.volume / 1000).toFixed(0)}K vol</span>
            </div>
          </div>
          <div style={styles.time}>{s.time}</div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono', monospace" },
  row: { display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", borderRadius: 8, margin: "0 -8px" },
  num: { fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-dim)", width: 20, flexShrink: 0, paddingTop: 2 },
  thesis: { fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 },
  pills: { display: "flex", gap: 6, flexWrap: "wrap" },
  pillBlue: { fontSize: 10, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontWeight: 500, background: "var(--blue-light)", color: "var(--blue)" },
  pillGreen: { fontSize: 10, padding: "2px 8px", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontWeight: 500, background: "var(--green-light)", color: "var(--green)" },
  time: { fontSize: 11, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace", flexShrink: 0, paddingTop: 2 },
};
