// Price feed service — fetches real-time crypto prices from CoinGecko
// Caches for 60 seconds to stay under rate limits

interface PriceCache {
  prices: Record<string, number>;
  timestamp: number;
}

const CACHE_TTL = 60_000; // 60 seconds
let cache: PriceCache | null = null;

const COINGECKO_IDS: Record<string, string> = {
  SOL: "solana",
  ETH: "ethereum",
  BTC: "bitcoin",
  USDC: "usd-coin",
  USDT: "tether",
};

async function fetchPrices(): Promise<Record<string, number>> {
  // Return cache if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.prices;
  }

  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );

    if (!res.ok) {
      console.error("[price] CoinGecko API error:", res.status);
      return cache?.prices || getDefaults();
    }

    const data = await res.json();

    const prices: Record<string, number> = {};
    for (const [asset, geckoId] of Object.entries(COINGECKO_IDS)) {
      prices[asset] = data[geckoId]?.usd || 0;
    }

    cache = { prices, timestamp: Date.now() };
    return prices;
  } catch (err) {
    console.error("[price] Failed to fetch prices:", err);
    return cache?.prices || getDefaults();
  }
}

function getDefaults(): Record<string, number> {
  return { SOL: 0, ETH: 0, BTC: 0, USDC: 1, USDT: 1 };
}

async function getPrice(asset: string): Promise<number> {
  const prices = await fetchPrices();
  return prices[asset] || 0;
}

async function getAllPrices(): Promise<Record<string, number>> {
  return fetchPrices();
}

/**
 * Calculate the actual USD price for a listing.
 * - FIXED: priceValue is the USD price
 * - MARKET_PLUS: marketPrice * (1 + priceValue/100)
 * - MARKET_MINUS: marketPrice * (1 - priceValue/100)
 */
async function calculateListingPrice(
  asset: string,
  priceType: string,
  priceValue: number
): Promise<number> {
  if (priceType === "FIXED") return priceValue;

  const marketPrice = await getPrice(asset);
  if (marketPrice === 0) return priceValue; // fallback if no price

  if (priceType === "MARKET_PLUS") {
    return marketPrice * (1 + priceValue / 100);
  }
  if (priceType === "MARKET_MINUS") {
    return marketPrice * (1 - priceValue / 100);
  }

  return priceValue;
}

export const priceService = {
  getPrice,
  getAllPrices,
  calculateListingPrice,
};
