/**
 * Demo seeder for video recording.
 *  - Upserts the main account (ubaidratherx@gmail.com / Money@123), KYC-verified so it can trade.
 *  - Seeds a crowd of nearby crypto sellers + active listings clustered around a coordinate.
 *
 * Target coordinate priority:
 *   1. LAT / LNG env vars (explicit override)
 *   2. The main user's profile lat/lng (set by the phone's GPS after they log in & allow location)
 *
 * Re-runnable: wipes previously-seeded demo sellers (email domain @demo.merlink) before re-seeding.
 *
 *   DATABASE_URL=... LAT=.. LNG=.. npx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MAIN_EMAIL = "ubaidratherx@gmail.com";
const MAIN_PASSWORD = "Money@123";
const MAIN_USERNAME = "ubaid";
const DEMO_DOMAIN = "@demo.merlink";
const SELLER_COUNT = 30;

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

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function sample<T>(arr: readonly T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// fake but unique-looking base58/hex addresses
function fakeSolAddr(seed: number) {
  const c = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = ""; let x = seed * 2654435761 % 2 ** 31;
  for (let i = 0; i < 44; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += c[x % c.length]; }
  return s;
}

// offset a coordinate by a random distance (km) and bearing
function jitter(lat: number, lng: number, maxKm: number) {
  const distKm = Math.sqrt(Math.random()) * maxKm; // sqrt -> uniform area distribution
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (distKm / 111) * Math.cos(bearing);
  const dLng = (distKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearing);
  return { lat: lat + dLat, lng: lng + dLng, distKm };
}

async function ensureMainUser() {
  const passwordHash = await bcrypt.hash(MAIN_PASSWORD, 10);
  // Reuse an existing account by email or by the desired username (repurpose stale test record).
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: MAIN_EMAIL }, { username: MAIN_USERNAME }] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email: MAIN_EMAIL,
        passwordHash,
        kycStatus: "VERIFIED",
        accountStatus: "PHONE_VERIFIED",
        ...(existing.walletAddress ? {} : { walletAddress: fakeSolAddr(99999), walletVerified: true }),
      },
    });
  }
  return prisma.user.create({
    data: {
      username: MAIN_USERNAME,
      email: MAIN_EMAIL,
      passwordHash,
      authProvider: "EMAIL",
      accountStatus: "PHONE_VERIFIED",
      kycStatus: "VERIFIED",
      walletAddress: fakeSolAddr(99999),
      walletVerified: true,
    },
  });
}

async function main() {
  const main = await ensureMainUser();
  console.log(`✓ main account ready: ${MAIN_EMAIL} (id=${main.id}, kyc=${main.kycStatus})`);

  const lat = process.env.LAT ? parseFloat(process.env.LAT) : main.latitude ?? null;
  const lng = process.env.LNG ? parseFloat(process.env.LNG) : main.longitude ?? null;

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    console.log("\n⚠  No location yet for the main account.");
    console.log("   → Log in on the phone with the creds above and tap ALLOW when it asks for location.");
    console.log("   → Then re-run this script (it will read your GPS coords and seed sellers around you).");
    console.log("   → Or pass coords explicitly:  LAT=.. LNG=.. npx tsx scripts/seed-demo.ts");
    return;
  }
  console.log(`✓ seeding ${SELLER_COUNT} sellers around (${lat.toFixed(5)}, ${lng.toFixed(5)})`);

  // wipe previous demo sellers (cascade deletes their listings)
  const wiped = await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });
  if (wiped.count) console.log(`  cleared ${wiped.count} previous demo sellers`);

  let created = 0;
  for (let i = 0; i < SELLER_COUNT; i++) {
    const handle = HANDLES[i % HANDLES.length] + (i >= HANDLES.length ? `_${i}` : "");
    const spot = jitter(lat, lng, 9); // within ~9km
    const a = pick(ASSETS);
    const priceValue = +(a.price + rand(-a.spread, a.spread)).toFixed(a.price < 5 ? 3 : 2);
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
        bio: `Trusted local ${a.asset} trader. Fast & friendly meetups.`,
        latitude: spot.lat,
        longitude: spot.lng,
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
    });
    created++;
    if (created % 10 === 0) console.log(`  …${created}/${SELLER_COUNT}`);
  }
  const total = await prisma.listing.count({ where: { isActive: true } });
  console.log(`✓ done. ${created} sellers seeded. ${total} active listings now visible in discovery.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
