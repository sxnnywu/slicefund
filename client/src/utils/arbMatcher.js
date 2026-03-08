/* ── price extraction (handles all 3 platforms) ──────── */

export function extractPrice(market) {
  if (typeof market.probability === "number" && market.probability > 0 && market.probability <= 1)
    return market.probability;
  if (typeof market.yes_price === "number" && market.yes_price > 0)
    return market.yes_price <= 1 ? market.yes_price : market.yes_price / 100;
  let prices = market.outcomePrices;
  if (typeof prices === "string") {
    try { prices = JSON.parse(prices); } catch { prices = null; }
  }
  if (Array.isArray(prices) && prices.length > 0) {
    const first = Number(prices[0]);
    if (Number.isFinite(first) && first > 0) return first <= 1 ? first : first / 100;
  }
  if (typeof market.bestBid === "number" && market.bestBid > 0)
    return market.bestBid <= 1 ? market.bestBid : market.bestBid / 100;
  if (typeof market.lastPrice === "number" && market.lastPrice > 0)
    return market.lastPrice <= 1 ? market.lastPrice : market.lastPrice / 100;
  if (typeof market.lastTradePrice === "number" && market.lastTradePrice > 0)
    return market.lastTradePrice <= 1 ? market.lastTradePrice : market.lastTradePrice / 100;
  return null;
}

/* ── fingerprint: extract what the question is REALLY about ── */

/**
 * Extracts a normalized "fingerprint" from a question — the core subject,
 * event, entity, and action. Two questions match ONLY if their fingerprints
 * share the same subject AND action/event.
 *
 * e.g. "Will Italy qualify for the 2026 FIFA World Cup?"
 *   → { subject: "italy", event: "2026 fifa world cup", action: "qualify" }
 *
 * "Fairfield at Siena Winner?"
 *   → { subject: "fairfield siena", event: null, action: "winner" }
 */

// Well-known event patterns
const EVENT_PATTERNS = [
  /(\d{4})\s*(fifa\s*world\s*cup)/i,
  /(\d{4})\s*(olympic[s]?)/i,
  /(\d{4})\s*(super\s*bowl)/i,
  /(\d{4})\s*(world\s*series)/i,
  /(\d{4})\s*(nba\s*finals)/i,
  /(\d{4})\s*(stanley\s*cup)/i,
  /(presidential|general)\s*election\s*(\d{4})?/i,
  /(\d{4})\s*(midterm|election)/i,
  /(fed|federal\s*reserve).*?(rate|cut|hike)/i,
  /(bitcoin|btc|ethereum|eth).*?(price|\$|hit|reach|exceed)/i,
  /(recession|gdp|inflation|unemployment).*?(\d{4})/i,
];

// Sport/League detection to prevent cross-sport matches
const SPORT_LEAGUES = {
  basketball: /\b(nba|ncaa basketball|march madness|final four)\b/i,
  football: /\b(nfl|ncaa football|super bowl|college football|uab|uic)\b/i,
  soccer: /\b(fifa|world cup|premier league|la liga|uefa|champions league|mls)\b/i,
  hockey: /\b(nhl|stanley cup|ice hockey|islanders)\b/i,
  baseball: /\b(mlb|world series|baseball)\b/i,
  cricket: /\b(ipl|t20|test cricket|odi|cricket|rcb|csk|mi|kkr)\b/i,
  tennis: /\b(wimbledon|us open|french open|australian open|atp|wta|tennis)\b/i,
  golf: /\b(pga|masters|us open golf|golf)\b/i,
};

// Generic sports patterns - if no specific league detected but mentions "points"
const GENERIC_SPORTS_KEYWORDS = /\b(points|score|goals|runs|wickets|yards|touchdown|field goal)\b/i;

// Action words that define WHAT is being asked
const ACTION_WORDS = [
  "qualify", "win", "winner", "wins", "elected", "election", "resign", "impeach",
  "ban", "banned", "boycott", "participate", "visit", "invade", "annex",
  "cut", "hike", "raise", "lower", "hit", "reach", "exceed", "drop",
  "approve", "pass", "sign", "veto", "ratify", "default", "collapse",
  "beat", "lose", "defeat", "score", "champion", "prize", "award",
];

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "will", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "shall", "should",
  "may", "might", "can", "could", "would", "of", "in", "to", "for",
  "with", "on", "at", "from", "by", "about", "as", "into", "through",
  "during", "before", "after", "between", "and", "but", "or", "not",
  "no", "so", "if", "then", "than", "this", "that", "it", "its",
  "they", "them", "we", "our", "he", "she", "his", "her", "who",
  "what", "which", "when", "where", "how", "yes", "get", "any", "end",
  "over", "under", "reach", "make", "take", "points", "point", "total",
  "game", "match", "contest", "high", "low", "liquidity",
]);

function extractFingerprint(question) {
  const q = String(question || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // Extract year
  const yearMatch = q.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  // Extract sport/league
  let sport = null;
  for (const [sportName, pattern] of Object.entries(SPORT_LEAGUES)) {
    if (pattern.test(q)) {
      sport = sportName;
      break;
    }
  }

  // Extract known event
  let event = null;
  for (const pattern of EVENT_PATTERNS) {
    const m = q.match(pattern);
    if (m) {
      event = m[0].replace(/\s+/g, " ").trim();
      break;
    }
  }

  // Extract action
  let action = null;
  for (const word of ACTION_WORDS) {
    if (q.includes(word)) {
      action = word;
      break;
    }
  }

  // Extract subject — meaningful words minus stop words, event words, and action words
  const eventWords = new Set((event || "").split(/\s+/));
  const tokens = q.split(/\s+/).filter((w) =>
    w.length > 2 &&
    !STOP_WORDS.has(w) &&
    !eventWords.has(w) &&
    w !== action &&
    w !== year &&
    !/^\d+$/.test(w)
  );
  const subject = tokens.join(" ");

  return { subject, event, action, year, sport, raw: q };
}

/**
 * Score similarity using fingerprints. Two questions must share:
 * 1. At least 2 significant subject words (entity/person/country) - REQUIRED
 * 2. Same action type OR same event - REQUIRED (at least one)
 * 3. Same year (if both have years)
 *
 * This prevents false matches like "Illinois wins" vs "Trump Nobel Prize"
 */
export function scoreSimilarity(questionA, questionB) {
  const fpA = extractFingerprint(questionA);
  const fpB = extractFingerprint(questionB);

  // Detect head-to-head matches vs tournament winners
  // "Italy vs Mexico" is NOT the same as "Will Mexico win the World Cup?"
  const hasVsA = /\bvs\b|\bversus\b|@/i.test(questionA);
  const hasVsB = /\bvs\b|\bversus\b|@/i.test(questionB);
  if (hasVsA !== hasVsB) {
    return { score: 0, reason: "Different question types (match vs tournament)" };
  }

  // Sport mismatch = instant reject
  // "Illinois wins" (basketball) should NOT match "RCB wins IPL" (cricket)
  if (fpA.sport && fpB.sport && fpA.sport !== fpB.sport) {
    return { score: 0, reason: `Different sports (${fpA.sport} vs ${fpB.sport})` };
  }

  // Detect if question is about generic sports (has "points", "score", etc.)
  const isGenericSportsA = !fpA.sport && GENERIC_SPORTS_KEYWORDS.test(fpA.raw);
  const isGenericSportsB = !fpB.sport && GENERIC_SPORTS_KEYWORDS.test(fpB.raw);

  // If one is cricket and other is generic sports or different sport, reject
  if (fpA.sport === 'cricket' && (isGenericSportsB || fpB.sport)) {
    if (!fpB.raw.match(/\b(ipl|t20|cricket|rcb|csk|mi|kkr)\b/i)) {
      return { score: 0, reason: "Different sports (cricket vs non-cricket)" };
    }
  }
  if (fpB.sport === 'cricket' && (isGenericSportsA || fpA.sport)) {
    if (!fpA.raw.match(/\b(ipl|t20|cricket|rcb|csk|mi|kkr)\b/i)) {
      return { score: 0, reason: "Different sports (non-cricket vs cricket)" };
    }
  }

  // Same for hockey
  if (fpA.sport === 'hockey' && (isGenericSportsB || fpB.sport)) {
    if (!fpB.raw.match(/\b(nhl|stanley cup|ice hockey|islanders)\b/i)) {
      return { score: 0, reason: "Different sports (hockey vs non-hockey)" };
    }
  }
  if (fpB.sport === 'hockey' && (isGenericSportsA || fpA.sport)) {
    if (!fpA.raw.match(/\b(nhl|stanley cup|ice hockey|islanders)\b/i)) {
      return { score: 0, reason: "Different sports (non-hockey vs hockey)" };
    }
  }

  // Same for soccer
  if (fpA.sport === 'soccer' && (isGenericSportsB || fpB.sport)) {
    if (!fpB.raw.match(/\b(fifa|world cup|soccer|football)\b/i)) {
      return { score: 0, reason: "Different sports (soccer vs non-soccer)" };
    }
  }
  if (fpB.sport === 'soccer' && (isGenericSportsA || fpA.sport)) {
    if (!fpA.raw.match(/\b(fifa|world cup|soccer|football)\b/i)) {
      return { score: 0, reason: "Different sports (non-soccer vs soccer)" };
    }
  }

  // Year mismatch = instant reject
  if (fpA.year && fpB.year && fpA.year !== fpB.year) {
    return { score: 0, reason: "Different years" };
  }

  // Subject overlap — the most important signal
  const subjectWordsA = new Set(fpA.subject.split(/\s+/).filter((w) => w.length > 2));
  const subjectWordsB = new Set(fpB.subject.split(/\s+/).filter((w) => w.length > 2));

  let subjectOverlap = 0;
  const sharedSubjects = [];
  for (const w of subjectWordsA) {
    if (subjectWordsB.has(w)) {
      subjectOverlap++;
      sharedSubjects.push(w);
    }
  }

  // Event match
  const eventMatch = fpA.event && fpB.event &&
    fpA.event.replace(/\d+/g, "").trim() === fpB.event.replace(/\d+/g, "").trim();

  // Action match - check if both have same action word
  let actionMatch = fpA.action && fpB.action && fpA.action === fpB.action;
  if (!actionMatch && fpA.raw && fpB.raw) {
    // Check if both contain the same action word
    for (const word of ACTION_WORDS) {
      if (fpA.raw.includes(word) && fpB.raw.includes(word)) {
        actionMatch = true;
        break;
      }
    }
  }

  // SMART REQUIREMENT: Allow different levels of strictness
  // High confidence: 2+ shared subjects
  // Medium confidence: 1 subject + (event OR action match)
  // This prevents "Illinois wins" from matching "Trump Nobel Prize"
  // but allows "Trump impeached" to match "Trump impeachment"

  if (subjectOverlap >= 2) {
    // High confidence - 2+ shared subjects, don't need event/action match
  } else if (subjectOverlap === 1 && (eventMatch || actionMatch)) {
    // Medium confidence - 1 subject but event or action matches
  } else {
    // Reject - not enough overlap
    return { score: 0, reason: "Insufficient overlap" };
  }

  // Score: subject overlap is the base, event/action matches are bonuses
  const minSubjects = Math.min(subjectWordsA.size, subjectWordsB.size) || 1;
  const subjectScore = subjectOverlap / minSubjects;

  let score = subjectScore * 0.4;
  if (eventMatch) score += 0.35;
  if (actionMatch) score += 0.25;

  // Boost score if there are many shared subjects
  if (subjectOverlap >= 3) score += 0.15;

  // Perfect subject match gets bonus
  if (subjectOverlap === subjectWordsA.size && subjectOverlap === subjectWordsB.size) {
    score += 0.1;
  }

  // Cap at 1.0
  score = Math.min(score, 1.0);

  const reason = [
    `subjects: ${sharedSubjects.slice(0, 3).join(", ")}`,
    eventMatch ? `event: ${fpA.event}` : null,
    actionMatch ? `action: ${fpA.action || "match"}` : null,
  ].filter(Boolean).join(" · ");

  return { score, reason };
}

/* ── find cross-platform arb pairs ───────────────────── */

export function findArbPairs(marketsA, marketsB, options = {}) {
  const {
    minSimilarity = 0.4,
    maxPairs = 30,
    minSpread = 0.02,
  } = options;

  const pairs = [];

  for (const mA of marketsA) {
    for (const mB of marketsB) {
      if ((mA.platform || "unknown") === (mB.platform || "unknown")) continue;

      const questionA = mA.question || mA.title || "";
      const questionB = mB.question || mB.title || "";
      if (!questionA || !questionB) continue;

      const { score, reason } = scoreSimilarity(questionA, questionB);
      if (score < minSimilarity) continue;

      const priceA = extractPrice(mA);
      const priceB = extractPrice(mB);
      if (priceA === null || priceB === null) continue;
      if (priceA <= 0.005 || priceB <= 0.005) continue;
      if (priceA > 0.995 && priceB > 0.995) continue;

      const spread = Math.abs(priceA - priceB);
      if (spread < minSpread) continue;

      pairs.push({
        marketA: mA,
        marketB: mB,
        questionA,
        questionB,
        priceA,
        priceB,
        spread,
        similarity: score,
        similarityReason: reason,
      });
    }
  }

  pairs.sort((a, b) => (b.spread * b.similarity) - (a.spread * a.similarity));
  return pairs.slice(0, maxPairs);
}
