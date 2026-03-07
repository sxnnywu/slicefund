import React, { useState } from "react";

const CHIPS = ["Trump markets", "AI regulation", "Fed cuts", "BTC $150k"];

export default function ThesisCard({ onAnalyze, loading }) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim() && !loading) onAnalyze(text.trim());
  };

  return (
    <div style={styles.card}>
      <div style={styles.shimmer} />
      <div style={styles.title}>
        <div style={styles.dot} />
        New Thesis
      </div>
      <textarea
        style={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your market view... e.g. 'Trump tariffs will hit Canadian auto exports hard'"
        rows={3}
        disabled={loading}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
      />
      <div style={styles.actions}>
        <div style={styles.chips}>
          {CHIPS.map((c) => (
            <span key={c} style={styles.chip} onClick={() => { setText(c); if (!loading) onAnalyze(c); }}>{c}</span>
          ))}
        </div>
        <button style={{ ...styles.btn, opacity: loading || !text.trim() ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading || !text.trim()}>
          {loading ? "⟳ Analyzing..." : "⌕ Analyze"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20,
    padding: "28px 32px", boxShadow: "var(--shadow)", marginBottom: 24, position: "relative", overflow: "hidden",
  },
  shimmer: {
    position: "absolute", top: 0, left: 0, right: 0, height: 3,
    background: "linear-gradient(90deg, var(--blue), var(--green), var(--blue))",
    backgroundSize: "200%", animation: "shimmer 3s linear infinite",
  },
  title: {
    fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-dim)",
    textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", animation: "blink 1.5s infinite",
  },
  textarea: {
    width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12,
    padding: "16px 18px", fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 500,
    color: "var(--text)", resize: "none", outline: "none", lineHeight: 1.5,
  },
  actions: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  chips: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: {
    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
    background: "var(--blue-light)", color: "var(--blue)", border: "1px solid rgba(26,92,255,0.15)",
    cursor: "pointer", fontFamily: "'DM Mono', monospace",
  },
  btn: {
    display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", background: "var(--blue)",
    color: "#fff", border: "none", borderRadius: 10, fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)",
    whiteSpace: "nowrap",
  },
};
