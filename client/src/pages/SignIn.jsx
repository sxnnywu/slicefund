import React from "react";

export default function SignIn({ onSignIn }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSignIn();
  };

  const handleAuthClick = (e) => {
    e.preventDefault();
    onSignIn();
  };

  return (
    <div style={styles.page}>
      <div style={{ ...styles.float, top: "28%", left: "8%", animationDelay: "0.2s" }}>
        <div style={styles.floatLabel}>Active Markets</div>
        <div style={styles.floatValue}>12,847</div>
        <div style={styles.floatSub}>Polymarket + Kalshi</div>
      </div>
      <div style={{ ...styles.float, bottom: "28%", right: "8%", animationDelay: "0.4s" }}>
        <div style={styles.floatLabel}>Arb Spread Found</div>
        <div style={{ ...styles.floatValue, color: "var(--green)" }}>19¢</div>
        <div style={styles.floatSub}>Fed rate cut · Just now</div>
      </div>

      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 style={styles.logoText}>BACKBOARD</h1>
          <p style={styles.logoSub}>Prediction Market Intelligence</p>
        </div>

        <button type="button" style={styles.socialBtn} onClick={handleAuthClick}>
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button type="button" style={styles.socialBtn} onClick={handleAuthClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--text)"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
          Continue with GitHub
        </button>

        <div style={styles.divider}><span>or sign in with email</span></div>

        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" placeholder="you@example.com" />
        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" placeholder="••••••••" />

        <button type="submit" style={styles.primaryBtn}>Sign In →</button>
        <div style={styles.footer}>Don't have an account? <a href="#" style={styles.link} onClick={handleAuthClick}>Sign up free</a></div>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1,
  },
  float: {
    position: "absolute", zIndex: 1, background: "var(--surface)", backdropFilter: "blur(16px)",
    border: "1px solid var(--border)", borderRadius: 16, padding: "14px 20px", boxShadow: "var(--shadow)",
    animation: "fadeUp 0.6s ease both",
  },
  floatLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 2, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 4 },
  floatValue: { fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: "var(--blue)" },
  floatSub: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  card: {
    position: "relative", zIndex: 1, width: 440, background: "var(--surface)", backdropFilter: "blur(24px)",
    border: "1px solid var(--border)", borderRadius: 28, padding: 48,
    boxShadow: "var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.8)", animation: "fadeUp 0.5s ease both",
  },
  logoWrap: { textAlign: "center", marginBottom: 36 },
  logoMark: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52,
    background: "linear-gradient(135deg, var(--blue), #6A9FFF)", borderRadius: 16, marginBottom: 14,
    boxShadow: "0 8px 24px rgba(26,92,255,0.3)",
  },
  logoText: { fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "var(--text)" },
  logoSub: { fontSize: 13, color: "var(--text-dim)", marginTop: 4 },
  socialBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    padding: 13, borderRadius: 12, border: "1px solid var(--border)", background: "var(--white)",
    fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)",
    cursor: "pointer", marginBottom: 10, boxShadow: "0 2px 8px rgba(26,92,255,0.04)",
  },
  divider: {
    display: "flex", alignItems: "center", gap: 12, margin: "24px 0", color: "var(--text-dim)", fontSize: 12, fontWeight: 500,
    textAlign: "center",
  },
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6, display: "block", letterSpacing: 0.3 },
  input: {
    width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--white)", fontFamily: "'Outfit', sans-serif", fontSize: 14, color: "var(--text)",
    outline: "none", marginBottom: 14,
  },
  primaryBtn: {
    width: "100%", padding: 14, borderRadius: 12, border: "none",
    background: "linear-gradient(135deg, var(--blue), #4A80FF)", color: "#fff",
    fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 20px rgba(26,92,255,0.3)", marginTop: 4, letterSpacing: 0.3,
  },
  footer: { textAlign: "center", fontSize: 12, color: "var(--text-dim)", marginTop: 20 },
  link: { color: "var(--blue)", fontWeight: 600, textDecoration: "none" },
};
