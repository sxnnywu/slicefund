import React, { useState } from "react";

export default function PanelIndex() {
  const [basketName, setBasketName] = useState("AI Regulation Wave 2025");
  const [threshold, setThreshold] = useState("5% drift");
  const [markets, setMarkets] = useState([
    { weight: 40, question: "Will EU AI Act enforcement begin before Q4 2025?", platform: "Polymarket" },
    { weight: 35, question: "Will US Congress pass an AI liability bill in 2025?", platform: "Polymarket" },
    { weight: 25, question: "Will OpenAI face a major regulatory action in 2025?", platform: "Polymarket" },
  ]);
  const [newMarket, setNewMarket] = useState({ question: "", weight: 10, platform: "Polymarket" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [minting, setMinting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAddMarket = () => {
    if (!newMarket.question.trim()) return;
    if (newMarket.weight <= 0) return;
    setMarkets([...markets, newMarket]);
    setNewMarket({ question: "", weight: 10, platform: "Polymarket" });
    setShowAddForm(false);
  };

  const handleRemoveMarket = (idx) => {
    setMarkets(markets.filter((_, i) => i !== idx));
  };

  const totalWeight = markets.reduce((sum, m) => sum + m.weight, 0);

  const handleMint = async () => {
    if (totalWeight !== 100) {
      alert("Total weight must equal 100%");
      return;
    }
    setMinting(true);
    setSuccess(false);
    try {
      // Simulate minting delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      const basket = {
        name: basketName,
        threshold,
        markets: markets.map(m => ({
          market: m.question,
          platform: m.platform,
          target_weight: m.weight / 100,
        })),
        created: new Date().toISOString(),
      };
      // Save to localStorage
      const existingBaskets = JSON.parse(localStorage.getItem("slicefund_baskets") || "[]");
      existingBaskets.push(basket);
      localStorage.setItem("slicefund_baskets", JSON.stringify(existingBaskets));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert(`Minting failed: ${err.message}`);
    } finally {
      setMinting(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Index Builder</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>Build and mint custom prediction market baskets as SPL tokens</p>
        </div>
        <button style={{ ...s.btn, opacity: minting ? 0.6 : 1 }} onClick={handleMint} disabled={minting}>
          {minting ? "Minting..." : success ? "✓ Minted!" : "Mint Basket →"}
        </button>
      </div>
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Basket Configuration</div>
        <div style={{ marginBottom: 16 }}>
          <div style={s.label}>Basket Name</div>
          <input style={s.input} value={basketName} onChange={(e) => setBasketName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={s.label}>Rebalance Threshold</div>
          <input style={s.input} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Markets in Basket ({totalWeight}% total)
          </div>
          <div style={s.action} onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "✕ Cancel" : "+ Add market"}
          </div>
        </div>
        {showAddForm && (
          <div style={{ ...s.row, flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "16px 12px", background: "var(--blue-light)", border: "1px solid var(--blue)", borderRadius: 10, marginBottom: 12 }}>
            <input style={{ ...s.input, width: "100%" }} placeholder="Market question" value={newMarket.question} onChange={(e) => setNewMarket({ ...newMarket, question: e.target.value })} />
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <input style={{ ...s.input, width: 100 }} type="number" placeholder="Weight %" value={newMarket.weight} onChange={(e) => setNewMarket({ ...newMarket, weight: Number(e.target.value) })} />
              <button style={{ ...s.btn, fontSize: 12 }} onClick={handleAddMarket}>Add</button>
            </div>
          </div>
        )}
        {markets.map((m, i) => (
          <div key={i} style={s.row}>
            <div style={s.wBadge}>{m.weight}%</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.question}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 }}>WEIGHT: {m.weight}%</div>
            </div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 14, color: "var(--text-dim)", cursor: "pointer" }} onClick={() => handleRemoveMarket(i)}>✕</div>
          </div>
        ))}
      </div>
    </>
  );
}
const s = {
  btn: { padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(26,92,255,0.25)" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", maxWidth: 700 },
  label: { fontSize: 11, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6, letterSpacing: 0.3 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", fontFamily: "'Outfit',sans-serif", fontSize: 14, color: "var(--text)", outline: "none", background: "var(--bg)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", cursor: "pointer", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", margin: "0 -8px" },
  wBadge: { width: 36, height: 36, borderRadius: 10, background: "var(--blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--blue)", flexShrink: 0 },
};
