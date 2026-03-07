import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

function connectionFromSub(sub) {
  if (!sub || typeof sub !== "string") return "unknown";
  const prefix = sub.split("|")[0];
  if (prefix === "google-oauth2") return "Google";
  if (prefix === "github") return "GitHub";
  if (prefix === "auth0") return "Email/Password";
  return prefix;
}

export default function PanelProfile() {
  const { user, logout, loginWithRedirect } = useAuth0();

  const name = user?.name || user?.nickname || "Slicefund User";
  const email = user?.email || "Not provided";
  const picture = user?.picture || null;
  const provider = connectionFromSub(user?.sub);

  const appStats = [
    { label: "Markets Analyzed", value: 247 },
    { label: "Arb Opportunities", value: 12 },
    { label: "Active Baskets", value: 3 },
    { label: "Win Rate", value: "68%" },
  ];

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Profile</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
          Auth0 Identity Center
        </p>
      </div>

      <div style={styles.heroCard} className="sf-card-smooth">
        <div style={styles.heroBackground} />
        <div style={styles.heroContent}>
          <div style={styles.heroLeft}>
            {picture ? (
              <img src={picture} alt={name} style={styles.avatarImage} />
            ) : (
              <div style={styles.avatarFallback}>{name.charAt(0).toUpperCase()}</div>
            )}
            <div style={styles.identityText}>
              <div style={styles.kicker}>Identity Vault</div>
              <div style={styles.name}>{name}</div>
              <div style={styles.email}>{email}</div>
            </div>
          </div>
          <div style={styles.heroRight}>
            <span style={{ ...styles.statusChip, ...(user?.email_verified ? styles.chipGood : styles.chipWarn) }}>
              {user?.email_verified ? "Verified Identity" : "Verification Pending"}
            </span>
            <span style={styles.statusChip}>Provider: {provider}</span>
          </div>
        </div>
      </div>

      

      <div style={styles.panelGrid}>
        <div style={styles.panelCard} className="sf-card-smooth">
          <div style={styles.panelTitle}>Session Controls</div>
          <div style={styles.controls}>
            <button
              className="sf-btn-smooth"
              style={styles.reauthButton}
              onClick={() =>
                loginWithRedirect({ authorizationParams: { prompt: "login" } })
              }
            >
              Re-authenticate
            </button>
            <button
              className="sf-btn-smooth"
              style={styles.logoutButton}
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
            >
              Logout
            </button>
          </div>
          <div style={styles.hint}>
            Built with Auth0 social login, session management, and claim-based
            identity state.
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  heroCard: {
    position: "relative",
    overflow: "hidden",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    boxShadow: "var(--shadow-lg)",
    marginBottom: 20,
  },
  heroBackground: {
    position: "absolute",
    inset: 0,
    background: "transparent",
    pointerEvents: "none",
  },
  heroContent: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 24px",
    gap: 16,
    flexWrap: "wrap",
  },
  heroLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
  },
  heroRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  identityText: {
    minWidth: 0,
  },
  kicker: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "'DM Mono', monospace",
  },
  avatarImage: {
    width: 62,
    height: 62,
    borderRadius: 16,
    objectFit: "cover",
    border: "1px solid var(--border)",
  },
  avatarFallback: {
    width: 62,
    height: 62,
    borderRadius: 16,
    background: "linear-gradient(135deg, var(--blue), #6A9FFF)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(26,92,255,0.24)",
  },
  name: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text)",
    lineHeight: 1.1,
  },
  email: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 420,
  },
  statusChip: {
    height: 28,
    padding: "0 10px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-mid)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
  },
  chipGood: {
    border: "1px solid rgba(0,196,140,0.35)",
    color: "var(--green)",
    background: "var(--green-light)",
  },
  chipWarn: {
    border: "1px solid rgba(255,77,106,0.35)",
    color: "var(--red)",
    background: "var(--red-light)",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: "var(--text-dim)",
    fontWeight: 700,
    marginBottom: 8,
    fontFamily: "'DM Mono', monospace",
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
  },
  panelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  panelCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "18px",
    boxShadow: "var(--shadow)",
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 12,
    color: "var(--text)",
  },
  claimRows: {
    display: "grid",
    gap: 8,
  },
  claimRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    border: "1px solid var(--border2)",
    borderRadius: 10,
    padding: "10px 12px",
    background: "var(--white)",
  },
  claimLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-dim)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  claimValue: {
    fontSize: 12,
    color: "var(--text)",
    fontFamily: "'DM Mono', monospace",
    textAlign: "right",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 320,
  },
  controls: {
    display: "grid",
    gap: 10,
    marginBottom: 12,
  },
  reauthButton: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  logoutButton: {
    border: "1px solid rgba(255,77,106,0.4)",
    background: "var(--red-light)",
    color: "var(--red)",
    borderRadius: 10,
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  hint: {
    fontSize: 12,
    color: "var(--text-dim)",
    lineHeight: 1.5,
  },
  activityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  activityCard: {
    position: "relative",
    overflow: "hidden",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "24px",
    minHeight: 140,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    cursor: "default",
    transition: "all 0.3s ease",
  },
  activityCardBg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 100% 0%, rgba(26,92,255,0.08), transparent 40%), radial-gradient(circle at 0% 100%, rgba(0,196,140,0.08), transparent 40%)",
    pointerEvents: "none",
  },
  activityCardContent: {
    position: "relative",
    zIndex: 1,
  },
  activityValue: {
    fontSize: 36,
    fontWeight: 800,
    color: "var(--blue)",
    marginBottom: 8,
    fontFamily: "'DM Mono', monospace",
    lineHeight: 1,
  },
  activityLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
};
