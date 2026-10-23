import "./env"; // Must be first — loads .env before any other module reads process.env

import http from "http";
import { app } from "./app";
import { setupSocket } from "./socket";
import { refreshListingLiquidity, autoCancelExpiredTrades } from "./jobs";

const server = http.createServer(app);
const io = setupSocket(server);

const PORT = parseInt(process.env.PORT || "4000", 10);

server.listen(PORT, () => {
  console.log(`[merlink] Server listening on port ${PORT}`);

  // Background job: refresh all active listing liquidity every 5 minutes
  setInterval(() => {
    refreshListingLiquidity()
      .then((count) => {
        if (count > 0) console.log(`[liquidity] Refreshed ${count} listings`);
      })
      .catch((err) => console.error("[liquidity] Background refresh failed:", err));
  }, 5 * 60 * 1000);

  // Background job: auto-cancel trades where the payment deadline expired
  setInterval(() => {
    autoCancelExpiredTrades().catch((err) =>
      console.error("[auto-cancel] Background check failed:", err)
    );
  }, 10 * 60 * 1000);
});

export { app, server, io };
