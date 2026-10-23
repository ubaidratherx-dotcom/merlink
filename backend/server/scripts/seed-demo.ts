/**
 * Demo seeder.
 *  - Upserts the main demo account (MAIN_EMAIL / MAIN_PASSWORD), KYC-verified so it can trade.
 *  - Seeds demo sellers (@demo.merlink) with active listings clustered around one or more city
 *    centres, plus a completed-trade history with reviews so profiles look lived-in.
 *
 * Centres (in priority order):
 *   1. CENTERS="lat,lng,Name;lat,lng,Name"   several cities
 *   2. LAT / LNG                               one city
 *   3. The main user's saved location
 *   4. Default: Dubai, London, New York, Singapore
 *
 * Re-runnable: wipes previous demo users and everything attached to them first.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MAIN_EMAIL = process.env.MAIN_EMAIL || "ubaidratherx@gmail.com";
const MAIN_PASSWORD = process.env.MAIN_PASSWORD || "Money@123";
const MAIN_USERNAME = "ubaid";
const DEMO_DOMAIN = "@demo.merlink";
const SELLER_COUNT = parseInt(process.env.SELLER_COUNT || "30", 10);

const DEFAULT_CENTERS = [
  { lat: 25.2048, lng: 55.2708, name: "Dubai" },
  { lat: 51.5074, lng: -0.1278, name: "London" },
  { lat: 40.7128, lng: -74.006, name: "New York" },
  { lat: 1.3521, lng: 103.8198, name: "Singapore" },
];

// crypto-flavoured handles for believable trader names
const HANDLES = [
  "satoshi_sol", "degen_dave", "moonbag_mia", "whale_walt", "ape_aria",
  "hodl_hank", "ledger_lex", "frens_finn", "gwei_gabe", "stable_stella",
  "vault_vera", "chain_chad", "node_nora", "yield_yuki", "block_bea",
  "alpha_ade", "sushi_sam", "lambo_leo", "pump_pat", "diamond_dee",
  "phantom_phil", "solflare_sky", "anchor_ann", "raydium_ray", "orca_omar",
  "jupiter_jin", "metaplex_max", "serum_sara", "drift_drew", "tensor_tess",
  "magic_mara", "backpack_ben", "helius_hugo", "marinade_mae", "bonk_bri",
];

const ASSETS = [
  { asset: "USDC", chain: "solana", price: 1.0, spread: 0.01, min: 50, max: 5000, liq: 12000 },
  { asset: "USDT", chain: "solana", price: 1.0, spread: 0.01, min: 50, max: 4000, liq: 9000 },
  { asset: "SOL", chain: "solana", price: 152, spread: 4, min: 0.5, max: 60, liq: 220 },
  { asset: "ETH", chain: "ethereum", price: 3180, spread: 60, min: 0.05, max: 5, liq: 14 },
  { asset: "BTC", chain: "bitcoin", price: 64200, spread: 900, min: 0.005, max: 0.5, liq: 1.4 },
] as const;

const PAYMENTS = ["BANK_TRANSFER", "CASH", "WISE", "REVOLUT", "MOBILE_MONEY", "PAYPAL"] as const;
const TRADE_TYPES = ["IN_PERSON", "BOTH", "BOTH", "REMOTE"] as const; // weight toward in-person ("meet")

const BIOS = [
  "Trusted local {asset} trader. Fast & friendly meetups.",
  "Buying and selling {asset} around {city} since 2024. Cash or bank, your call.",
  "{city} based. Quick replies, escrow every time, no drama.",
  "OTC desk vibes without the desk. {asset} in {city}, same-day.",
  "Meet at any metro station in {city}. Verified and happy to show ID.",
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

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function sample<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function jitter(lat: number, lng: number, km: number) {
  const r = rand(0.3, km) / 111; // degrees
  const t = rand(0, 2 * Math.PI);
  return { lat: lat + r * Math.cos(t), lng: lng + (r * Math.sin(t)) / Math.cos((lat * Math.PI) / 180) };
}
function daysAgo(days: number) { return new Date(Date.now() - days * 24 * 60 * 60 * 1000); }

// fake but unique-looking base58 addresses
function fakeSolAddr(seed: number) {
  const c = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = ""; let x = seed * 2654435761 % 2 ** 31;
  for (let i = 0; i < 44; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += c[x % c.length]; }
  return s;
}

function parseCenters(main: { latitude: number | null; longitude: number | null } | null) {
  if (process.env.CENTERS) {
    return process.env.CENTERS.split(";").map((part, i) => {
      const [lat, lng, name] = part.split(",");
      return { lat: parseFloat(lat), lng: parseFloat(lng), name: (name || `Centre ${i + 1}`).trim() };
    });
  }
  if (process.env.LAT && process.env.LNG) {
    return [{ lat: parseFloat(process.env.LAT), lng: parseFloat(process.env.LNG), name: "your area" }];
  }
  if (main?.latitude && main?.longitude) {
    return [{ lat: main.latitude, lng: main.longitude, name: "your area" }];
  }
  return DEFAULT_CENTERS;
}

async function wipeDemoData() {
  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  const ids = demoUsers.map((u) => u.id);
  if (ids.length === 0) return 0;
  const trades = await prisma.trade.findMany({ where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] }, select: { id: true } });
  const tradeIds = trades.map((t) => t.id);
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

async function main() {
  // 1) main demo account
  const passwordHash = await bcrypt.hash(MAIN_PASSWORD, 10);
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: MAIN_EMAIL }, { username: MAIN_USERNAME }] } });
  const main = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { email: MAIN_EMAIL, passwordHash, authProvider: "EMAIL", accountStatus: "PHONE_VERIFIED", kycStatus: "VERIFIED", sellerMode: true },
      })
    : await prisma.user.create({
        data: { username: MAIN_USERNAME, email: MAIN_EMAIL, passwordHash, authProvider: "EMAIL", accountStatus: "PHONE_VERIFIED", kycStatus: "VERIFIED", sellerMode: true },
      });
  console.log(`✓ main account ready: ${MAIN_EMAIL} (id=${main.id}, kyc=${main.kycStatus})`);

  const centers = parseCenters(main);
  if (!main.latitude || !main.longitude) {
    await prisma.user.update({ where: { id: main.id }, data: { latitude: centers[0].lat, longitude: centers[0].lng } });
    console.log(`  main account location defaulted to ${centers[0].name}`);
  }

  // 2) wipe previous demo data
  const wiped = await wipeDemoData();
  if (wiped) console.log(`  cleared ${wiped} previous demo sellers (and their trades, reviews, listings)`);

  // 3) sellers + listings, round-robin across the centres
  console.log(`✓ seeding ${SELLER_COUNT} sellers across ${centers.map((c) => c.name).join(", ")}`);
  const sellers: { id: string; asset: (typeof ASSETS)[number]; listingId: string; createdAt: Date; city: string }[] = [];
  for (let i = 0; i < SELLER_COUNT; i++) {
    const handle = HANDLES[i % HANDLES.length] + (i >= HANDLES.length ? `_${i}` : "");
    const center = centers[i % centers.length];
    const spot = jitter(center.lat, center.lng, 9); // within ~9km
    const a = pick(ASSETS);
    const priceValue = +(a.price + rand(-a.spread, a.spread)).toFixed(a.price < 5 ? 3 : 2);
    const createdAt = daysAgo(randInt(20, 400));
    const seller = await prisma.user.create({
      data: {
        username: handle,
        email: `${handle}${DEMO_DOMAIN}`,
        passwordHash: await bcrypt.hash("Demo@123", 10),
        authProvider: "EMAIL",
        accountStatus: "PHONE_VERIFIED",
        kycStatus: "VERIFIED",
        sellerMode: true,
        walletAddress: fakeSolAddr(i + 1),
        walletVerified: true,
        bio: pick(BIOS).replace("{asset}", a.asset).replace("{city}", center.name),
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
    sellers.push({ id: seller.id, asset: a, listingId: seller.listings[0].id, createdAt, city: center.name });
    if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${SELLER_COUNT}`);
  }

  // 4) completed-trade history with reviews, between demo accounts
  console.log("✓ writing trade history");
  let tradeCount = 0; let reviewCount = 0;
  for (const s of sellers) {
    const n = randInt(2, 14);
    const maxAge = Math.min(90, Math.max(2, Math.floor((Date.now() - s.createdAt.getTime()) / 86400000) - 1));
    const rows = Array.from({ length: n }, () => {
      const buyer = pick(sellers.filter((o) => o.id !== s.id));
      const amount = +rand(s.asset.min, Math.min(s.asset.max, s.asset.min * 20)).toFixed(s.asset.price > 100 ? 4 : 2);
      const created = daysAgo(rand(1, maxAge));
      return {
        buyerId: buyer.id,
        sellerId: s.id,
        listingId: s.listingId,
        asset: s.asset.asset as any,
        amount,
        price: +(s.asset.price + rand(-s.asset.spread, s.asset.spread)).toFixed(2),
        paymentMethod: pick(PAYMENTS) as any,
        tradeType: pick(["IN_PERSON", "REMOTE"]) as any,
        chain: s.asset.chain,
        status: "COMPLETED" as any,
        protocolFee: 0,
        createdAt: created,
        updatedAt: new Date(created.getTime() + randInt(10, 120) * 60 * 1000),
      };
    });
    const trades = await prisma.trade.createManyAndReturn({ data: rows, select: { id: true, buyerId: true, createdAt: true } });
    tradeCount += trades.length;
    const reviews = trades
      .filter(() => Math.random() < 0.8)
      .map((t) => ({
        tradeId: t.id,
        reviewerId: t.buyerId,
        revieweeId: s.id,
        rating: Math.random() < 0.08 ? 3 : Math.random() < 0.55 ? 5 : 4,
        comment: Math.random() < 0.85 ? pick(COMMENTS) : null,
        createdAt: new Date(t.createdAt.getTime() + randInt(30, 600) * 60 * 1000),
      }));
    if (reviews.length) {
      await prisma.review.createMany({ data: reviews });
      reviewCount += reviews.length;
    }
  }

  const total = await prisma.listing.count({ where: { isActive: true } });
  console.log(`✓ done. ${sellers.length} sellers, ${tradeCount} completed trades, ${reviewCount} reviews. ${total} active listings now visible in discovery.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
