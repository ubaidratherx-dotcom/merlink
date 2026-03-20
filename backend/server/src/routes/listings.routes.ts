// Listing routes – CRUD for marketplace listings
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireKyc } from "../middleware/requireKyc";
import { validate } from "../middleware/validate";
import {
  createListingSchema,
  updateListingSchema,
  updateListingParamsSchema,
  getListingsQuerySchema,
} from "../validators/listing.validator";
import {
  enableSellerMode,
  createListing,
  updateListing,
  deleteListing,
  getListing,
  getListings,
  getMyListings,
  refreshLiquidity,
} from "../controllers/listing.controller";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({ route: "listings", status: "ok" });
});

// ─── Authenticated routes ─────────────────────────────────────────────

// Enable seller mode (requires auth + KYC)
router.post("/seller-mode", authenticate, requireKyc, enableSellerMode);

// Create listing (requires auth + KYC + validation)
router.post(
  "/",
  authenticate,
  requireKyc,
  validate({ body: createListingSchema }),
  createListing
);

// Update listing (requires auth + validation)
router.put(
  "/:listingId",
  authenticate,
  validate({ body: updateListingSchema, params: updateListingParamsSchema }),
  updateListing
);

// Delete listing (requires auth)
router.delete("/:listingId", authenticate, deleteListing);

// Get my listings (requires auth) — must be before /:listingId
router.get("/mine", authenticate, getMyListings);

// Refresh listing liquidity (requires auth)
router.post("/:listingId/refresh", authenticate, refreshLiquidity);

// ─── Public routes ────────────────────────────────────────────────────

// Get single listing (public)
router.get("/:listingId", getListing);

// Get listings with filters (public)
router.get("/", validate({ query: getListingsQuerySchema }), getListings);

export default router;
