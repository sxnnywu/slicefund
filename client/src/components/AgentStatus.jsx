import React from "react";

const STEPS = [
  { label: "Parsing thesis into search vectors", icon: "🧠" },
  { label: "Searching Polymarket for relevant markets", icon: "🔍" },
  { label: "Ranking & explaining picks with AI", icon: "⚡" },
  { label: "Done!", icon: "✅" },
];

export default function AgentStatus({ step }) {
  return (
    <div style={styles.container}>
      {STEPS.map((s, i) => {
        const isActive = step === i + 1;
        const isDone = step > i + 1;
        return (
          <div
            key={i}
            style={{ ...styles.step, opacity: step >= i + 1 ? 1 : 0.3 }}
          >
            <span style={styles.icon}>
              {isDone ? "✓" : isActive ? s.icon : "○"}
            </span>
            <span
              style={{
                ...styles.label,
                color: isActive ? "var(--accent)" : isDone ? "var(--green)" : "var(--text-dim)",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {s.label}
            </span>
            {isActive && <span style={{ color: "var(--accent)" }}>...</span>}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    transition: "opacity 0.3s",
  },
  icon: { fontSize: 16, width: 24, textAlign: "center" },
  label: { fontSize: 14 },
};
