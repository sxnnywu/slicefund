import React, { useState } from "react";
import ThesisInput from "./components/ThesisInput.jsx";
import ResultsPanel from "./components/ResultsPanel.jsx";
import AgentStatus from "./components/AgentStatus.jsx";

export default function App() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [agentStep, setAgentStep] = useState(0);

  const analyze = async (thesis) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setAgentStep(1);

    // Simulate agent steps with slight delays for UX
    const stepTimer1 = setTimeout(() => setAgentStep(2), 1500);
    const stepTimer2 = setTimeout(() => setAgentStep(3), 3500);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis }),
      });
      if (!res.ok) {
        let msg = "Request failed";
        try {
          const data = await res.json();
          msg = data.details || data.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      const data = await res.json();
      setResults(data);
      setAgentStep(4);
    } catch (err) {
      setError(err.message);
      setAgentStep(0);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◧</span> Backboard
        </div>
        <p style={styles.tagline}>
          Type your market thesis. Get ranked Polymarket picks instantly.
        </p>
      </header>

      <main style={styles.main}>
        <ThesisInput onSubmit={analyze} loading={loading} />

        {loading && <AgentStatus step={agentStep} />}

        {error && (
          <div style={styles.error}>
            <span>⚠️</span> {error}
          </div>
        )}

        {results && <ResultsPanel data={results} />}
      </main>

      <footer style={styles.footer}>
        Prediction markets involve risk. This is not financial advice.
      </footer>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "40px 20px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    textAlign: "center",
    marginBottom: 48,
  },
  logo: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  },
  logoIcon: {
    color: "var(--accent)",
    marginRight: 8,
  },
  tagline: {
    color: "var(--text-dim)",
    fontSize: 16,
    maxWidth: 500,
    margin: "0 auto",
  },
  main: {
    flex: 1,
  },
  error: {
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.3)",
    borderRadius: 12,
    padding: "16px 20px",
    marginTop: 24,
    color: "var(--red)",
    fontSize: 14,
  },
  footer: {
    textAlign: "center",
    color: "var(--text-dim)",
    fontSize: 12,
    marginTop: 60,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  },
};
