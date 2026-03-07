import React, { useState, useEffect } from "react";

function parsePrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return (parseFloat(prices[0]) * 100).toFixed(0);
    }
  } catch {}
  return "—";
}

function MarketRow({ m }) {
  const yesPrice = parsePrice(m.outcomePrices);
  const vol = m.volume ? `$${(Number(m.volume) / 1000).toFixed(0)}K` : "—";
  const liq = m.liquidity ? `$${(Number(m.liquidity) / 1000).toFixed(0)}K` : "—";
  const end = m.endDate ? new Date(m.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const url = m.slug ? `https://polymarket.com/event/${m.slug}` : null;

  return (
    <div style={s.row}>
      {m.image ? (
        <img src={m.image} alt="" style={s.img} />
      ) : (
        <div style={s.placeholder}>?</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.question}>{m.question}</div>
        <div style={s.meta}>
          VOL {vol} · LIQ {liq} · ENDS {end}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={s.price}>{yesPrice}¢</div>
        <div style={s.bar}>
          <div style={{ height: "100%", width: `${yesPrice}%`, background: "linear-gradient(90deg,var(--blue),var(--green))", borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dim)" }}>YES</div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" style={s.link}>↗</a>
      )}
    </div>
  );
}

export default function PanelPolymarket() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchTrending = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/polymarket/trending");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setMarkets(data.markets);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) { fetchTrending(); return; }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/polymarket/search?q=${encodeURIComponent(search.trim())}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setMarkets(data.markets);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, []);

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>
          🟣 Polymarket Live
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
          Real-time data from Polymarket API · {lastUpdate ? `Last updated ${lastUpdate}` : "Loading..."}
        </p>
      </div>

      {/* Search + Refresh */}
      <div style={s.controls}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1 }}>
          <input
            style={s.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets... e.g. Trump, Bitcoin, Fed"
          />
          <button type="submit" style={s.searchBtn} disabled={searching}>
            {searching ? "⟳" : "⌕ Search"}
          </button>
        </form>
        <button style={s.refreshBtn} onClick={() => { setSearch(""); fetchTrending(); }}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={s.statRow}>
        <div style={s.stat}>
          <div style={s.statL}>Markets Loaded</div>
          <div style={s.statV}>{markets.length}</div>
        </div>
        <div style={s.stat}>
          <div style={s.statL}>Status</div>
          <div style={{ ...s.statV, color: "var(--green)", fontSize: 20 }}>
            {loading ? "⟳ Loading" : error ? "⚠ Error" : "● Connected"}
          </div>
        </div>
        <div style={s.stat}>
          <div style={s.statL}>Source</div>
          <div style={{ ...s.statV, fontSize: 16 }}>gamma-api.polymarket.com</div>
        </div>
      </div>

      {error && (
        <div style={s.error}>⚠️ {error}</div>
      )}

      {/* Markets list */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {search.trim() ? `Results for "${search}"` : "Trending by Volume"}
          </div>
          <div style={s.action}>{markets.length} markets</div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>Loading markets from Polymarket...</div>
        ) : markets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>No markets found.</div>
        ) : (
          markets.map((m) => <MarketRow key={m.id} m={m} />)
        )}
      </div>
    </>
  );
}

const s = {
  controls: { display: "flex", gap: 12, marginBottom: 24 },
  input: {
    flex: 1, padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--white)", fontFamily: "'Outfit',sans-serif", fontSize: 14, color: "var(--text)", outline: "none",
  },
  searchBtn: {
    padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--blue)",
    color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(26,92,255,0.25)", whiteSpace: "nowrap",
  },
  refreshBtn: {
    padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
    fontFamily: "'Outfit',sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text-mid)", cursor: "pointer",
    whiteSpace: "nowrap",
  },
  statRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 20px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 24, fontWeight: 500 },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)" },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 8px", borderBottom: "1px solid var(--border2)", borderRadius: 8, margin: "0 -8px" },
  img: { width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  placeholder: { width: 40, height: 40, borderRadius: 10, background: "var(--blue-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-dim)", flexShrink: 0 },
  question: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  price: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  bar: { width: 60, height: 3, background: "var(--border)", borderRadius: 99, marginTop: 4, overflow: "hidden" },
  link: { fontSize: 16, color: "var(--blue)", textDecoration: "none", fontWeight: 700, flexShrink: 0, marginLeft: 8 },
};
