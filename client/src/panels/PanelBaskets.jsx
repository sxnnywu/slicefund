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

function stripCodeFences(text) {
  if (typeof text !== "string") return "";
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseRebalancePayload(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content;
  }

  if (typeof content !== "string") {
    return null;
  }

  const normalized = stripCodeFences(content);

  try {
    return JSON.parse(normalized);
  } catch {
    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

function clampUnit(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${Math.round(numeric * 100)}%`;
}

function formatWeightDelta(currentWeight, targetWeight) {
  const current = Number(currentWeight);
  const target = Number(targetWeight);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return "—";

  const delta = current - target;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${Math.round(delta * 100)} pts`;
}

function formatPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${Math.round(numeric * 100)} pts`;
}

function formatRebalanceInsight(insight, index) {
  const text = String(insight || "").trim();
  const fallback = {
    key: String(index + 1).padStart(2, "0"),
    eyebrow: "Signal",
    value: text,
    detail: null,
  };

  if (!text) {
    return fallback;
  }

  const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    const value = colonMatch[2].trim();
    const trailingMetricMatch = value.match(/^(.*)\s+\(([^)]+)\)$/);

    return {
      key: String(index + 1).padStart(2, "0"),
      eyebrow: label,
      value: trailingMetricMatch ? trailingMetricMatch[2].trim() : value,
      detail: trailingMetricMatch ? trailingMetricMatch[1].trim() : null,
    };
  }

  const leadingNumberMatch = text.match(/^(\d+)\s+(.+)$/);
  if (leadingNumberMatch) {
    return {
      key: String(index + 1).padStart(2, "0"),
      eyebrow: leadingNumberMatch[2].trim(),
      value: leadingNumberMatch[1].trim(),
      detail: null,
    };
  }

  return fallback;
}

function getUrgencyMeta(score, label) {
  const urgencyScore = clampUnit(score, 0);
  const normalizedLabel = String(label || "").toUpperCase();
  const fallbackLabel = urgencyScore >= 0.66 ? "HIGH" : urgencyScore >= 0.33 ? "MEDIUM" : "LOW";
  const urgencyLabel = ["LOW", "MEDIUM", "HIGH"].includes(normalizedLabel) ? normalizedLabel : fallbackLabel;

  if (urgencyLabel === "HIGH") {
    return {
      label: "High urgency",
      tone: {
        color: "var(--red)",
        border: "1px solid rgba(255,77,106,0.28)",
        background: "rgba(255,77,106,0.1)",
        boxShadow: "0 10px 24px rgba(255,77,106,0.12)",
      },
    };
  }

  if (urgencyLabel === "MEDIUM") {
    return {
      label: "Medium urgency",
      tone: {
        color: "#d18b12",
        border: "1px solid rgba(209,139,18,0.28)",
        background: "rgba(209,139,18,0.1)",
        boxShadow: "0 10px 24px rgba(209,139,18,0.12)",
      },
    };
  }

  return {
    label: "Low urgency",
    tone: {
      color: "var(--green)",
      border: "1px solid rgba(0,196,140,0.24)",
      background: "rgba(0,196,140,0.09)",
      boxShadow: "0 10px 24px rgba(0,196,140,0.1)",
    },
  };
}

function normalizeRebalanceView(data, basket) {
  const content = data?.rebalanceAnalysis?.content;
  const payload = parseRebalancePayload(content);

  const rawPositions =
    payload?.positions ||
    payload?.rebalances ||
    payload?.instructions ||
    payload?.rebalance_positions ||
    payload?.rebalanceInstructions ||
    [];

  const basketMarkets = Array.isArray(basket?.markets) ? basket.markets : [];

  const positions = (Array.isArray(rawPositions) ? rawPositions : [])
    .map((position) => {
      const marketName = position?.market || position?.question || position?.name || null;
      if (!marketName) return null;

      const basketEntry = basketMarkets.find((entry) => entry?.market === marketName);
      const currentWeight = clampUnit(position?.current_weight ?? basketEntry?.current_weight, 0);
      const targetWeight = clampUnit(position?.target_weight ?? basketEntry?.target_weight, 0);
      const driftPct = clampUnit(
        position?.drift_pct ??
        position?.driftPct ??
        Math.abs(currentWeight - targetWeight),
        Math.abs(currentWeight - targetWeight)
      );
      const adjustmentPct = clampUnit(
        position?.adjustment_pct ??
        position?.adjustmentPct ??
        position?.adjustment ??
        driftPct,
        driftPct
      );
      const direction = String(position?.direction || position?.action || "").toUpperCase() === "DECREASE"
        ? "DECREASE"
        : "INCREASE";

      return {
        market: marketName,
        platform: position?.platform || basketEntry?.platform || "Unknown",
        currentWeight,
        targetWeight,
        driftPct,
        adjustmentPct,
        direction,
        reason:
          typeof position?.reason === "string" && position.reason.trim().length > 0
            ? position.reason.trim()
            : `${direction === "DECREASE" ? "Trim" : "Add to"} this position to bring it back toward target weight.`,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  const positionByMarket = new Map(positions.map((position) => [position.market, position]));
  const basketBreakdown = basketMarkets
    .map((entry) => {
      const currentWeight = clampUnit(entry?.current_weight, 0);
      const targetWeight = clampUnit(entry?.target_weight, 0);
      const driftPct = Math.abs(currentWeight - targetWeight);
      const matchedPosition = positionByMarket.get(entry?.market);

      return {
        market: entry?.market || entry?.question || "Market",
        platform: entry?.platform || "Unknown",
        currentWeight,
        targetWeight,
        driftPct,
        adjustmentPct: matchedPosition?.adjustmentPct ?? driftPct,
        direction:
          matchedPosition?.direction ||
          (currentWeight > targetWeight ? "DECREASE" : "INCREASE"),
        reason:
          matchedPosition?.reason ||
          (driftPct >= 0.05
            ? currentWeight > targetWeight
              ? "Running above target weight and may need trimming."
              : "Running below target weight and may need topping up."
            : "Currently sitting close to target weight."),
        needsAction: driftPct >= 0.05,
      };
    })
    .sort((left, right) => right.driftPct - left.driftPct);

  const biggestDrift = basketBreakdown[0] || null;
  const driftedCount = basketBreakdown.filter((entry) => entry.needsAction).length;
  const fallbackInsights = [
    `${basketBreakdown.length} market${basketBreakdown.length === 1 ? "" : "s"} scanned across the basket`,
    biggestDrift ? `Largest drift: ${biggestDrift.market} (${formatPoints(biggestDrift.driftPct)})` : null,
    driftedCount > 0
      ? `${driftedCount} position${driftedCount === 1 ? "" : "s"} exceed the rebalance threshold`
      : "No positions exceed the rebalance threshold",
  ].filter(Boolean);

  const keyInsights = Array.isArray(payload?.key_insights)
    ? payload.key_insights
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0 && item.length <= 120)
        .slice(0, 3)
    : fallbackInsights;

  return {
    summary:
      typeof payload?.summary === "string" && payload.summary.trim().length > 0
        ? payload.summary.trim()
        : positions.length > 0
          ? `${positions.length} position${positions.length === 1 ? "" : "s"} need attention based on current basket drift.`
          : "Basket is close to target weights with no major rebalance signal.",
    urgencyScore: clampUnit(payload?.urgency_score, positions.length > 0 ? 0.55 : 0.18),
    urgencyLabel: payload?.urgency_label,
    keyInsights,
    positions,
    basketBreakdown,
    payload,
  };
}

export default function PanelBaskets({ progress, onStartProgress, onStopProgress, initialBasket, onBasketLoaded }) {
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

  // Handle initialBasket from "Create Basket" button
  useEffect(() => {
    if (!initialBasket || !initialBasket.markets || initialBasket.markets.length === 0) {
      return;
    }
    
    console.log("[PanelBaskets] Processing initialBasket:", initialBasket);
    
    // Load current baskets directly from localStorage to avoid stale state
    let currentStoredBaskets = [];
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      currentStoredBaskets = Array.isArray(raw) ? raw : [];
      console.log("[PanelBaskets] Loaded from localStorage:", currentStoredBaskets.length, "baskets");
    } catch (err) {
      console.error("[PanelBaskets] Failed to load from localStorage:", err);
    }
    
    const newBasket = toCustomBasket(initialBasket, currentStoredBaskets.length);
    console.log("[PanelBaskets] toCustomBasket returned:", newBasket);
    
    if (!newBasket) {
      console.error("[PanelBaskets] toCustomBasket returned null, not adding basket");
      if (onBasketLoaded) onBasketLoaded();
      return;
    }
    
    // Check if a basket with this name already exists and make it unique
    let uniqueName = newBasket.name;
    let counter = 2;
    while (currentStoredBaskets.some(b => {
      const bName = typeof b === 'object' && b !== null ? b.name : null;
      return bName === uniqueName;
    })) {
      uniqueName = `${newBasket.name} (${counter})`;
      counter++;
    }
    
    // Update basket name if it was changed
    if (uniqueName !== newBasket.name) {
      console.log("[PanelBaskets] Renamed basket from", newBasket.name, "to", uniqueName);
      newBasket.name = uniqueName;
    }
    
    // Add the new basket
    const updatedBaskets = [...currentStoredBaskets, newBasket];
    console.log("[PanelBaskets] Adding new basket, total now:", updatedBaskets.length);
    
    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedBaskets));
      console.log("[PanelBaskets] Updated baskets persisted to localStorage");
    } catch (err) {
      console.error("[PanelBaskets] Failed to persist basket:", err);
    }
    
    // Update state by converting to full basket objects
    const basketObjects = updatedBaskets.map((b, idx) => toCustomBasket(b, idx)).filter(Boolean);
    setCustomBaskets(basketObjects);
    console.log("[PanelBaskets] State updated with", basketObjects.length, "baskets");
    
    // Clear initialBasket from parent
    if (onBasketLoaded) {
      onBasketLoaded();
    }
  }, [initialBasket, onBasketLoaded]);

  const baskets = [...liveBaskets, ...customBaskets];
  const rebalanceView = useMemo(
    () => normalizeRebalanceView(rebalanceData, selectedBasket),
    [rebalanceData, selectedBasket]
  );

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
    const payload = parseRebalancePayload(data?.rebalanceAnalysis?.content);
    const parsedPositions =
      payload?.positions ||
      payload?.rebalances ||
      payload?.instructions ||
      payload?.rebalance_positions ||
      payload?.rebalanceInstructions ||
      [];

    if (Array.isArray(parsedPositions) && parsedPositions.length > 0) {
      return parsedPositions
        .map((position) => {
          const marketName = position?.market || position?.question || position?.name;
          if (!marketName) return null;

          const basketEntry = Array.isArray(basket?.markets)
            ? basket.markets.find((entry) => entry?.market === marketName || entry?.question === marketName)
            : null;

          const direction = String(position?.direction || position?.action || "").toUpperCase();
          const action = direction === "DECREASE" || direction === "SELL" ? "SELL" : "BUY";
          const currentWeight = Number(position?.current_weight ?? basketEntry?.current_weight ?? 0);
          const targetWeight = Number(position?.target_weight ?? basketEntry?.target_weight ?? 0.5);

          return {
            market: marketName,
            platform: position?.platform || basketEntry?.platform || "Polymarket",
            action,
            currentWeight: Number.isFinite(currentWeight) ? currentWeight : 0,
            targetWeight: Number.isFinite(targetWeight) ? targetWeight : 0.5,
            drift: (
              Math.abs(
                (Number.isFinite(currentWeight) ? currentWeight : 0) -
                (Number.isFinite(targetWeight) ? targetWeight : 0.5)
              ) * 100
            ).toFixed(1),
          };
        })
        .filter(Boolean);
    }

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
            Rebalancer Analysis: {selectedBasket?.name}
          </div>
          <div style={s.rebalanceHero}>
            <div style={s.rebalanceHeroBody}>
              <div style={s.rebalanceEyebrow}>Portfolio posture</div>
              <div style={s.rebalanceSummary}>{rebalanceView.summary}</div>
              {rebalanceView.keyInsights.length > 0 && (
                <div style={s.rebalanceInsightList}>
                  {rebalanceView.keyInsights.map((insight, idx) => {
                    const formattedInsight = formatRebalanceInsight(insight, idx);

                    return (
                      <div key={idx} style={s.rebalanceInsightItem}>
                        <div style={s.rebalanceInsightTop}>
                          <span style={s.rebalanceInsightIndex}>{formattedInsight.key}</span>
                          <span style={s.rebalanceInsightEyebrow}>{formattedInsight.eyebrow}</span>
                        </div>
                        <div style={s.rebalanceInsightValue}>{formattedInsight.value}</div>
                        {formattedInsight.detail ? (
                          <div style={s.rebalanceInsightDetail}>{formattedInsight.detail}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div
              style={{
                ...s.urgencyPill,
                ...getUrgencyMeta(rebalanceView.urgencyScore, rebalanceView.urgencyLabel).tone,
              }}
            >
              <div style={s.urgencyPillLabel}>
                {getUrgencyMeta(rebalanceView.urgencyScore, rebalanceView.urgencyLabel).label}
              </div>
              <div style={s.urgencyPillValue}>{formatPercent(rebalanceView.urgencyScore)}</div>
            </div>
          </div>

          {rebalanceView.basketBreakdown.length > 0 && (
            <div style={s.breakdownWrap}>
              <div style={s.breakdownHeader}>
                <div style={s.breakdownTitle}>Basket breakdown</div>
                <div style={s.breakdownMeta}>{rebalanceView.basketBreakdown.length} markets</div>
              </div>
              <div style={s.breakdownList}>
                {rebalanceView.basketBreakdown.map((position, idx) => (
                  <div
                    key={`${position.market}-${idx}`}
                    style={{
                      ...s.breakdownRow,
                      borderTop: idx === 0 ? "none" : s.breakdownRow.borderTop,
                      paddingTop: idx === 0 ? 0 : 14,
                    }}
                  >
                    <div style={s.breakdownMainRow}>
                      <div style={s.breakdownLeft}>
                        <div style={s.breakdownTopline}>
                          <span style={s.breakdownIndex}>#{idx + 1}</span>
                          <span style={s.breakdownPlatform}>{position.platform}</span>
                        </div>
                        <div style={s.breakdownMarket}>{position.market}</div>
                        <div style={s.breakdownReason}>{position.reason}</div>
                      </div>
                      <div style={s.breakdownStats}>
                        <div style={s.breakdownActualRow}>
                          <div style={s.breakdownStatBlock}>
                            <div style={s.breakdownStatLabel}>Current</div>
                            <div style={s.breakdownStatValue}>{formatPercent(position.currentWeight)}</div>
                          </div>
                          <div style={s.breakdownStatBlock}>
                            <div style={s.breakdownStatLabel}>Target</div>
                            <div style={s.breakdownStatValue}>{formatPercent(position.targetWeight)}</div>
                          </div>
                          <div style={s.breakdownStatBlock}>
                            <div style={s.breakdownStatLabel}>Drift</div>
                            <div style={s.breakdownStatValue}>{formatWeightDelta(position.currentWeight, position.targetWeight)}</div>
                          </div>
                          <div
                            style={{
                              ...s.breakdownActionPill,
                              ...(position.needsAction ? s.breakdownActionNeeded : s.breakdownActionStable),
                            }}
                          >
                            {position.needsAction
                              ? position.direction === "DECREASE"
                                ? "Trim"
                                : "Add"
                              : "On target"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={s.breakdownTradeBar}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.breakdownTradeLabel}>Proposed trade</div>
                        <div style={s.tradePlatform}>{position.platform}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            ...s.tradeAction,
                            color: position.needsAction
                              ? position.direction === "DECREASE"
                                ? "var(--red)"
                                : "var(--green)"
                              : "var(--text-dim)",
                          }}
                        >
                          {position.needsAction
                            ? position.direction === "DECREASE"
                              ? "SELL"
                              : "BUY"
                            : "HOLD"}
                        </div>
                        <div style={s.tradeWeight}>
                          {position.needsAction
                            ? `${formatPercent(position.currentWeight)} → ${formatPercent(position.targetWeight)}`
                            : "No adjustment needed"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {proposedTrades.length > 0 && !executionResult && (
            <div style={s.rebalanceActionBar}>
              <div>
                <div style={s.rebalanceActionTitle}>Execution ready</div>
                <div style={s.rebalanceActionMeta}>
                  {proposedTrades.length} proposed trade{proposedTrades.length === 1 ? "" : "s"} embedded in the basket breakdown
                </div>
              </div>
              <div style={s.rebalanceActionControls}>
                {wallet ? (
                  <button
                    onClick={handleExecuteRebalance}
                    disabled={isExecuting}
                    style={{
                      ...s.executeBtn,
                      width: "auto",
                      minWidth: 220,
                      opacity: isExecuting ? 0.6 : 1,
                      cursor: isExecuting ? "default" : "pointer",
                    }}
                  >
                    {isExecuting ? "Executing..." : "Execute Rebalance"}
                  </button>
                ) : (
                  <div style={s.walletPromptInline}>Connect wallet to execute rebalance</div>
                )}
              </div>
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
  rebalanceHero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
    padding: "18px 20px",
    background: "var(--surface)",
    border: "none",
    borderRadius: 16,
    marginBottom: 16,
  },
  rebalanceHeroBody: {
    flex: 1,
    minWidth: 0,
  },
  rebalanceEyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    marginBottom: 8,
    fontFamily: "'DM Mono',monospace",
  },
  rebalanceSummary: {
    fontSize: 22,
    lineHeight: 1.2,
    fontWeight: 700,
    color: "var(--text)",
    maxWidth: 760,
  },
  rebalanceInsightList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    marginTop: 18,
  },
  rebalanceInsightItem: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 112,
    padding: "16px 18px",
    borderRadius: 18,
    border: "1px solid rgba(26,92,255,0.16)",
    background: "rgba(255,255,255,0.82)",
    boxShadow: "0 14px 32px rgba(26,92,255,0.06)",
    color: "var(--text)",
  },
  rebalanceInsightTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  rebalanceInsightIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
    height: 24,
    padding: "0 8px",
    borderRadius: 999,
    background: "rgba(26,92,255,0.1)",
    border: "1px solid rgba(26,92,255,0.16)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--blue)",
    fontFamily: "'DM Mono',monospace",
    flexShrink: 0,
  },
  rebalanceInsightEyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
  },
  rebalanceInsightValue: {
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  rebalanceInsightDetail: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-mid)",
  },
  urgencyPill: {
    minWidth: 154,
    borderRadius: 18,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexShrink: 0,
  },
  urgencyPillLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: "'DM Mono',monospace",
    opacity: 0.8,
    marginBottom: 0,
    whiteSpace: "nowrap",
  },
  urgencyPillValue: {
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  breakdownWrap: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "16px 18px",
    marginBottom: 14,
  },
  breakdownHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },
  breakdownMeta: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
  },
  breakdownList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  breakdownRow: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "14px 0",
    borderTop: "1px solid var(--border2)",
  },
  breakdownMainRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
  },
  breakdownLeft: {
    flex: 1,
    minWidth: 0,
  },
  breakdownTopline: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  breakdownIndex: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
  },
  breakdownPlatform: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--blue)",
    fontFamily: "'DM Mono',monospace",
  },
  breakdownMarket: {
    fontSize: 15,
    lineHeight: 1.3,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 6,
  },
  breakdownReason: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-mid)",
    maxWidth: 700,
  },
  breakdownStats: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
    minWidth: 360,
  },
  breakdownActualRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  breakdownStatBlock: {
    minWidth: 76,
    textAlign: "right",
  },
  breakdownStatLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
    marginBottom: 5,
  },
  breakdownStatValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },
  breakdownActionPill: {
    padding: "8px 11px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "'DM Mono',monospace",
    whiteSpace: "nowrap",
  },
  breakdownActionNeeded: {
    color: "var(--red)",
    background: "rgba(255,77,106,0.1)",
    border: "1px solid rgba(255,77,106,0.22)",
  },
  breakdownActionStable: {
    color: "var(--green)",
    background: "rgba(0,196,140,0.1)",
    border: "1px solid rgba(0,196,140,0.22)",
  },
  breakdownTradeBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    background: "rgba(26,92,255,0.04)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  },
  breakdownTradeLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: "var(--text-dim)",
    fontFamily: "'DM Mono',monospace",
  },
  rebalanceActionBar: {
    marginTop: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "16px 18px",
    borderRadius: 16,
    border: "1px solid rgba(26,92,255,0.14)",
    background: "rgba(26,92,255,0.05)",
  },
  rebalanceActionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 4,
  },
  rebalanceActionMeta: {
    fontSize: 12,
    color: "var(--text-dim)",
  },
  rebalanceActionControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  walletPromptInline: {
    fontSize: 12,
    color: "var(--text-dim)",
    textAlign: "right",
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
