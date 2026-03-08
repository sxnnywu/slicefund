import React, { useEffect, useMemo, useState } from "react";
import usePhantom from "../hooks/usePhantom.js";
import { getAllTrending } from "../lib/trendingCache.js";

const STORAGE_KEY = "slicefund_baskets";

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

function normalizeWeight(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toCustomBasket(raw, index) {
  if (!raw || typeof raw !== "object") return null;

  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : `Custom Basket ${index + 1}`;

  const rawMarkets = Array.isArray(raw.markets) ? raw.markets : [];
  const markets = rawMarkets
    .map((market) => {
      const marketName =
        typeof market?.market === "string" && market.market.trim().length > 0
          ? market.market.trim()
          : typeof market?.question === "string" && market.question.trim().length > 0
            ? market.question.trim()
            : null;

      if (!marketName) return null;

      const platform =
        typeof market?.platform === "string" && market.platform.trim().length > 0
          ? market.platform.trim()
          : "Unknown";

      const targetWeight = normalizeWeight(market?.target_weight, 0);
      const currentWeight = normalizeWeight(market?.current_weight, targetWeight);

      return {
        market: marketName,
        platform,
        target_weight: targetWeight,
        current_weight: currentWeight,
        marketUrl: typeof market?.marketUrl === "string" ? market.marketUrl : null,
      };
    })
    .filter(Boolean);

  if (markets.length === 0) return null;

  const avgOdds =
    markets.reduce((sum, market) => sum + normalizeWeight(market.current_weight, 0), 0) /
    Math.max(markets.length, 1);

  return {
    name,
    markets,
    src: "CUSTOM",
    odds: Math.round(avgOdds * 100),
    yield: "Custom",
    isCustom: true,
  };
}

function loadPersistedBaskets() {
  if (typeof window === "undefined") return [];

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((basket, index) => toCustomBasket(basket, index)).filter(Boolean);
  } catch (error) {
    console.error("Failed to load persisted baskets:", error);
    return [];
  }
}

function formatVolume(volume) {
  const numeric = Number(volume);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `$${(numeric / 1_000).toFixed(1)}K`;
  return `$${numeric.toFixed(0)}`;
}

function buildLiveBasket(name, sourceLabel, items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const targetWeight = 1 / items.length;
  const markets = items.map((item) => {
    const yesPrice = toProbability(item.yesPrice) ?? targetWeight;
    return {
      market: item.question,
      platform: item.platform,
      target_weight: targetWeight,
      current_weight: yesPrice,
      marketUrl: item.marketUrl,
      volume: item.volume,
    };
  });

  const averageOdds =
    markets.reduce((sum, market) => sum + normalizeWeight(market.current_weight, 0), 0) /
    Math.max(markets.length, 1);

  const totalVolume = markets.reduce((sum, market) => sum + (Number(market.volume) || 0), 0);

  return {
    name,
    markets,
    src: sourceLabel,
    odds: Math.round(averageOdds * 100),
    yield: formatVolume(totalVolume),
    isCustom: false,
  };
}

async function fetchLiveBaskets() {
  const { polymarket: polyJson, kalshi: kalshiJson, manifold: manifoldJson } = await getAllTrending();

  const polyMarkets = (polyJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Polymarket",
    yesPrice: parsePolymarketPrice(market.outcomePrices),
    marketUrl: market.slug ? `https://polymarket.com/event/${market.slug}` : null,
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const kalshiMarkets = (kalshiJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Kalshi",
    yesPrice: toProbability(market.yes_price),
    marketUrl: market.ticker ? `https://kalshi.com/markets/${market.ticker}` : null,
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const manifoldMarkets = (manifoldJson?.markets || []).slice(0, 3).map((market) => ({
    question: market.question,
    platform: "Manifold",
    yesPrice: toProbability(market.probability),
    marketUrl: market.url || (market.slug ? `https://manifold.markets/${market.slug}` : null),
    volume: market.volume,
  })).filter((market) => market.yesPrice !== null);

  const crossPlatformCore = [polyMarkets[0], kalshiMarkets[0], manifoldMarkets[0]].filter(Boolean);

  return [
    buildLiveBasket("Polymarket Momentum", "POLYMARKET", polyMarkets),
    buildLiveBasket("Kalshi Macro", "KALSHI", kalshiMarkets),
    buildLiveBasket("Manifold Signal", "MANIFOLD", manifoldMarkets),
    buildLiveBasket("Cross-Platform Core", "LIVE", crossPlatformCore),
  ].filter(Boolean);
}

async function checkRebalance(basket) {
  try {
    const response = await fetch("/api/basket/rebalance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basket: basket.markets }),
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default function PanelBaskets({ progress, onStartProgress, onStopProgress }) {
  const leverageOptions = [1, 2, 3];
  const { wallet, walletAddress, connect, signMessage, phantomInstalled } = usePhantom();
  const [liveBaskets, setLiveBaskets] = useState([]);
  const [customBaskets, setCustomBaskets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedBasket, setSelectedBasket] = useState(null);
  const [rebalanceData, setRebalanceData] = useState(null);
  const [proposedTrades, setProposedTrades] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [isBuying, setIsBuying] = useState(false);
  const [buyingName, setBuyingName] = useState(null);
  const [buyStatus, setBuyStatus] = useState(null);
  const [buyError, setBuyError] = useState(null);
  const [leverage, setLeverage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [fetchedLive, persisted] = await Promise.all([
          fetchLiveBaskets(),
          Promise.resolve(loadPersistedBaskets()),
        ]);

        setLiveBaskets(fetchedLive);
        setCustomBaskets(persisted);
      } catch (loadError) {
        setError(loadError.message || "Failed to load baskets");
        setLiveBaskets([]);
        setCustomBaskets(loadPersistedBaskets());
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const baskets = [...liveBaskets, ...customBaskets];

  const stats = useMemo(() => {
    const totalBaskets = baskets.length;
    const avgOdds =
      baskets.length > 0
        ? Math.round(baskets.reduce((sum, basket) => sum + (Number(basket.odds) || 0), 0) / baskets.length)
        : 0;
    const totalMarkets = baskets.reduce((sum, basket) => sum + (Array.isArray(basket.markets) ? basket.markets.length : 0), 0);
    const customCount = customBaskets.length;

    return {
      totalBaskets,
      avgOdds,
      totalMarkets,
      customCount,
    };
  }, [baskets, customBaskets]);

  const handleCheckRebalance = async (basket) => {
    setIsChecking(true);
    setSelectedBasket(basket);
    if (onStartProgress) onStartProgress();
    const data = await checkRebalance(basket);
    setRebalanceData(data);
    setExecutionResult(null);
    
    // Extract proposed trades from rebalance data
    const trades = extractProposedTrades(data, basket);
    setProposedTrades(trades);
    
    setIsChecking(false);
    if (onStopProgress) onStopProgress();
  };

  const extractProposedTrades = (data, basket) => {
    if (!data?.rebalanceAnalysis?.content) {
      // Fallback: suggest trades based on drift from all markets
      if (!Array.isArray(basket?.markets)) return [];
      
      return basket.markets.map(market => {
        const drift = Math.abs(market.current_weight - (market.target_weight || 0.5));
        if (drift < 0.05) return null; // Skip if minimal drift
        
        const action = market.current_weight > (market.target_weight || 0.5) ? "SELL" : "BUY";
        return {
          market: market.market || market.question || "Market",
          platform: market.platform || "Polymarket",
          action,
          currentWeight: market.current_weight || 0,
          targetWeight: market.target_weight || 0.5,
          drift: (drift * 100).toFixed(1),
        };
      }).filter(Boolean);
    }
    
    const analysisText = data.rebalanceAnalysis.content;
    const trades = [];
    
    // For each market in the basket, infer action from analysis text
    if (Array.isArray(basket?.markets)) {
      for (const market of basket.markets) {
        const marketName = market.market || market.question;
        const lowerAnalysis = analysisText.toLowerCase();
        const marketLower = marketName.toLowerCase().slice(0, 30); // Match first 30 chars
        
        // Simple heuristic: look for increase/decrease keywords near market name
        const idx = lowerAnalysis.indexOf(marketLower);
        const marketSection = idx >= 0 
          ? lowerAnalysis.substring(Math.max(0, idx - 100), Math.min(lowerAnalysis.length, idx + 200))
          : "";
        
        const increaseKeywords = ["increase", "buy", "add", "boost", "strengthen", "go long"];
        const decreaseKeywords = ["decrease", "sell", "reduce", "lower", "cut", "trim"];
        
        const hasIncrease = increaseKeywords.some(kw => marketSection.includes(kw));
        const hasDecrease = decreaseKeywords.some(kw => marketSection.includes(kw));
        
        const action = hasIncrease ? "BUY" : hasDecrease ? "SELL" : null;
        
        if (action) {
          trades.push({
            market: marketName,
            platform: market.platform || "Polymarket",
            action,
            currentWeight: market.current_weight || 0,
            targetWeight: market.target_weight || 0.5,
          });
        }
      }
    }
    
    // If no trades extracted from keywords, generate from drift
    if (trades.length === 0 && Array.isArray(basket?.markets)) {
      return basket.markets.map(market => {
        const drift = Math.abs(market.current_weight - (market.target_weight || 0.5));
        if (drift < 0.05) return null;
        
        const action = market.current_weight > (market.target_weight || 0.5) ? "SELL" : "BUY";
        return {
          market: market.market || market.question || "Market",
          platform: market.platform || "Polymarket",
          action,
          currentWeight: market.current_weight || 0,
          targetWeight: market.target_weight || 0.5,
          drift: (drift * 100).toFixed(1),
        };
      }).filter(Boolean);
    }
    
    return trades;
  };

  const formatAnalysisText = (text) => {
    if (!text) return [];
    
    // Split by common delimiters and format as bullet points
    const lines = text.split(/[\n•\-]/).filter(line => line.trim().length > 0);
    return lines.slice(0, 5); // Show max 5 key points
  };

  const handleExecuteRebalance = async () => {
    if (!selectedBasket || proposedTrades.length === 0) {
      setExecutionResult({ status: "error", message: "No rebalance to execute" });
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      let activeWallet = walletAddress;
      if (!activeWallet) {
        const connected = await connect();
        activeWallet = connected?.toString?.() || walletAddress;
      }

      if (!activeWallet) {
        throw new Error("Wallet not connected");
      }

      const payload = {
        type: "basket_execute",
        basket: selectedBasket.name,
        markets: selectedBasket.markets.map((m) => m.market),
        leverage: Number(leverage) || 1,
        timestamp: new Date().toISOString(),
      };

      const leverageValue = Number(leverage) || 1;
      const notional = 100 * leverageValue;

      let signature = `mock-sig-${Date.now()}`;
      if (activeWallet && typeof signMessage === "function") {
        try {
          const signed = await signMessage(JSON.stringify(payload), activeWallet);
          signature = signed?.signature || signature;
        } catch {
          // Fall back to mock signature when wallet signing is unavailable.
        }
      }

      const response = await fetch("/api/mock/polymarket/execute-basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basket: selectedBasket.markets,
          walletAddress: activeWallet,
          solanaSignature: signature,
          notional,
        }),
      });

      if (!response.ok) {
        const payloadError = await response.json().catch(() => null);
        throw new Error(payloadError?.error || payloadError?.message || "Execution failed");
      }

      const result = await response.json();
      setExecutionResult({
        status: "success",
        message: `✓ Rebalance executed! ${result.count} trades placed`,
        trades: result.trades,
      });
    } catch (err) {
      setExecutionResult({
        status: "error",
        message: err.message || "Failed to execute rebalance",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleBuy = async (basket) => {
    if (!basket) return;
    setIsBuying(true);
    setBuyingName(basket.name);
    setBuyStatus(null);
    setBuyError(null);

    try {
      let activeWallet = walletAddress;
      if (!activeWallet) {
        const connected = await connect();
        activeWallet = connected?.toString?.() || walletAddress;
      }

      if (!activeWallet) {
        throw new Error("Wallet not connected");
      }

      const payload = {
        type: "basket_buy",
        basket: basket.name,
        markets: basket.markets.map((m) => m.market),
        leverage: Number(leverage) || 1,
        timestamp: new Date().toISOString(),
      };

      const leverageValue = Number(leverage) || 1;
      const notional = 100 * leverageValue;

      let signature = `mock-buy-sig-${Date.now()}`;
      if (activeWallet && typeof signMessage === "function") {
        try {
          const signed = await signMessage(JSON.stringify(payload), activeWallet);
          signature = signed?.signature || signature;
        } catch {
          // Fall back to mock signature when wallet signing is unavailable.
        }
      }

      const response = await fetch("/api/mock/polymarket/buy-basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basket: basket.markets,
          walletAddress: activeWallet,
          solanaSignature: signature,
          notional,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Basket buy failed");
      }

      const result = await response.json();
      setBuyStatus(`Bought ${result.count} mock positions`);
      setSelectedBasket(basket);
    } catch (err) {
      setBuyError(err.message || "Basket buy failed");
    } finally {
      setIsBuying(false);
      setBuyingName(null);
    }
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>My Baskets</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            {loading ? "Loading live baskets..." : `${stats.totalBaskets} live/custom baskets from Polymarket, Kalshi, Manifold`}
          </p>
        </div>
        <div style={s.leverageControl}>
          <label style={s.leverageLabel} htmlFor="basket-leverage">
            Leverage
          </label>
          <select
            id="basket-leverage"
            value={leverage}
            onChange={(event) => setLeverage(Number(event.target.value))}
            style={s.leverageSelect}
          >
            {leverageOptions.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={s.statRow}>
        {[
          { l: "Total Baskets", v: String(stats.totalBaskets), d: `${stats.customCount} custom`, c: "var(--text-dim)" },
          { l: "Avg Odds", v: stats.avgOdds ? `${stats.avgOdds}¢` : "—", d: "Implied YES", c: "var(--green)" },
          { l: "Total Markets", v: String(stats.totalMarkets), d: "Across all baskets", c: "var(--green)" },
          { l: "Data Sources", v: "3", d: "Polymarket · Kalshi · Manifold", c: "var(--green)" },
        ].map((item, index) => (
          <div key={index} style={s.stat}>
            <div style={s.statL}>{item.l}</div>
            <div style={s.statV}>{item.v}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: item.c }}>{item.d}</div>
          </div>
        ))}
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Active Baskets</div>
          <div style={s.action}>Live data only</div>
        </div>

        {phantomInstalled === false && (
          <div style={s.notice}>Connect Phantom to sign mock basket trades.</div>
        )}
        {buyStatus && (
          <div style={s.success}>{buyStatus}</div>
        )}
        {buyError && (
          <div style={s.error}>{buyError}</div>
        )}

        {!loading && baskets.length === 0 && (
          <div style={s.empty}>No baskets available yet.</div>
        )}

        {baskets.map((basket, index) => (
          <div key={`${basket.name}-${index}`} style={s.row}>
            <div style={s.num}>{index + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.q}>{basket.name}</div>
              <div style={s.meta}>{basket.markets.length} MARKETS · {basket.src}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={s.odds}>{typeof basket.odds === "number" ? `${basket.odds}¢` : "—"}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{basket.yield}</div>
            </div>
            <button
              onClick={() => handleBuy(basket)}
              disabled={isBuying}
              style={{ ...s.buyBtn, opacity: isBuying ? 0.6 : 1 }}
            >
              {isBuying && buyingName === basket.name ? "Buying..." : "Buy"}
            </button>
            <button
              onClick={() => handleCheckRebalance(basket)}
              disabled={isChecking}
              style={{ ...s.checkBtn, opacity: isChecking ? 0.6 : 1 }}
            >
              {isChecking && selectedBasket === basket ? "⟳" : "Check"}
            </button>
          </div>
        ))}
      </div>

      {isChecking && progress?.steps && (
        <div style={s.progressWrap}>
          <div style={s.progressTitle}>Analyzing Rebalance...</div>
          <div style={s.progressRow}>
            {progress.steps.map((step, idx) => (
              <div key={idx} style={s.progressItem}>
                <div
                  style={{
                    ...s.progressDot,
                    ...(idx < progress.currentStep
                      ? s.progressDotDone
                      : idx === progress.currentStep
                      ? s.progressDotActive
                      : s.progressDotIdle),
                  }}
                >
                  {idx < progress.currentStep ? "✓" : idx === progress.currentStep ? "⟳" : String(idx + 1)}
                </div>
                <div
                  style={{
                    ...s.progressText,
                    ...(idx <= progress.currentStep ? s.progressTextActive : s.progressTextIdle),
                  }}
                >
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rebalanceData && (
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            🤖 Rebalancer Analysis: {selectedBasket?.name}
          </div>
          <div style={s.analysisWrap}>
            <div style={s.analysisLabel}>Key Insights</div>
            <div style={s.insightsList}>
              {formatAnalysisText(rebalanceData.rebalanceAnalysis?.content).map((insight, idx) => (
                <div key={idx} style={s.insightItem}>
                  <span style={s.insightDot}>→</span>
                  <span>{insight.trim()}</span>
                </div>
              ))}
            </div>
          </div>

          {proposedTrades.length > 0 && !executionResult && (
            <div style={{ ...s.tradesWrap, marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Proposed Trades</div>
              <div style={s.tradesList}>
                {proposedTrades.map((trade, idx) => (
                  <div key={idx} style={s.tradeRow}>
                    <div style={{ flex: 1 }}>
                      <div style={s.tradeMarket}>{trade.market}</div>
                      <div style={s.tradePlatform}>{trade.platform}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        ...s.tradeAction,
                        color: trade.action === "BUY" ? "var(--green)" : "var(--red)",
                      }}>
                        {trade.action}
                      </div>
                      <div style={s.tradeWeight}>
                        {(trade.currentWeight * 100).toFixed(0)}¢ → {(trade.targetWeight * 100).toFixed(0)}¢
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {wallet && (
                <button
                  onClick={handleExecuteRebalance}
                  disabled={isExecuting}
                  style={{
                    ...s.executeBtn,
                    opacity: isExecuting ? 0.6 : 1,
                    cursor: isExecuting ? "default" : "pointer",
                  }}
                >
                  {isExecuting ? "Executing..." : "Execute Rebalance"}
                </button>
              )}
              {!wallet && (
                <div style={s.walletPrompt}>Connect wallet to execute rebalance</div>
              )}
            </div>
          )}

          {executionResult && (
            <div style={{
              ...s.executionResult,
              ...(executionResult.status === "success" ? s.executionSuccess : s.executionError),
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                {executionResult.message}
              </div>
              {executionResult.trades && (
                <div style={s.executedTradesList}>
                  {executionResult.trades.slice(0, 3).map((trade, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: "var(--text-mid)", marginBottom: 6 }}>
                      {trade.side} {(trade.size || 0).toFixed(2)} @ {(trade.price * 100).toFixed(0)}¢
                    </div>
                  ))}
                  {executionResult.trades.length > 3 && (
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      +{executionResult.trades.length - 3} more trades
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {proposedTrades.length > 0 && selectedBasket?.markets?.some((market) => market.marketUrl) && (
            <div style={s.linksRow}>
              {selectedBasket.markets
                .filter((market) => market.marketUrl && proposedTrades.some(t => t.market === (market.market || market.question)))
                .slice(0, 3)
                .map((market, index) => (
                  <a key={`${market.market}-${index}`} href={market.marketUrl} target="_blank" rel="noopener noreferrer" style={s.linkBtn}>
                    Open {market.platform} ↗
                  </a>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const s = {
  statRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 },
  stat: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)" },
  statL: { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 },
  statV: { fontFamily: "'DM Mono',monospace", fontSize: 28, fontWeight: 500 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px 28px", boxShadow: "var(--shadow)", marginBottom: 24 },
  leverageControl: { display: "flex", alignItems: "center", gap: 10 },
  leverageLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-dim)" },
  leverageSelect: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
    fontFamily: "'DM Mono',monospace",
  },
  action: { fontSize: 12, fontWeight: 600, color: "var(--blue)", fontFamily: "'DM Mono',monospace" },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--border2)" },
  num: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--blue)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  q: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  meta: { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", marginTop: 3 },
  odds: { fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 500, color: "var(--blue)" },
  buyBtn: {
    padding: "8px 14px",
    background: "var(--green)",
    border: "none",
    borderRadius: 8,
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
  checkBtn: {
    padding: "8px 14px",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "'Outfit',sans-serif",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--blue)",
    cursor: "pointer",
  },
  notice: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, color: "var(--text-dim)", fontSize: 12 },
  success: { background: "var(--green-light)", border: "1px solid rgba(0,196,140,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 12, color: "var(--green)", fontSize: 12 },
  error: { background: "var(--red-light)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "var(--red)", fontSize: 14 },
  empty: { padding: "24px", textAlign: "center", fontSize: 13, color: "var(--text-dim)" },
  linksRow: {
    marginTop: 14,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  linkBtn: {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    color: "var(--blue)",
    fontSize: 11,
    fontWeight: 600,
    textDecoration: "none",
    fontFamily: "'DM Mono',monospace",
    background: "var(--surface)",
  },
  progressWrap: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "20px 24px",
    marginBottom: 24,
    boxShadow: "var(--shadow)",
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  progressRow: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  progressItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  progressDotDone: {
    background: "rgba(0,196,140,0.15)",
    color: "var(--green)",
    border: "1px solid rgba(0,196,140,0.3)",
  },
  progressDotActive: {
    background: "rgba(26,92,255,0.15)",
    color: "var(--blue)",
    border: "1px solid rgba(26,92,255,0.3)",
    animation: "spin 1s linear infinite",
  },
  progressDotIdle: {
    background: "rgba(255,255,255,0.05)",
    color: "var(--text-dim)",
    border: "1px solid var(--border)",
  },
  progressText: {
    fontSize: 13,
    fontWeight: 500,
    transition: "color 0.2s",
  },
  progressTextActive: {
    color: "var(--text)",
  },
  progressTextIdle: {
    color: "var(--text-dim)",
  },
  tradesWrap: {
    background: "rgba(26,92,255,0.08)",
    border: "1px solid rgba(26,92,255,0.2)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  tradesList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 14,
  },
  tradeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  },
  tradeMarket: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text)",
  },
  tradePlatform: {
    fontSize: 10,
    color: "var(--text-dim)",
    marginTop: 3,
  },
  tradeAction: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'DM Mono',monospace",
    marginBottom: 4,
  },
  tradeWeight: {
    fontSize: 10,
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
  },
  executeBtn: {
    width: "100%",
    padding: "12px 16px",
    background: "var(--blue)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontFamily: "'Outfit',sans-serif",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  walletPrompt: {
    fontSize: 12,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "12px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
  },
  executionResult: {
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 14,
  },
  executionSuccess: {
    background: "rgba(0,196,140,0.08)",
    border: "1px solid rgba(0,196,140,0.2)",
    color: "var(--green)",
  },
  executionError: {
    background: "rgba(255,77,106,0.08)",
    border: "1px solid rgba(255,77,106,0.2)",
    color: "var(--red)",
  },
  analysisWrap: {
    background: "rgba(26,92,255,0.08)",
    border: "1px solid rgba(26,92,255,0.2)",
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 14,
  },
  analysisLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  insightsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  insightItem: {
    fontSize: 13,
    lineHeight: 1.4,
    color: "var(--text)",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  insightDot: {
    color: "var(--blue)",
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 2,
  },
  executedTradesList: {
    fontSize: 12,
    background: "var(--surface)",
    padding: "10px 12px",
    borderRadius: 8,
  },
};
