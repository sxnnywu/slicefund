import React from "react";

export default function ResultsPanel({ data }) {
  const { thesis, keywords, totalMarketsFound, picks, agentAnalysis, thesisMapping } = data;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.title}>Analysis Results</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace" }}>
          {totalMarketsFound} scanned · {picks.length} matched
        </div>
      </div>

      <div style={styles.keywords}>
        {keywords.map((k) => (
          <span key={k} style={styles.keyword}>{k}</span>
        ))}
      </div>

      {/* Agent Analysis Section */}
      {agentAnalysis?.content && (
        <div style={styles.agentSection}>
          <div style={styles.agentTitle}>🤖 ThesisResearcher Agent</div>
          <div style={styles.agentContent}>{agentAnalysis.content}</div>
        </div>
      )}

      {/* Thesis Mapping Section */}
      {thesisMapping?.markets && thesisMapping.markets.length > 0 && (
        <div style={styles.mappingSection}>
          <div style={styles.sectionTitle}>
            📊 Cross-Platform Markets (Confidence: {(thesisMapping.confidence_score * 100).toFixed(0)}%)
          </div>
          <div style={styles.mappingGrid}>
            {thesisMapping.markets.map((m, i) => (
              <div key={i} style={styles.mappingCard}>
                <div style={styles.platform}>{m.platform}</div>
                <div style={styles.mappingQuestion}>{m.question}</div>
                {m.estimated_probability && (
                  <div style={styles.probability}>
                    Estimated: {(m.estimated_probability * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {picks.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>No relevant markets found.</div>
      ) : (
        <div>
          <div style={styles.sectionTitle}>🎯 Top Market Picks</div>
          {picks.map((pick, i) => {
            const isYes = pick.suggested_position === "YES";
            const priceNum = parseFloat(pick.current_price);
            const price = !isNaN(priceNum) ? `${(priceNum < 1 ? priceNum * 100 : priceNum).toFixed(0)}¢` : "—";
            const scoreColor = pick.relevance_score >= 8 ? "var(--green)" : pick.relevance_score >= 5 ? "#FFB800" : "var(--text-dim)";
            const platform = pick.platform || 'Polymarket';
            return (
              <div key={pick.id || i} style={styles.row}>
                <div style={styles.rank}>#{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={styles.question}>{pick.question}</div>
                    <div style={{ ...styles.score, color: scoreColor }}>{pick.relevance_score}/10</div>
                  </div>
                  <p style={styles.oneLiner}>{pick.one_liner}</p>
                  <div style={styles.bottomRow}>
                    <span style={styles.platformBadge}>{platform}</span>
                    <span style={{
                      ...styles.position,
                      background: isYes ? "var(--green-light)" : "var(--red-light)",
                      color: isYes ? "var(--green)" : "var(--red)",
                    }}>
                      {pick.suggested_position} @ {price}
                    </span>
                    {pick.volume && <span style={styles.vol}>Vol: ${Number(pick.volume).toLocaleString()}</span>}
                    {pick.marketUrl && (
                      <a href={pick.marketUrl} target="_blank" rel="noopener noreferrer" style={styles.link}>
                        View Market ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20,
    padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700 },
  keywords: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 },
  keyword: {
    fontSize: 11, padding: "3px 10px", borderRadius: 6, fontFamily: "'DM Mono', monospace",
    background: "var(--blue-light)", color: "var(--blue)", fontWeight: 500,
  },
  row: {
    display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--border2)",
  },
  rank: {
    width: 32, height: 32, borderRadius: 8, background: "var(--blue)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0,
  },
  question: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, flex: 1 },
  score: { fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: "'DM Mono', monospace" },
  oneLiner: { fontSize: 12, color: "var(--text-mid)", lineHeight: 1.5, fontStyle: "italic", margin: "6px 0 8px" },
  bottomRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  platformBadge: { 
    fontSize: 10, 
    padding: "3px 8px", 
    borderRadius: 4, 
    fontFamily: "'DM Mono', monospace", 
    fontWeight: 600, 
    background: "var(--blue-light)", 
    color: "var(--blue)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  position: { padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace" },
  vol: { color: "var(--text-dim)", fontSize: 11, fontFamily: "'DM Mono', monospace" },
  link: { color: "var(--blue)", fontSize: 11, textDecoration: "none", marginLeft: "auto", fontWeight: 600 },
  agentSection: {
    background: "var(--blue-light)", border: "1px solid rgba(26,92,255,0.2)", borderRadius: 12,
    padding: "16px 18px", marginBottom: 20,
  },
  agentTitle: { fontSize: 12, fontWeight: 700, color: "var(--blue)", marginBottom: 10, letterSpacing: 0.5 },
  agentContent: { fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  mappingSection: {
    background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)", borderRadius: 12,
    padding: "16px 18px", marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 12, letterSpacing: 0.5,
  },
  mappingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 },
  mappingCard: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px",
  },
  platform: {
    fontSize: 10, fontWeight: 700, color: "var(--blue)", letterSpacing: 1, textTransform: "uppercase",
    marginBottom: 6, fontFamily: "'DM Mono', monospace",
  },
  mappingQuestion: { fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 6 },
  probability: { fontSize: 11, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace" },
};
