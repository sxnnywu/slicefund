import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

const NAV = [
  { id: "home", label: "Dashboard", icon: "▦" },
  { id: "thesis", label: "Thesis Search", icon: "⌕", badge: "NEW" },
  { id: "polymarket", label: "Polymarket", icon: "🟣", badge: "LIVE" },
  { id: "baskets", label: "My Baskets", icon: "📈" },
  { id: "markets", label: "Markets", icon: "📊" },
  { id: "trades", label: "Trades", icon: "🧾" },
];
const TOOLS = [
  { id: "arb", label: "Arb Scanner", icon: "⚡", badge: "3" },
  { id: "index", label: "Index Builder", icon: "⊞" },
  { id: "cards", label: "Cards", icon: "⚑" },
];

export default function Sidebar({ activePanel, onNavigate }) {
  const { user } = useAuth0();

  const rawName =
    user?.given_name ||
    user?.name?.trim()?.split(/\s+/)?.[0] ||
    user?.nickname ||
    (user?.email ? user.email.split("@")[0] : null) ||
    "User";
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={styles.logoText}>SLICEFUND</div>
        <div style={styles.logoSub}>THESIS ENGINE v0.1</div>
      </div>
      <div style={styles.sectionLabel}>Main</div>
      {NAV.map((n) => (
        <div
          key={n.id}
          className="sf-sidebar-item-smooth"
          style={{ ...styles.item, ...(activePanel === n.id ? styles.itemActive : {}) }}
          onClick={() => onNavigate(n.id)}
        >
          <span>{n.icon}</span> {n.label}
          {n.badge && <span style={styles.badge}>{n.badge}</span>}
        </div>
      ))}
      <div style={styles.sectionLabel}>Tools</div>
      {TOOLS.map((n) => (
        <div
          key={n.id}
          className="sf-sidebar-item-smooth"
          style={{ ...styles.item, ...(activePanel === n.id ? styles.itemActive : {}) }}
          onClick={() => onNavigate(n.id)}
        >
          <span>{n.icon}</span> {n.label}
          {n.badge && <span style={styles.badge}>{n.badge}</span>}
        </div>
      ))}
      <div style={styles.bottom}>
        <div
          className="sf-user-chip-smooth"
          style={{ ...styles.user, ...(activePanel === "profile" ? styles.userActive : {}) }}
          onClick={() => onNavigate("profile")}
        >
          {user?.picture ? (
            <img src={user.picture} alt={displayName} style={styles.avatarImage} />
          ) : (
            <div style={styles.avatar}>{avatarInitial}</div>
          )}
          <div style={styles.userText}>
            <div style={styles.userName}>{displayName}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 240, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
    background: "var(--surface)", backdropFilter: "blur(24px)", borderRight: "1px solid var(--border)",
    display: "flex", flexDirection: "column", padding: "28px 0", zIndex: 10,
  },
  logo: { padding: "0 24px 28px", borderBottom: "1px solid var(--border)", marginBottom: 16 },
  logoText: { fontSize: 16, fontWeight: 800, letterSpacing: 3, color: "var(--blue)" },
  logoSub: { fontSize: 10, color: "var(--text-dim)", marginTop: 3, fontFamily: "'DM Mono', monospace" },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "var(--text-dim)",
    textTransform: "uppercase", padding: "0 24px", margin: "16px 0 8px",
  },
  item: {
    display: "flex", alignItems: "center", gap: 10,
    paddingTop: 10, paddingBottom: 10, paddingLeft: 24, paddingRight: 24,
    fontSize: 14, fontWeight: 500, color: "var(--text-mid)", cursor: "pointer",
    marginTop: 0, marginBottom: 0, marginLeft: 8, marginRight: 8,
    borderRadius: 10,
    borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: "transparent",
    transition: "all 0.15s",
  },
  itemActive: {
    background: "var(--blue-light)", color: "var(--blue)", fontWeight: 600,
    borderLeftColor: "var(--blue)", borderRadius: "0 10px 10px 0",
    marginLeft: 0, paddingLeft: 22,
  },
  badge: {
    marginLeft: "auto", background: "var(--blue-mid)", color: "var(--blue)",
    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
  },
  bottom: { marginTop: "auto", padding: "16px 24px 0", borderTop: "1px solid var(--border)" },
  user: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 10px",
    border: "1px solid transparent",
  },
  userActive: {
    background: "var(--blue-light)",
    border: "1px solid var(--border)",
  },
  avatar: {
    width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, var(--blue), #6A9FFF)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff",
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 10,
    objectFit: "cover",
    border: "1px solid var(--border)",
  },
  userText: {
    minWidth: 0,
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
