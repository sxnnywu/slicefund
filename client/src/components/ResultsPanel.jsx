import React, { useState } from "react";

function compactLine(text, maxChars = 96) {
  if (typeof text !== "string") return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function cleanAgentText(text) {
  if (typeof text !== "string") return "";

  return text
    .replace(/\r/g, "")
    .replace(/[*_`]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

function splitInlineItems(text) {
  return cleanAgentText(text)
    .split(/\s*[;•]\s*|\s+-\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSectionBlock(text, labelPattern) {
  const match = text.match(
    new RegExp(
      `(?:^|\\n)(?:${labelPattern})\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n(?:Quick Take|Key Drivers|Risks\\s*\\/\\s*Contradictions|Risks|Contradictions|Best Market Angles|Market Angles|Confidence)\\s*[:\\-]?|$)`,
      "i"
    )
  );

  const block = match?.[1];
  return typeof block === "string" ? block.trim() : "";
}

function toProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  if (numeric < 0 || numeric > 1) {
    return null;
  }

  return numeric;
}

function formatOdds(value) {
  const probability = toProbability(value);
  if (probability === null) return "—";
  return `${Math.round(probability * 100)}¢`;
}

function normalizeAgentAnalysis(rawContent) {
  if (typeof rawContent !== "string" || rawContent.trim().length === 0) {
    return null;
  }

  const cleaned = rawContent
    .replace(/\r/g, "")
    .replace(/[*_`]+/g, "")
    .replace(
      /(?:^|[\s.;])((?:Quick Take|Key Drivers|Risks\s*\/\s*Contradictions|Risks|Contradictions|Best Market Angles|Market Angles|Confidence))\s*:/gi,
      (match, label) => `\n${label}:`
    )
    .replace(
      /\n\s+(Quick Take|Key Drivers|Risks\s*\/\s*Contradictions|Risks|Contradictions|Best Market Angles|Market Angles|Confidence)\s*:/gi,
      "\n$1:"
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sections = {
    quickTake: "",
    keyDrivers: [],
    risks: [],
    angles: [],
    confidence: null,
  };

  const quickTakeBlock = extractSectionBlock(cleaned, "Quick Take");
  const keyDriversBlock = extractSectionBlock(cleaned, "Key Drivers");
  const risksBlock = extractSectionBlock(cleaned, "Risks\\s*\\/\\s*Contradictions|Risks|Contradictions");
  const anglesBlock = extractSectionBlock(cleaned, "Best Market Angles|Market Angles");
  const confidenceBlock = extractSectionBlock(cleaned, "Confidence");

  if (quickTakeBlock) {
    sections.quickTake = cleanAgentText(quickTakeBlock);
  }

  if (keyDriversBlock) {
    sections.keyDrivers = splitInlineItems(keyDriversBlock);
  }

  if (risksBlock) {
    sections.risks = splitInlineItems(risksBlock);
  }

  if (anglesBlock) {
    sections.angles = splitInlineItems(anglesBlock);
  }

  if (confidenceBlock) {
    const match = cleanAgentText(confidenceBlock).match(/(0(?:\.\d+)?|1(?:\.0+)?)|([0-9]{1,3})%/i);
    if (match) {
      if (match[2]) {
        sections.confidence = Math.max(0, Math.min(1, Number(match[2]) / 100));
      } else {
        sections.confidence = Math.max(0, Math.min(1, Number(match[1])));
      }
    }
  }

  if (!sections.quickTake) {
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/).find((sentence) => sentence.trim().length > 0);
    sections.quickTake = firstSentence ? firstSentence.trim() : cleaned.slice(0, 140);
  }

  sections.quickTake = compactLine(cleanAgentText(sections.quickTake), 120);
  sections.keyDrivers = [...new Set(sections.keyDrivers.map((item) => compactLine(cleanAgentText(item), 64)).filter(Boolean))].slice(0, 3);
  sections.risks = [...new Set(sections.risks.map((item) => compactLine(cleanAgentText(item), 64)).filter(Boolean))].slice(0, 2);
  sections.angles = [...new Set(sections.angles.map((item) => compactLine(cleanAgentText(item), 70)).filter(Boolean))].slice(0, 3);

  return sections;
}

export default function ResultsPanel({ data }) {
  const { thesis, keywords, totalMarketsFound, picks, agentAnalysis, thesisMapping } = data;
  const compactAgentAnalysis = normalizeAgentAnalysis(agentAnalysis?.content);
  const [expandedWhy, setExpandedWhy] = useState({});

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
      {compactAgentAnalysis && (
        <div style={styles.agentSection}>
          <div style={styles.agentHeader}>
            <div style={styles.agentTitle}>Thesis Researcher Agent</div>
            {typeof compactAgentAnalysis.confidence === "number" && (
              <div style={styles.agentConfidenceTop}>
                <span style={styles.agentConfidenceLabel}>Confidence</span>
                <span style={styles.agentConfidenceValue}>
                  {(compactAgentAnalysis.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
          <div style={styles.quickTakeRow}>
            <span style={styles.quickTakePill}>Quick Take</span>
            <span style={styles.quickTakeInline}>{compactAgentAnalysis.quickTake}</span>
          </div>

          <div style={styles.agentGrid}>
            {compactAgentAnalysis.keyDrivers.length > 0 && (
              <div style={styles.agentBlock}>
                <div style={styles.agentBlockTitle}>Key Drivers</div>
                <div style={styles.agentChips}>
                  {compactAgentAnalysis.keyDrivers.map((item, index) => (
                    <span key={`driver-${index}`} style={styles.agentChip}>{item}</span>
                  ))}
                </div>
              </div>
            )}

            {compactAgentAnalysis.risks.length > 0 && (
              <div style={styles.agentBlock}>
                <div style={styles.agentBlockTitle}>Risks / Contradictions</div>
                <div style={styles.agentChips}>
                  {compactAgentAnalysis.risks.map((item, index) => (
                    <span key={`risk-${index}`} style={styles.agentChipRisk}>{item}</span>
                  ))}
                </div>
              </div>
            )}

            {compactAgentAnalysis.angles.length > 0 && (
              <div style={styles.agentBlock}>
                <div style={styles.agentBlockTitle}>Best Market Angles</div>
                <div style={styles.agentChips}>
                  {compactAgentAnalysis.angles.map((item, index) => (
                    <span key={`angle-${index}`} style={styles.agentChipAngle}>{item}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      

      {picks.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>No relevant markets found.</div>
      ) : (
        <div>
          <div style={styles.sectionTitle}>Top Market Picks</div>
          {picks.map((pick, i) => {
            const pickKey = pick.id || i;
            const isYes = pick.suggested_position === "YES";
            const suggestedProb = toProbability(pick.current_price);
            const explicitYesProb = toProbability(pick.yes_odds);
            const explicitNoProb = toProbability(pick.no_odds);
            const whyText = typeof pick.one_liner === "string" ? pick.one_liner.trim() : "";
            const isWhyExpanded = Boolean(expandedWhy[pickKey]);
            const canExpandWhy = whyText.length > 96;
            const yesProb =
              explicitYesProb ??
              (isYes && suggestedProb !== null
                ? suggestedProb
                : !isYes && suggestedProb !== null
                  ? Math.max(0, Math.min(1, 1 - suggestedProb))
                  : null);
            const noProb =
              explicitNoProb ??
              (yesProb !== null
                ? Math.max(0, Math.min(1, 1 - yesProb))
                : !isYes && suggestedProb !== null
                  ? suggestedProb
                  : null);

            const yesOdds = formatOdds(yesProb);
            const noOdds = formatOdds(noProb);
            const selectedPrice = isYes ? yesOdds : noOdds;
            const scoreColor = pick.relevance_score >= 8 ? "var(--green)" : pick.relevance_score >= 5 ? "#FFB800" : "var(--text-dim)";
            const platform = pick.platform || 'Polymarket';
            return (
              <div key={pickKey} style={styles.row}>
                <div
                  style={{
                    ...styles.rank,
                    ...(pick.image
                      ? {
                          backgroundImage: `linear-gradient(rgba(11,17,38,0.58), rgba(11,17,38,0.58)), url(${pick.image})`,
                        }
                      : {}),
                  }}
                >
                  #{i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={styles.question}>{pick.question}</div>
                    <div style={{ ...styles.score, color: scoreColor }}>{pick.relevance_score}/10</div>
                  </div>
                  <div style={styles.whyRow}>
                    <span style={styles.whyLabel}>WHY</span>
                    <span style={isWhyExpanded ? styles.whyTextExpanded : styles.whyText}>
                      {isWhyExpanded ? whyText : compactLine(whyText, 96)}
                    </span>
                    {canExpandWhy && (
                      <button
                        type="button"
                        style={styles.whyToggle}
                        onClick={() =>
                          setExpandedWhy((prev) => ({
                            ...prev,
                            [pickKey]: !prev[pickKey],
                          }))
                        }
                      >
                        {isWhyExpanded ? "Less" : "More"}
                      </button>
                    )}
                  </div>
                  <div style={styles.bottomRow}>
                    <span style={styles.platformBadge}>{platform}</span>
                    <span style={styles.oddsGroup}>
                      <span style={styles.oddsLabel}>Odds</span>
                      <span style={styles.oddsYes}>YES {yesOdds}</span>
                      <span style={styles.oddsNo}>NO {noOdds}</span>
                    </span>
                    <span style={{
                      ...styles.position,
                      background: isYes ? "var(--green-light)" : "var(--red-light)",
                      color: isYes ? "var(--green)" : "var(--red)",
                    }}>
                      {pick.suggested_position} @ {selectedPrice}
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
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "var(--blue)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 13,
    flexShrink: 0,
    textShadow: "0 1px 6px rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 6px 16px rgba(11,17,38,0.14)",
  },
  question: { fontSize: 13, fontWeight: 600, lineHeight: 1.4, flex: 1 },
  score: { fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: "'DM Mono', monospace" },
  whyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "6px 0 8px",
  },
  whyLabel: {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'DM Mono', monospace",
    color: "var(--text-dim)",
    letterSpacing: 0.8,
  },
  whyText: {
    fontSize: 11,
    color: "var(--text-mid)",
    lineHeight: 1.3,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 99,
    padding: "3px 8px",
  },
  whyTextExpanded: {
    fontSize: 11,
    color: "var(--text-mid)",
    lineHeight: 1.5,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "8px 10px",
    flex: 1,
  },
  whyToggle: {
    border: "none",
    background: "transparent",
    color: "var(--blue)",
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'DM Mono', monospace",
    letterSpacing: 0.4,
    cursor: "pointer",
    padding: "2px 4px",
    flexShrink: 0,
  },
  bottomRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  oddsGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 4px",
    borderRadius: 99,
    border: "1px solid var(--border)",
    background: "var(--surface)",
  },
  oddsLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
    textTransform: "uppercase",
    padding: "0 4px",
  },
  oddsYes: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--green)",
    background: "var(--green-light)",
    borderRadius: 99,
    padding: "2px 7px",
    fontFamily: "'DM Mono', monospace",
  },
  oddsNo: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--red)",
    background: "var(--red-light)",
    borderRadius: 99,
    padding: "2px 7px",
    fontFamily: "'DM Mono', monospace",
  },
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
  agentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  agentTitle: { fontSize: 12, fontWeight: 700, color: "var(--blue)", letterSpacing: 0.5 },
  agentConfidenceTop: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "var(--surface)",
    border: "1px solid rgba(26,92,255,0.2)",
    boxShadow: "0 2px 8px rgba(26,92,255,0.06)",
  },
  agentConfidenceLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
  },
  agentConfidenceValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "var(--blue)",
    fontFamily: "'DM Mono', monospace",
  },
  quickTakeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "8px 10px",
    marginBottom: 10,
  },
  quickTakePill: {
    padding: "3px 7px",
    borderRadius: 99,
    background: "var(--blue-light)",
    border: "1px solid var(--border)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--blue)",
    fontFamily: "'DM Mono', monospace",
  },
  quickTakeInline: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
    lineHeight: 1.4,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  agentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  agentBlock: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  agentBlockTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    marginBottom: 6,
    fontFamily: "'DM Mono', monospace",
  },
  agentChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  agentChip: {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 99,
    background: "var(--blue-light)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    fontWeight: 600,
    lineHeight: 1.2,
  },
  agentChipRisk: {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 99,
    background: "var(--red-light)",
    color: "var(--red)",
    border: "1px solid rgba(255,77,106,0.25)",
    fontWeight: 600,
    lineHeight: 1.2,
  },
  agentChipAngle: {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 99,
    background: "var(--green-light)",
    color: "var(--green)",
    border: "1px solid rgba(0,196,140,0.25)",
    fontWeight: 600,
    lineHeight: 1.2,
  },
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
