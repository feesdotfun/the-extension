// Pyth Network SOL/USD price feed
const SOL_USD_FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const CACHE_DURATION = 30_000; // 30 seconds

let cachedPrice: number | null = null;
let lastFetched = 0;

interface PythPriceFeed {
  id: string;
  price: {
    price: string;
    expo: number;
  };
}

export async function fetchSolPrice(): Promise<number> {
  const now = Date.now();
  if (cachedPrice !== null && now - lastFetched < CACHE_DURATION) {
    return cachedPrice;
  }

  try {
    const url = `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${SOL_USD_FEED_ID}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Pyth API ${res.status}`);

    const data: PythPriceFeed[] = await res.json();
    if (!data || data.length === 0) throw new Error("No price data");

    const feed = data[0];
    const rawPrice = parseInt(feed.price.price, 10);
    const expo = feed.price.expo;
    const price = rawPrice * Math.pow(10, expo);

    cachedPrice = price;
    lastFetched = now;
    return price;
  } catch {
    // Return cached or fallback
    return cachedPrice ?? 150;
  }
}

/**
 * Format a number as USD: $1,234.56
 */
export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
