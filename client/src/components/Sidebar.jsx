import React from "react";

const NAV = [
  { id: "home", label: "Dashboard", icon: "▦" },
  { id: "thesis", label: "Thesis Search", icon: "⌕", badge: "NEW" },
  { id: "baskets", label: "My Baskets", icon: "📈" },
  { id: "markets", label: "Markets", icon: "📊" },
];
const TOOLS = [
  { id: "arb", label: "Arb Scanner", icon: "⚡", badge: "3" },
  { id: "index", label: "Index Builder", icon: "⊞" },
  { id: "cards", label: "Cards", icon: "⚑" },
];

export default function Sidebar({ activePanel, onNavigate }) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={styles.logoText}>BACK<span style={{ color: "var(--text-dim)" }}>BOARD</span></div>
        <div style={styles.logoSub}>THESIS ENGINE v0.1</div>
      </div>
      <div style={styles.sectionLabel}>Main</div>
      {NAV.map((n) => (
        <div
          key={n.id}
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
          style={{ ...styles.item, ...(activePanel === n.id ? styles.itemActive : {}) }}
          onClick={() => onNavigate(n.id)}
        >
          <span>{n.icon}</span> {n.label}
          {n.badge && <span style={styles.badge}>{n.badge}</span>}
        </div>
      ))}
      <div style={styles.bottom}>
        <div style={styles.user}>
          <div style={styles.avatar}>J</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>james.eth</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'DM Mono', monospace" }}>PRO · SOLANA</div>
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
    display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", fontSize: 14,
    fontWeight: 500, color: "var(--text-mid)", cursor: "pointer", margin: "0 8px", borderRadius: 10,
    borderLeft: "2px solid transparent", transition: "all 0.15s",
  },
  itemActive: {
    background: "var(--blue-light)", color: "var(--blue)", fontWeight: 600,
    borderLeftColor: "var(--blue)", borderRadius: "0 10px 10px 0", marginLeft: 0, paddingLeft: 22,
  },
  badge: {
    marginLeft: "auto", background: "var(--blue-mid)", color: "var(--blue)",
    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
  },
  bottom: { marginTop: "auto", padding: "16px 24px 0", borderTop: "1px solid var(--border)" },
  user: { display: "flex", alignItems: "center", gap: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, var(--blue), #6A9FFF)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff",
  },
};
