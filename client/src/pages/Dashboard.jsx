import React, { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Sidebar from "../components/Sidebar.jsx";
import ThesisCard from "../components/ThesisCard.jsx";
import ActiveMarkets from "../components/ActiveMarkets.jsx";
import PastSearches from "../components/PastSearches.jsx";
import RightPanel from "../components/RightPanel.jsx";
import ResultsPanel from "../components/ResultsPanel.jsx";
import PanelThesis from "../panels/PanelThesis.jsx";
import PanelBaskets from "../panels/PanelBaskets.jsx";
import PanelMarkets from "../panels/PanelMarkets.jsx";
import PanelArb from "../panels/PanelArb.jsx";
import PanelIndex from "../panels/PanelIndex.jsx";
import PanelCards from "../panels/PanelCards.jsx";
import PanelPolymarket from "../panels/PanelPolymarket.jsx";
import PanelProfile from "../panels/PanelProfile.jsx";
import WalletConnect from "../components/WalletConnect.jsx";

const SEARCH_HISTORY_KEY = "slicefund_thesis_history";

function loadStoredSearches() {
  if (typeof window === "undefined") return [];

  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((entry) => entry && typeof entry === "object" && typeof entry.thesis === "string")
      .map((entry) => ({
        thesis: entry.thesis,
        picks: Number.isFinite(Number(entry.picks)) ? Number(entry.picks) : 0,
        avgOdds: typeof entry.avgOdds === "string" ? entry.avgOdds : "—",
        volume: Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : 0,
        time: typeof entry.time === "string" ? entry.time : "Earlier",
      }))
      .slice(0, 25);
  } catch (error) {
    console.error("Failed to load thesis history:", error);
    return [];
  }
}

export default function Dashboard() {
  const { user } = useAuth0();
  const [panel, setPanel] = useState("home");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searches, setSearches] = useState(() => loadStoredSearches());

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searches.slice(0, 25)));
    } catch (saveError) {
      console.error("Failed to persist thesis history:", saveError);
    }
  }, [searches]);

  const rawFirstName =
    user?.given_name ||
    user?.name?.trim()?.split(/\s+/)?.[0] ||
    user?.nickname ||
    (user?.email ? user.email.split("@")[0] : null);
  const firstName = rawFirstName
    ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
    : "there";

  const analyze = async (thesis) => {
    setLoading(true);
    setError(null);
    setResults(null);

    const history = searches
      .map((entry) => entry?.thesis)
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .slice(0, 10);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis, history }),
      });
      if (!res.ok) {
        let msg = "Request failed";
        try { const d = await res.json(); msg = d.details || d.error || msg; } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      setResults(data);
      setSearches((prev) => [
        {
          thesis,
          picks: data.picks.length,
          avgOdds: data.picks.length > 0
            ? (data.picks.reduce((s, p) => s + (parseFloat(p.current_price) || 0), 0) / data.picks.length).toFixed(2)
            : "—",
          volume: data.picks.reduce((s, p) => s + (Number(p.volume) || 0), 0),
          time: "Just now",
        },
        ...prev.filter((entry) => entry?.thesis !== thesis),
      ].slice(0, 10));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderPanel = () => {
    switch (panel) {
      case "thesis":
        return <PanelThesis onAnalyze={analyze} loading={loading} error={error} results={results} searches={searches} />;
      case "polymarket":
        return <PanelPolymarket />;
      case "baskets":
        return <PanelBaskets />;
      case "markets":
        return <PanelMarkets />;
      case "arb":
        return <PanelArb />;
      case "index":
        return <PanelIndex />;
      case "cards":
        return <PanelCards />;
      case "profile":
        return <PanelProfile />;
      default:
        return (
          <>
            <div style={styles.topbar}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Hello, {firstName} 👋</h2>
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
                  {results ? `${results.picks.length} picks found` : "3 arb opportunities detected · Markets are active"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button className="sf-btn-smooth" style={styles.topBtn} onClick={() => setPanel("arb")}>🔔 Alerts <span style={styles.badge}>3</span></button>
                <button className="sf-btn-smooth" style={styles.topBtnPrimary} onClick={() => setPanel("thesis")}>+ New Thesis</button>
                <WalletConnect />
              </div>
            </div>
            <div style={styles.statRow}>
              {[
                { label: "Active Baskets", value: "7", delta: "↑ 2 this week", color: "var(--green)" },
                { label: "Avg Basket Yield", value: "+14.2%", delta: "↑ 2.1% vs last month", color: "var(--green)" },
                { label: "Arb Opportunities", value: "3", delta: "↑ Live now", color: "var(--green)" },
                { label: "Searches Made", value: String(searches.length || 24), delta: "All time", color: "var(--text-dim)" },
              ].map((s, i) => (
                <div key={i} className="sf-card-smooth" style={styles.statCard}>
                  <div style={styles.statLabel}>{s.label}</div>
                  <div style={styles.statValue}>{s.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: s.color }}>{s.delta}</div>
                </div>
              ))}
            </div>
            <div style={styles.grid}>
              <div>
                <ThesisCard onAnalyze={analyze} loading={loading} />
                {error && <div style={styles.error}>⚠️ {error}</div>}
                {results && <ResultsPanel data={results} />}
                <ActiveMarkets />
                <PastSearches searches={searches} />
              </div>
              <RightPanel />
            </div>
          </>
        );
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <Sidebar activePanel={panel} onNavigate={setPanel} />
      <div style={styles.main}>
        <div key={panel} className="sf-panel-transition">{renderPanel()}</div>
      </div>
    </div>
  );
}

const styles = {
  main: { flex: 1, overflowY: "auto", padding: "40px 40px", position: "relative", zIndex: 1 },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  topBtn: {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer",
  },
  topBtnPrimary: {
    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    border: "1px solid var(--blue)", background: "var(--blue)", fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)",
  },
  badge: { background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 50, marginLeft: 2 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 },
  statCard: { background: "var(--surface)", backdropFilter: "blur(16px)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statLabel: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statValue: { fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 500, color: "var(--text)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
};
