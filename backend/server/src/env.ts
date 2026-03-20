import dotenv from "dotenv";
import path from "path";

// Load .env from monorepo root — must be imported before any other module
const envPaths = [
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../../.env"),
];

for (const p of envPaths) {
  const result = dotenv.config({ path: p });
  if (!result.error) break;
}
