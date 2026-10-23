// Bundles the API for serverless hosting. Workspace packages (@merlink/*) ship
// as TypeScript source, so they are inlined; everything from node_modules stays
// external and is resolved at runtime.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(here, "../../packages");

const workspacePackages = {
  name: "merlink-workspace-packages",
  setup(b) {
    b.onResolve({ filter: /^@merlink\/[a-z]+$/ }, (args) => ({
      path: path.join(packagesDir, args.path.replace("@merlink/", ""), "src", "index.ts"),
    }));
  },
};

await build({
  entryPoints: [path.join(here, "src", "vercel.ts")],
  outfile: path.join(here, "dist", "server.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  plugins: [workspacePackages],
  sourcemap: false,
  logLevel: "info",
});
