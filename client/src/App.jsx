import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import SignIn from "./pages/SignIn.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MeshBackground from "./components/MeshBackground.jsx";

export default function App() {
  const { isLoading, isAuthenticated, loginWithRedirect } = useAuth0();

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
};
