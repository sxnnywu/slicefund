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

function getConfidenceStyles(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) {
    return {
      background: "var(--surface)",
      borderColor: "rgba(26,92,255,0.2)",
      labelColor: "var(--text-dim)",
      valueColor: "var(--blue)",
      shadow: "0 2px 8px rgba(26,92,255,0.06)",
    };
  }

  if (value >= 0.75) {
    return {
      background: "rgba(0,196,140,0.1)",
      borderColor: "rgba(0,196,140,0.28)",
      labelColor: "rgba(0,124,90,0.9)",
      valueColor: "var(--green)",
      shadow: "0 4px 14px rgba(0,196,140,0.14)",
    };
  }

  if (value >= 0.5) {
    return {
      background: "rgba(255,184,0,0.12)",
      borderColor: "rgba(255,184,0,0.26)",
      labelColor: "#9A6B00",
      valueColor: "#C88700",
      shadow: "0 4px 14px rgba(255,184,0,0.14)",
    };
  }

  return {
    background: "rgba(255,77,106,0.1)",
    borderColor: "rgba(255,77,106,0.24)",
    labelColor: "#B23A54",
    valueColor: "var(--red)",
    shadow: "0 4px 14px rgba(255,77,106,0.12)",
  };
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
  sections.keyDrivers = [...new Set(sections.keyDrivers.map((item) => compactLine(cleanAgentText(item), 64)).filter(Boolean))].slice(0, 2);
  sections.risks = [...new Set(sections.risks.map((item) => compactLine(cleanAgentText(item), 64)).filter(Boolean))].slice(0, 2);
  sections.angles = [...new Set(sections.angles.map((item) => compactLine(cleanAgentText(item), 70)).filter(Boolean))].slice(0, 2);

  return sections;
}

export default function ResultsPanel({ data, onCreateBasket }) {
  const { thesis, keywords, totalMarketsFound, picks, agentAnalysis, thesisMapping } = data;
  const compactAgentAnalysis = normalizeAgentAnalysis(agentAnalysis?.content);
  const [expandedWhy, setExpandedWhy] = useState({});
  const confidenceStyles =
    typeof compactAgentAnalysis?.confidence === "number"
      ? getConfidenceStyles(compactAgentAnalysis.confidence)
      : null;

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
          </div>

          <div style={styles.agentHybridGrid}>
            {compactAgentAnalysis.keyDrivers.length > 0 && (
              <div style={styles.influencePanel}>
                <div style={styles.agentBlockTitle}>Key Drivers</div>
                <div style={styles.influenceNodes}>
                  {compactAgentAnalysis.keyDrivers.map((item, index) => (
                    <div key={`driver-${index}`} style={styles.influenceNode}>
                      <span style={styles.influenceDot} />
                      <span style={styles.influenceText}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.thesisCenterCard}>
              <div style={styles.thesisCenterTopRow}>
                <div style={styles.thesisCenterLabel}>Current Thesis</div>
                {typeof compactAgentAnalysis.confidence === "number" && (
                  <div
                    style={{
                      ...styles.agentConfidenceInline,
                      background: confidenceStyles.background,
                      borderColor: confidenceStyles.borderColor,
                      boxShadow: confidenceStyles.shadow,
                    }}
                  >
                    <span style={{ ...styles.agentConfidenceLabel, color: confidenceStyles.labelColor }}>
                      Confidence
                    </span>
                    <span style={{ ...styles.agentConfidenceValue, color: confidenceStyles.valueColor }}>
                      {(compactAgentAnalysis.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
              <div style={styles.thesisCenterValue}>{compactAgentAnalysis.quickTake}</div>
              <div style={styles.thesisCenterMeter}>
                <div style={styles.thesisCenterMeterFill} />
              </div>
              <div style={styles.thesisCenterMeta}>
                <span>Support vs risk</span>
              </div>
            </div>

            {compactAgentAnalysis.risks.length > 0 && (
              <div style={styles.influencePanel}>
                <div style={styles.agentBlockTitle}>Risks / Contradictions</div>
                <div style={styles.influenceNodes}>
                  {compactAgentAnalysis.risks.map((item, index) => (
                    <div key={`risk-${index}`} style={styles.influenceNodeRisk}>
                      <span style={styles.influenceDotRisk} />
                      <span style={styles.influenceTextRisk}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {compactAgentAnalysis.angles.length > 0 && (
            <div style={styles.strategyRail}>
              <div style={styles.agentBlockTitle}>Best Market Angles</div>
              <div style={styles.strategyGrid}>
                {compactAgentAnalysis.angles.map((item, index) => (
                  <div key={`angle-${index}`} style={styles.strategyCard}>
                    <div style={styles.strategyIndex}>0{index + 1}</div>
                    <div style={styles.strategyText}>{item}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      

      {picks.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>No relevant markets found.</div>
      ) : (
        <div>
          {data?.thesisMapping?.markets && data.thesisMapping.markets.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => {
                  console.log("[CreateBasket] Button clicked");
                  const basketData = {
                    name: `${data.thesis.slice(0, 40)}${data.thesis.length > 40 ? '...' : ''}`,
                    markets: data.thesisMapping.markets.map(m => ({
                      market: m.question,
                      platform: m.platform,
                      target_weight: 1 / (data.thesisMapping.markets.length || 1),
                      current_weight: toProbability(m.probability) || 0.5,
                    })),
                  };
                  console.log("[CreateBasket] Basket data:", basketData);
                  console.log("[CreateBasket] Callback exists:", !!onCreateBasket);
                  if (onCreateBasket) {
                    onCreateBasket(basketData);
                  } else {
                    console.warn("[CreateBasket] No onCreateBasket callback provided");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "var(--green)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => e.target.style.opacity = "0.9"}
                onMouseOut={(e) => e.target.style.opacity = "1"}
              >
                Create Basket from These Markets
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--red-light)", borderRadius: 10, color: "var(--text-dim)", fontSize: 12 }}>
              No cross-platform market mapping available
            </div>
          )}
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
  agentConfidenceInline: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
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
  agentHybridGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  influencePanel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "12px 12px 10px",
  },
  influenceNodes: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  influenceNode: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    background: "rgba(26,92,255,0.06)",
    border: "1px solid rgba(26,92,255,0.1)",
  },
  influenceNodeRisk: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    background: "rgba(255,77,106,0.08)",
    border: "1px solid rgba(255,77,106,0.12)",
  },
  influenceDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "var(--blue)",
    boxShadow: "0 0 0 4px rgba(26,92,255,0.12)",
    marginTop: 5,
    flexShrink: 0,
  },
  influenceDotRisk: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "var(--red)",
    boxShadow: "0 0 0 4px rgba(255,77,106,0.12)",
    marginTop: 5,
    flexShrink: 0,
  },
  influenceText: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "var(--text)",
  },
  influenceTextRisk: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "var(--red)",
  },
  thesisCenterCard: {
    borderRadius: 16,
    border: "1px solid rgba(26,92,255,0.16)",
    background: "var(--surface)",
    padding: "18px 16px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minHeight: 128,
  },
  thesisCenterLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
    marginBottom: 8,
  },
  thesisCenterTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  thesisCenterValue: {
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.4,
    color: "var(--text)",
  },
  thesisCenterMeter: {
    position: "relative",
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(90deg, rgba(26,92,255,0.18), rgba(255,77,106,0.14))",
    overflow: "hidden",
    marginTop: 16,
  },
  thesisCenterMeterFill: {
    width: "58%",
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, var(--blue), #5f8dff)",
  },
  thesisCenterMeta: {
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 10,
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
  strategyRail: {
    marginTop: 12,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "14px",
  },
  strategyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  strategyCard: {
    minHeight: 88,
    borderRadius: 14,
    padding: "12px 12px 14px",
    background: "var(--surface)",
    border: "1px solid rgba(0,196,140,0.16)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  strategyIndex: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: "var(--green)",
    fontFamily: "'DM Mono', monospace",
  },
  strategyText: {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.4,
    color: "var(--text)",
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
