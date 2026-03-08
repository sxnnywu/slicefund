import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

const NAV = [
  { id: "home", label: "Dashboard", icon: "grid" },
  { id: "thesis", label: "Thesis Search", icon: "search"},
  { id: "baskets", label: "My Baskets", icon: "stack" },
  { id: "markets", label: "All Markets", icon: "bars" },
];
const TOOLS = [
  { id: "arb", label: "Arb Scanner", icon: "bolt", badge: "3" },
  { id: "index", label: "Index Builder", icon: "plusGrid" },
];

function SidebarIcon({ name, active = false }) {
  const color = active ? "var(--blue)" : "currentColor";
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };
  const strokeProps = {
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (name) {
    case "search":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="3.75" {...strokeProps} />
          <path d="M10.2 10.2L13 13" {...strokeProps} />
        </svg>
      );
    case "stack":
      return (
        <svg {...common}>
          <path d="M3 5.5L8 3l5 2.5L8 8 3 5.5Z" {...strokeProps} />
          <path d="M4.5 8L8 9.8 11.5 8" {...strokeProps} />
          <path d="M4.5 10.6L8 12.4l3.5-1.8" {...strokeProps} />
        </svg>
      );
    case "bars":
      return (
        <svg {...common}>
          <path d="M3 12.5V8.5" {...strokeProps} />
          <path d="M8 12.5V4.5" {...strokeProps} />
          <path d="M13 12.5V6.5" {...strokeProps} />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M9.2 2.5L4.8 8.2h2.7l-.7 5.3 4.4-5.7H8.5l.7-5.3Z" {...strokeProps} />
        </svg>
      );
    case "plusGrid":
      return (
        <svg {...common}>
          <rect x="2.75" y="2.75" width="4.5" height="4.5" rx="1" {...strokeProps} />
          <rect x="8.75" y="8.75" width="4.5" height="4.5" rx="1" {...strokeProps} />
          <path d="M11 2.75v4.5" {...strokeProps} />
          <path d="M8.75 5h4.5" {...strokeProps} />
        </svg>
      );
    case "grid":
    default:
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="4.25" height="4.25" rx="1" {...strokeProps} />
          <rect x="9.25" y="2.5" width="4.25" height="4.25" rx="1" {...strokeProps} />
          <rect x="2.5" y="9.25" width="4.25" height="4.25" rx="1" {...strokeProps} />
          <rect x="9.25" y="9.25" width="4.25" height="4.25" rx="1" {...strokeProps} />
        </svg>
      );
  }
}

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
          <span style={{ ...styles.iconWrap, ...(activePanel === n.id ? styles.iconWrapActive : {}) }}>
            <SidebarIcon name={n.icon} active={activePanel === n.id} />
          </span>
          {n.label}
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
          <span style={{ ...styles.iconWrap, ...(activePanel === n.id ? styles.iconWrapActive : {}) }}>
            <SidebarIcon name={n.icon} active={activePanel === n.id} />
          </span>
          {n.label}
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
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  iconWrapActive: {
    borderColor: "rgba(26,92,255,0.18)",
    background: "rgba(26,92,255,0.08)",
    color: "var(--blue)",
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
