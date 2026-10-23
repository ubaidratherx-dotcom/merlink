import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

/**
 * Demo traders: sample sellers with listings and a completed-trade history.
 * Used by scripts/seed-demo.ts and, when DEMO_MODE=true, generated on demand
 * around any location a visitor searches from, so Discover always has
 * something nearby to show.
 */

export const DEMO_DOMAIN = "@demo.merlink";
const DEMO_PASSWORD = "Demo@123";

const HANDLES = [
  "satoshi_sol", "degen_dave", "moonbag_mia", "whale_walt", "ape_aria",
  "hodl_hank", "ledger_lex", "frens_finn", "gwei_gabe", "stable_stella",
  "vault_vera", "chain_chad", "node_nora", "yield_yuki", "block_bea",
  "alpha_ade", "sushi_sam", "lambo_leo", "pump_pat", "diamond_dee",
  "phantom_phil", "solflare_sky", "anchor_ann", "raydium_ray", "orca_omar",
  "jupiter_jin", "metaplex_max", "serum_sara", "drift_drew", "tensor_tess",
  "magic_mara", "backpack_ben", "helius_hugo", "marinade_mae", "bonk_bri",
];

export const DEMO_ASSETS = [
  { asset: "USDC", chain: "solana", price: 1.0, spread: 0.01, min: 50, max: 5000, liq: 12000 },
  { asset: "USDT", chain: "solana", price: 1.0, spread: 0.01, min: 50, max: 4000, liq: 9000 },
  { asset: "SOL", chain: "solana", price: 152, spread: 4, min: 0.5, max: 60, liq: 220 },
  { asset: "ETH", chain: "ethereum", price: 3180, spread: 60, min: 0.05, max: 5, liq: 14 },
  { asset: "BTC", chain: "bitcoin", price: 64200, spread: 900, min: 0.005, max: 0.5, liq: 1.4 },
] as const;
type DemoAsset = (typeof DEMO_ASSETS)[number];

const PAYMENTS = ["BANK_TRANSFER", "CASH", "WISE", "REVOLUT", "MOBILE_MONEY", "PAYPAL"] as const;
const TRADE_TYPES = ["IN_PERSON", "BOTH", "BOTH", "REMOTE"] as const; // weight toward in-person

const BIOS = [
  "Trusted local {asset} trader. Fast & friendly meetups.",
  "Buying and selling {asset} around {city} since 2024. Cash or bank, your call.",
  "{city} based. Quick replies, escrow every time, no drama.",
  "OTC desk vibes without the desk. {asset} in {city}, same-day.",
  "Happy to meet anywhere central in {city}. Verified and will show ID.",
];

const COMMENTS = [
  "Smooth trade, released as soon as the transfer landed.",
  "Met at the mall, done in ten minutes. Would trade again.",
  "Quick to reply and very patient with my first trade.",
  "Exactly as listed. Escrow made it stress free.",
  "Fair price, fast release. Recommended.",
  "Bit slow to confirm but all good in the end.",
  "Great communication throughout.",
  "Legit trader, no issues at all.",
];

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
function sample<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function jitter(lat: number, lng: number, km: number) {
  const r = rand(0.3, km) / 111;
  const t = rand(0, 2 * Math.PI);
  return { lat: lat + r * Math.cos(t), lng: lng + (r * Math.sin(t)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)) };
}
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);
function fakeSolAddr(seed: number) {
  const c = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = ""; let x = (seed * 2654435761) % 2 ** 31;
  for (let i = 0; i < 44; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += c[x % c.length]; }
  return s;
}
const suffix = () => Math.random().toString(36).slice(2, 5);

export interface DemoSeller { id: string; asset: DemoAsset; listingId: string; createdAt: Date }

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Count demo sellers inside a square of ±km around a point (cheap bounding box). */
export async function countDemoSellersNear(lat: number, lng: number, km = 15): Promise<number> {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return prisma.user.count({
    where: {
      email: { endsWith: DEMO_DOMAIN },
      sellerMode: true,
      latitude: { gte: lat - dLat, lte: lat + dLat },
      longitude: { gte: lng - dLng, lte: lng + dLng },
    },
  });
}

/** Create demo sellers with one active listing each, scattered within radiusKm of a point. */
export async function createDemoTradersNear(opts: {
  lat: number; lng: number; count: number; city?: string; radiusKm?: number;
}): Promise<DemoSeller[]> {
  const city = opts.city || "the area";
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const handles = sample(HANDLES, Math.min(opts.count, HANDLES.length));
  const out: DemoSeller[] = [];

  for (let i = 0; i < opts.count; i++) {
    const base = handles[i % handles.length];
    const spot = jitter(opts.lat, opts.lng, opts.radiusKm ?? 9);
    const a = pick(DEMO_ASSETS);
    const priceValue = +(a.price + rand(-a.spread, a.spread)).toFixed(a.price < 5 ? 3 : 2);
    const createdAt = daysAgo(randInt(20, 400));

    for (let attempt = 0; attempt < 3; attempt++) {
      const username = `${base}_${suffix()}`;
      try {
        const seller = await prisma.user.create({
          data: {
            username,
            email: `${username}${DEMO_DOMAIN}`,
            passwordHash,
            authProvider: "EMAIL",
            accountStatus: "PHONE_VERIFIED",
            kycStatus: "VERIFIED",
            sellerMode: true,
            walletAddress: fakeSolAddr(Date.now() % 100000 + i),
            walletVerified: true,
            bio: pick(BIOS).replace("{asset}", a.asset).replace("{city}", city),
            latitude: spot.lat,
            longitude: spot.lng,
            createdAt,
            listings: {
              create: {
                asset: a.asset as any,
                chain: a.chain,
                priceType: "FIXED",
                priceValue,
                minAmount: a.min,
                maxAmount: a.max,
                paymentMethods: sample(PAYMENTS, 1 + Math.floor(Math.random() * 3)) as any,
                tradeType: pick(TRADE_TYPES) as any,
                availableLiquidity: a.liq,
                isActive: true,
                latitude: spot.lat,
                longitude: spot.lng,
              },
            },
          },
          include: { listings: { select: { id: true } } },
        });
        out.push({ id: seller.id, asset: a, listingId: seller.listings[0].id, createdAt });
        break;
      } catch (err: any) {
        if (err?.code !== "P2002" || attempt === 2) throw err; // retry only on username collision
      }
    }
  }
  return out;
}

/** Completed trades between the given demo sellers, plus reviews, so profiles look lived-in. */
export async function createDemoHistory(sellers: DemoSeller[]): Promise<{ trades: number; reviews: number }> {
  let trades = 0; let reviews = 0;
  if (sellers.length < 2) return { trades, reviews };

  for (const s of sellers) {
    const n = randInt(2, 14);
    const maxAge = Math.min(90, Math.max(2, Math.floor((Date.now() - s.createdAt.getTime()) / 86400000) - 1));
    const rows = Array.from({ length: n }, () => {
      const buyer = pick(sellers.filter((o) => o.id !== s.id));
      const created = daysAgo(rand(1, maxAge));
      return {
        buyerId: buyer.id,
        sellerId: s.id,
        listingId: s.listingId,
        asset: s.asset.asset as any,
        amount: +rand(s.asset.min, Math.min(s.asset.max, s.asset.min * 20)).toFixed(s.asset.price > 100 ? 4 : 2),
        price: +(s.asset.price + rand(-s.asset.spread, s.asset.spread)).toFixed(2),
        paymentMethod: pick(PAYMENTS) as any,
        tradeType: pick(["IN_PERSON", "REMOTE"]) as any,
        chain: s.asset.chain,
        status: "COMPLETED" as any,
        protocolFee: 0,
        createdAt: created,
        updatedAt: new Date(created.getTime() + randInt(10, 120) * 60000),
      };
    });
    const made = await prisma.trade.createManyAndReturn({ data: rows, select: { id: true, buyerId: true, createdAt: true } });
    trades += made.length;
    const rv = made
      .filter(() => Math.random() < 0.8)
      .map((t) => ({
        tradeId: t.id,
        reviewerId: t.buyerId,
        revieweeId: s.id,
        rating: Math.random() < 0.08 ? 3 : Math.random() < 0.55 ? 5 : 4,
        comment: Math.random() < 0.85 ? pick(COMMENTS) : null,
        createdAt: new Date(t.createdAt.getTime() + randInt(30, 600) * 60000),
      }));
    if (rv.length) {
      await prisma.review.createMany({ data: rv });
      reviews += rv.length;
    }
  }
  return { trades, reviews };
}

/** Remove every demo user and everything attached to them. Returns the number of users removed. */
export async function wipeDemoData(): Promise<number> {
  const ids = (await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } })).map((u) => u.id);
  if (ids.length === 0) return 0;
  const tradeIds = (await prisma.trade.findMany({
    where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] }, select: { id: true },
  })).map((t) => t.id);
  if (tradeIds.length) {
    await prisma.review.deleteMany({ where: { tradeId: { in: tradeIds } } });
    await prisma.tradeStateLog.deleteMany({ where: { tradeId: { in: tradeIds } } });
    await prisma.chatMessage.deleteMany({ where: { tradeId: { in: tradeIds } } });
    await prisma.trade.deleteMany({ where: { id: { in: tradeIds } } });
  }
  await prisma.review.deleteMany({ where: { OR: [{ reviewerId: { in: ids } }, { revieweeId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades listings
  return ids.length;
}

// ---------------------------------------------------------------------------
// On-demand fill: make sure a searched location has demo traders around it
// ---------------------------------------------------------------------------

const MIN_NEARBY = 6;
const FILL_COUNT = 10;
const inflight = new Map<string, Promise<void>>();

export async function ensureDemoTradersNear(lat: number, lng: number): Promise<void> {
  if (!isDemoMode() || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`; // ~11 km cells
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const nearby = await countDemoSellersNear(lat, lng, 15);
    if (nearby >= MIN_NEARBY) return;
    const sellers = await createDemoTradersNear({ lat, lng, count: FILL_COUNT, radiusKm: 8 });
    const history = await createDemoHistory(sellers);
    console.log(`[demo] filled ${sellers.length} traders near ${key} (${history.trades} trades, ${history.reviews} reviews)`);
  })()
    .catch((err) => console.error("[demo] fill failed:", err))
    .finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}
