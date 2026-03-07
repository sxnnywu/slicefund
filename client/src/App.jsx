import React, { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import ThesisInput from "./components/ThesisInput.jsx";
import ResultsPanel from "./components/ResultsPanel.jsx";
import AgentStatus from "./components/AgentStatus.jsx";

export default function App() {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } = useAuth0();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [agentStep, setAgentStep] = useState(0);

  // Auth gate: show loading
  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.authLoadingCenter}>
          <p>Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Auth gate: show login if not authenticated
  if (!isAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.authCenter}>
          <div style={styles.authCard}>
            <h1 style={styles.authTitle}>Welcome to Slidefund</h1>
            <p style={styles.authSubtitle}>
              Sign in to analyze prediction market theses and opportunities.
            </p>
            <button
              onClick={() => loginWithRedirect()}
              style={styles.authButton}
            >
              Sign In with Auth0
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>◧</span> Backboard
          </div>
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            style={styles.logoutButton}
          >
            Logout
          </button>
        </div>
        <p style={styles.tagline}>
          Type your market thesis. Get ranked Polymarket picks instantly.
        </p>
        {user && (
          <p style={styles.userInfo}>
            Signed in as <strong>{user.email || user.name}</strong>
          </p>
        )}
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
  authLoadingCenter: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: 16,
    color: "var(--text-dim)",
  },
  authCenter: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  authCard: {
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 40,
    textAlign: "center",
    maxWidth: 400,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 12,
    letterSpacing: "-0.02em",
  },
  authSubtitle: {
    color: "var(--text-dim)",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 32,
  },
  authButton: {
    background: "var(--accent)",
    border: "none",
    borderRadius: 8,
    color: "var(--bg-primary)",
    fontSize: 16,
    fontWeight: 600,
    padding: "12px 24px",
    cursor: "pointer",
    transition: "opacity 0.2s ease",
  },
  logoutButton: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    fontSize: 13,
    padding: "6px 12px",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
  },
  userInfo: {
    color: "var(--text-dim)",
    fontSize: 12,
    marginTop: 12,
    marginBottom: 0,
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
import SignIn from "./pages/SignIn.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MeshBackground from "./components/MeshBackground.jsx";

export default function App() {
  const [page, setPage] = useState("signin");

  return (
    <>
      <MeshBackground />
      {page === "signin" ? (
        <SignIn onSignIn={() => setPage("dashboard")} />
      ) : (
        <Dashboard />
      )}
    </>
  );
}
