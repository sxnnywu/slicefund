import React, { useEffect, useMemo, useState } from "react";

const COLUMN_CONFIG = [
  { key: "market", label: "Market", width: "1.8fr", alwaysVisible: true },
  { key: "platform", label: "Platform", width: "110px" },
  { key: "yes", label: "YES", width: "80px" },
  { key: "no", label: "NO", width: "80px" },
  { key: "volume", label: "Volume", width: "95px" },
  { key: "close", label: "Close", width: "90px" },
  { key: "link", label: "Link", width: "90px" },
];

const SORT_OPTIONS = [
  { value: "volume", label: "Volume" },
  { value: "yes", label: "YES" },
  { value: "no", label: "NO" },
  { value: "close", label: "Close Date" },
  { value: "platform", label: "Platform" },
  { value: "market", label: "Market" },
];

function toProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1 && numeric <= 100) return numeric / 100;
  if (numeric < 0 || numeric > 1) return null;
  return numeric;
}

function parsePolymarketPrice(outcomePrices) {
  try {
    const prices = typeof outcomePrices === "string" ? JSON.parse(outcomePrices) : outcomePrices;
    if (Array.isArray(prices) && prices.length > 0) {
      return toProbability(prices[0]);
    }
  } catch {
    return null;
  }
  return null;
}

function formatOdds(probability) {
  const normalized = toProbability(probability);
  if (normalized === null) return "—";
  return `${Math.round(normalized * 100)}¢`;
}

function formatCompactVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return numeric.toFixed(0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizeMarkets(platform, markets) {
  return (markets || [])
    .map((market, index) => {
      const odds =
        platform === "Polymarket"
          ? parsePolymarketPrice(market.outcomePrices)
          : platform === "Kalshi"
            ? toProbability(market.yes_price)
            : toProbability(market.probability);

      if (odds === null) return null;

      const closeDate = market.endDate || market.closeDate || null;
      const url =
        platform === "Polymarket"
          ? (market.slug ? `https://polymarket.com/event/${market.slug}` : null)
          : platform === "Kalshi"
            ? (market.ticker ? `https://kalshi.com/markets/${market.ticker}` : null)
            : (market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null));

      return {
        id: `${platform}-${market.id || market.slug || index}`,
        question: market.question,
        platform,
        odds,
        noOdds: Math.max(0, Math.min(1, 1 - odds)),
        volume: Number(market.volume) || 0,
        closeDate,
        url,
      };
    })
    .filter(Boolean);
}

export default function PanelMarkets() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("volume");
  const [sortDir, setSortDir] = useState("desc");
  const [visibleColumns, setVisibleColumns] = useState({
    platform: true,
    yes: true,
    no: true,
    volume: true,
    close: true,
    link: true,
  });

  const fetchMarkets = async () => {
    setLoading(true);
    setError(null);

    try {
      const [polyRes, kalshiRes, manifoldRes] = await Promise.all([
        fetch("/api/polymarket/trending"),
        fetch("/api/kalshi/trending"),
        fetch("/api/manifold/trending"),
      ]);

      const [polyJson, kalshiJson, manifoldJson] = await Promise.all([
        polyRes.json(),
        kalshiRes.json(),
        manifoldRes.json(),
      ]);

      if (!polyRes.ok || !kalshiRes.ok || !manifoldRes.ok) {
        throw new Error(polyJson?.error || kalshiJson?.error || manifoldJson?.error || "Failed to load markets");
      }

      const merged = [
        ...normalizeMarkets("Polymarket", polyJson?.markets || []),
        ...normalizeMarkets("Kalshi", kalshiJson?.markets || []),
        ...normalizeMarkets("Manifold", manifoldJson?.markets || []),
      ];

      setRows(merged);
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load markets");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (platform !== "all" && row.platform.toLowerCase() !== platform) return false;
      if (query && !String(row.question || "").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [rows, platform, searchQuery]);

  const sortedRows = useMemo(() => {
    const getValue = (row) => {
      switch (sortBy) {
        case "market":
          return String(row.question || "").toLowerCase();
        case "platform":
          return String(row.platform || "").toLowerCase();
        case "yes":
          return row.odds;
        case "no":
          return row.noOdds;
        case "close": {
          const timestamp = row.closeDate ? new Date(row.closeDate).getTime() : null;
          return Number.isFinite(timestamp) ? timestamp : null;
        }
        case "volume":
        default:
          return row.volume;
      }
    };

    return [...filteredRows].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);

      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;

      let comparison;
      if (typeof left === "string" || typeof right === "string") {
        comparison = String(left).localeCompare(String(right));
      } else {
        comparison = Number(left) - Number(right);
      }

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sortBy, sortDir]);

  const activeColumns = useMemo(() => {
    return COLUMN_CONFIG.filter((column) => column.alwaysVisible || visibleColumns[column.key]);
  }, [visibleColumns]);

  const gridTemplateColumns = useMemo(() => {
    return activeColumns.map((column) => column.width).join(" ");
  }, [activeColumns]);

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderCellValue = (row, columnKey) => {
    if (columnKey === "market") {
      return (
        <div style={s.marketCellText} title={row.question}>
          {row.question}
        </div>
      );
    }

    if (columnKey === "platform") return row.platform;
    if (columnKey === "yes") return formatOdds(row.odds);
    if (columnKey === "no") return formatOdds(row.noOdds);
    if (columnKey === "volume") return formatCompactVolume(row.volume);
    if (columnKey === "close") return formatDate(row.closeDate);

    if (columnKey === "link") {
      return row.url ? (
        <a href={row.url} target="_blank" rel="noopener noreferrer" style={s.link}>Open ↗</a>
      ) : (
        "—"
      );
    }

    return "—";
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Markets</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            One customizable table with filtering, sorting, and column controls
          </p>
        </div>
        <button className="sf-btn-smooth" style={s.refreshBtn} onClick={fetchMarkets} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={s.controlsCard}>
        <div style={s.controlsRow}>
          <div style={s.segment}>
            {[
              { id: "all", label: "All" },
              { id: "polymarket", label: "Polymarket" },
              { id: "kalshi", label: "Kalshi" },
              { id: "manifold", label: "Manifold" },
            ].map((item) => (
              <button
                key={item.id}
                style={{ ...s.filterBtn, ...(platform === item.id ? s.filterBtnActive : {}) }}
                onClick={() => setPlatform(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={s.segment}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter by market text"
              style={s.searchInput}
            />
          </div>
        </div>

        <div style={s.controlsRow}>
          <div style={s.segment}>
            <label style={s.controlLabel}>Sort</label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={s.select}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button style={s.dirBtn} onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}>
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>

          <div style={s.resultMeta}>{sortedRows.length} markets</div>
        </div>

        <div style={s.controlsRow}>
          <div style={s.segment}>
            <span style={s.controlLabel}>Columns</span>
            {COLUMN_CONFIG.filter((column) => !column.alwaysVisible).map((column) => (
              <button
                key={column.key}
                style={{ ...s.columnBtn, ...(visibleColumns[column.key] ? s.columnBtnOn : s.columnBtnOff) }}
                onClick={() => toggleColumn(column.key)}
              >
                {column.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.card}>
        {loading && sortedRows.length === 0 && <div style={s.empty}>Loading markets...</div>}
        {!loading && !error && sortedRows.length === 0 && <div style={s.empty}>No markets available.</div>}

        {!loading && !error && sortedRows.length > 0 && (
          <>
            <div style={{ ...s.tableHead, gridTemplateColumns }}>
              {activeColumns.map((column) => (
                <div key={column.key} style={column.key === "market" ? s.colMarket : s.col}>
                  {column.label}
                </div>
              ))}
            </div>

            {sortedRows.map((row) => (
              <div key={row.id} style={{ ...s.tableRow, gridTemplateColumns }}>
                {activeColumns.map((column) => {
                  const isYes = column.key === "yes";
                  const isNo = column.key === "no";
                  const baseStyle = column.key === "market"
                    ? s.colMarket
                    : isYes
                      ? s.colYes
                      : isNo
                        ? s.colNo
                        : s.col;

                  return (
                    <div key={column.key} style={baseStyle}>
                      {renderCellValue(row, column.key)}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

const s = {
  controlsCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "14px 16px",
    marginBottom: 16,
    boxShadow: "var(--shadow)",
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  segment: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-dim)",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "var(--blue)",
    color: "#fff",
    borderColor: "var(--blue)",
  },
  searchInput: {
    minWidth: 230,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    fontFamily: "'Outfit', sans-serif",
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-dim)",
  },
  select: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    fontFamily: "'Outfit', sans-serif",
  },
  dirBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Outfit', sans-serif",
  },
  columnBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Outfit', sans-serif",
  },
  columnBtnOn: {
    background: "var(--blue-light)",
    color: "var(--blue)",
    borderColor: "var(--blue-mid)",
  },
  columnBtnOff: {
    background: "var(--surface)",
    color: "var(--text-dim)",
    borderColor: "var(--border)",
  },
  resultMeta: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    fontFamily: "'DM Mono', monospace",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "18px 22px",
    boxShadow: "var(--shadow)",
  },
  tableHead: {
    display: "grid",
    gap: 12,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.1,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    paddingBottom: 10,
    borderBottom: "1px solid var(--border2)",
  },
  tableRow: {
    display: "grid",
    gap: 12,
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid var(--border2)",
    fontSize: 12,
  },
  colMarket: { minWidth: 0 },
  marketCellText: {
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  col: {
    fontFamily: "'DM Mono',monospace",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  colYes: { fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--green)" },
  colNo: { fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--red)" },
  empty: { padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" },
  error: {
    background: "var(--red-light)",
    border: "1px solid rgba(255,77,106,0.3)",
    borderRadius: 12,
    padding: "16px 20px",
    marginBottom: 16,
    color: "var(--red)",
    fontSize: 13,
  },
  refreshBtn: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
    cursor: "pointer",
  },
  link: {
    color: "var(--blue)",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 11,
  },
};
