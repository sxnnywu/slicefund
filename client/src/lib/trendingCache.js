const STORAGE_PREFIX = "slicefund_trending_cache_v1_";
const PLATFORMS = ["polymarket", "kalshi", "manifold"];

const memoryCache = Object.create(null);
const inFlightRequests = Object.create(null);

function getStorageKey(platform) {
  return `${STORAGE_PREFIX}${platform}`;
}

function readStored(platform) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(platform));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.markets)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStored(platform, payload) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getStorageKey(platform), JSON.stringify(payload));
  } catch {
    // Ignore storage failures and keep the in-memory copy.
  }
}

export function getCachedTrending(platform) {
  if (memoryCache[platform]) return memoryCache[platform];

  const stored = readStored(platform);
  if (stored) {
    memoryCache[platform] = stored;
    return stored;
  }

  return null;
}

export async function getTrendingPlatform(platform, { force = false } = {}) {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  if (!force) {
    const cached = getCachedTrending(platform);
    if (cached) return cached;
  }

  if (inFlightRequests[platform]) {
    return inFlightRequests[platform];
  }

  inFlightRequests[platform] = (async () => {
    const response = await fetch(`/api/${platform}/trending`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load ${platform} trending markets`);
    }

    const snapshot = {
      ...payload,
      fetchedAt: new Date().toISOString(),
    };

    memoryCache[platform] = snapshot;
    writeStored(platform, snapshot);
    return snapshot;
  })();

  try {
    return await inFlightRequests[platform];
  } finally {
    inFlightRequests[platform] = null;
  }
}

export async function getAllTrending(options) {
  const [polymarket, kalshi, manifold] = await Promise.all([
    getTrendingPlatform("polymarket", options),
    getTrendingPlatform("kalshi", options),
    getTrendingPlatform("manifold", options),
  ]);

  return { polymarket, kalshi, manifold };
}
