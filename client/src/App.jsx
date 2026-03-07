import React, { useState } from "react";
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
