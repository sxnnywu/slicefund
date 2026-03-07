import React, { useState } from "react";

const EXAMPLES = [
  "Trump tariffs will crush Canadian auto exports",
  "AI is driving HBM memory prices up — who benefits?",
  "Fed will cut rates before July, risk assets rally",
  "Ukraine ceasefire is more likely than markets think",
  "Bitcoin ETF inflows will push BTC past 100k this year",
];

export default function ThesisInput({ onSubmit, loading }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim() && !loading) {
      onSubmit(text.trim());
    }
  };

  const handleExample = (ex) => {
    setText(ex);
    if (!loading) {
      onSubmit(ex);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your market thesis in plain English..."
          style={styles.textarea}
          rows={3}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          style={{
            ...styles.button,
            opacity: loading || !text.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "⟳" : "Analyze →"}
        </button>
      </form>

      <div style={styles.examples}>
        <span style={styles.exLabel}>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => handleExample(ex)}
            style={styles.exButton}
            disabled={loading}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  form: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
    color: "var(--text)",
    fontSize: 16,
    fontFamily: "inherit",
    resize: "vertical",
    outline: "none",
  },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "16px 28px",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  examples: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    alignItems: "center",
  },
  exLabel: {
    color: "var(--text-dim)",
    fontSize: 13,
    marginRight: 4,
  },
  exButton: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "6px 14px",
    color: "var(--text-dim)",
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  },
};
