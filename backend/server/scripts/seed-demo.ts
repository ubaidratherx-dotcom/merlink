/**
 * Demo seeder.
 *  - Upserts the main demo account (MAIN_EMAIL / MAIN_PASSWORD), KYC-verified so it can trade.
 *  - Seeds demo sellers (@demo.merlink) with active listings clustered around one or more city
 *    centres, plus a completed-trade history with reviews so profiles look lived-in.
 *  - With DEMO_MODE=true the API also fills traders around any location a visitor searches
 *    from (see src/services/demoTraders.service.ts), so this seed is the starting crowd.
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
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { createDemoTradersNear, createDemoHistory, wipeDemoData } from "../src/services/demoTraders.service";

const MAIN_EMAIL = process.env.MAIN_EMAIL || "ubaidratherx@gmail.com";
const MAIN_PASSWORD = process.env.MAIN_PASSWORD || "Money@123";
const MAIN_USERNAME = "ubaid";
const SELLER_COUNT = parseInt(process.env.SELLER_COUNT || "30", 10);

const DEFAULT_CENTERS = [
  { lat: 25.2048, lng: 55.2708, name: "Dubai" },
  { lat: 51.5074, lng: -0.1278, name: "London" },
  { lat: 40.7128, lng: -74.006, name: "New York" },
  { lat: 1.3521, lng: 103.8198, name: "Singapore" },
];

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

async function main() {
  const passwordHash = await bcrypt.hash(MAIN_PASSWORD, 10);
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: MAIN_EMAIL }, { username: MAIN_USERNAME }] } });
  const base = { email: MAIN_EMAIL, passwordHash, authProvider: "EMAIL" as const, accountStatus: "PHONE_VERIFIED" as const, kycStatus: "VERIFIED" as const, sellerMode: true };
  const main = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: base })
    : await prisma.user.create({ data: { username: MAIN_USERNAME, ...base } });
  console.log(`✓ main account ready: ${MAIN_EMAIL} (id=${main.id}, kyc=${main.kycStatus})`);

  const centers = parseCenters(main);
  if (!main.latitude || !main.longitude) {
    await prisma.user.update({ where: { id: main.id }, data: { latitude: centers[0].lat, longitude: centers[0].lng } });
    console.log(`  main account location defaulted to ${centers[0].name}`);
  }

  const wiped = await wipeDemoData();
  if (wiped) console.log(`  cleared ${wiped} previous demo sellers (and their trades, reviews, listings)`);

  console.log(`✓ seeding ${SELLER_COUNT} sellers across ${centers.map((c) => c.name).join(", ")}`);
  const all = [];
  for (let i = 0; i < centers.length; i++) {
    const count = Math.floor(SELLER_COUNT / centers.length) + (i < SELLER_COUNT % centers.length ? 1 : 0);
    const made = await createDemoTradersNear({ lat: centers[i].lat, lng: centers[i].lng, count, city: centers[i].name });
    all.push(...made);
    console.log(`  ${centers[i].name}: ${made.length}`);
  }
  console.log("✓ writing trade history");
  const history = await createDemoHistory(all);
  const total = await prisma.listing.count({ where: { isActive: true } });
  console.log(`✓ done. ${all.length} sellers, ${history.trades} completed trades, ${history.reviews} reviews. ${total} active listings now visible in discovery.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
