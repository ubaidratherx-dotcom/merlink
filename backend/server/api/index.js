// Vercel serverless entry. `pnpm run vercel-build` bundles the Express app into
// dist/server.js (see build.mjs); this file just hands it to the runtime.
module.exports = require("../dist/server.js").default;
