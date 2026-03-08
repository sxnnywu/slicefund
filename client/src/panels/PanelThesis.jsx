import React from "react";
import ThesisCard from "../components/ThesisCard.jsx";
import ResultsPanel from "../components/ResultsPanel.jsx";
import PastSearches from "../components/PastSearches.jsx";

export default function PanelThesis({ onAnalyze, loading, error, results, searches, progress }) {
  return (
    <>
      <div style={s.topbar}><div><h2 style={{ fontSize: 24, fontWeight: 700 }}>Thesis Search</h2><p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Enter a market view and get ranked prediction markets</p></div></div>
      <ThesisCard onAnalyze={onAnalyze} loading={loading} progress={progress} />
      {error && <div style={s.error}>⚠️ {error}</div>}
      {results && <ResultsPanel data={results} />}
      <PastSearches searches={searches} />
    </>
  );
}
const s = {
  topbar: { marginBottom: 36 },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
};
