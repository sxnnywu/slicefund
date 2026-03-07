import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import SignIn from "./pages/SignIn.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MeshBackground from "./components/MeshBackground.jsx";

export default function App() {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } = useAuth0();

  if (isLoading) {
    return (
      <>
        <MeshBackground />
        <div style={styles.loadingWrap}>
          <div style={styles.loadingCard}>Loading authentication...</div>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <MeshBackground />
        <SignIn onSignIn={() => loginWithRedirect()} />
      </>
    );
  }

  return (
    <>
      <MeshBackground />
      <div style={styles.topRightControls}>
        <span style={styles.userPill}>{user?.email || user?.name || "Signed in"}</span>
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          style={styles.logoutButton}
        >
          Logout
        </button>
      </div>
      <Dashboard />
    </>
  );
}

const styles = {
  loadingWrap: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  loadingCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 14,
    color: "var(--text-mid)",
    boxShadow: "var(--shadow)",
  },
  topRightControls: {
    position: "fixed",
    top: 16,
    right: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    zIndex: 30,
  },
  userPill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontSize: 12,
    color: "var(--text-mid)",
    maxWidth: 260,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  logoutButton: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 13,
    padding: "6px 12px",
    cursor: "pointer",
  },
};
