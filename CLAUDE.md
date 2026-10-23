# Merlink — Claude Code Context

## What is Merlink
Location-based P2P crypto trading marketplace on Solana (originally spec'd as "CryptoMeet", renamed Merlink). Verified users discover nearby traders and complete trades using non-custodial escrow on Solana.

Users can: buy crypto, sell crypto, post buy requests, respond to buy requests, complete trades through escrow.

## MVP Spec — 23 Steps

| Step | Feature | Backend | Frontend |
|------|---------|---------|---------|
| 1 | User Account System (register, OTP verification) | DONE | DONE |
| 2 | KYC Identity Verification (Sumsub) | DONE | DONE |
| 3 | Wallet Connection (Solana Wallet Adapter) | DONE | DONE |
| 4 | Seller Mode Setup | DONE | DONE (gates on sell page) |
| 5 | Seller Listings (CRUD, liquidity check) | DONE | DONE (create form + my-listings) |
| 6 | Buyer Requests (post, expire 30min) | NOT BUILT | NOT BUILT |
| 7 | Marketplace Discovery (sellers + buyers tabs) | DONE (sellers only) | DONE (buyers tab = empty state) |
| 8 | Discovery Ranking (40% dist, 30% rep, 20% trades, 10% price) | DONE | N/A |
| 9 | Trader Profiles | NOT BUILT | PARTIAL (profile page exists, no public view) |
| 10 | Trade Chat (in-app, AI contact-info blocking) | NOT BUILT | NOT BUILT |
| 11 | Payment Methods | DONE (part of listings) | DONE |
| 12 | Trade Creation (buyer picks listing OR seller accepts buy req) | NOT BUILT | NOT BUILT |
| 13 | Escrow Program (Rust/Anchor, 0.5% fee to treasury) | NOT BUILT | NOT BUILT |
| 14 | Trade State Machine (CREATED→...→COMPLETED/CANCELLED/DISPUTED/RESOLVED) | NOT BUILT | NOT BUILT |
| 15 | Payment Timer (buyer has 6h to mark paid, else CANCELLED) | NOT BUILT | NOT BUILT |
| 16 | Seller Confirmation Timer (1h after payment marked, else DISPUTED) | NOT BUILT | NOT BUILT |
| 17 | In-Person Trade Verification (video, GPS, device ID) | NOT BUILT | NOT BUILT |
| 18 | Dispute Resolution (mediator reviews, releases or refunds) | NOT BUILT | NOT BUILT |
| 19 | Reputation System (1-5 stars, post-trade review) | NOT BUILT | NOT BUILT |
| 20 | Security Controls (KYC gating, OTP, uniqueness checks) | PARTIAL (KYC + OTP done, no uniqueness beyond DB unique) | N/A |
| 21 | Navigation Structure (Discover/Trades/Sell/Messages/Profile) | N/A | DONE (bottom tab bar) |
| 22 | Revenue Model (0.5% protocol fee via escrow) | NOT BUILT | N/A |
| 23 | Blockchain Architecture (Solana, USDC+SOL, Phantom/Solflare/Backpack, Rust/Anchor) | PARTIAL (wallet verify/balance done, no escrow program) | DONE (Wallet Adapter UI) |

**Next to build: Steps 6, 12, 13, 14, 15, 16 (the full trade lifecycle)**

---

## Monorepo Structure
```
merlink/
  apps/
    web/          Next.js 14 App Router — mobile-first PWA (port 3000)
    mobile/       React Native stub (not started)
  backend/
    server/       Express + TypeScript + Prisma (port 4000)
  packages/
    types/        Shared TypeScript types (@merlink/types)
    utils/        Shared utilities — sanitizeUsername etc. (@merlink/utils)
    config/       Shared constants (@merlink/config)
    ui/           Shared React components (@merlink/ui)
```

## How to Run
```bash
# From repo root — /Users/ubaid/Downloads/merlink
pnpm dev             # starts both web (3000) and server (4000) in parallel
pnpm dev:web         # web only
pnpm dev:server      # server only

# DB
pnpm db:generate     # prisma generate
pnpm db:migrate      # prisma migrate dev
pnpm db:push         # prisma db push (faster, no migration files)
pnpm db:studio       # prisma studio
```

## Tech Stack
- **Backend**: Express, TypeScript, Prisma/PostgreSQL, Socket.io, JWT auth, bcrypt, zod validation, multer
- **Frontend**: Next.js 14 (App Router), Zustand (auth store), Solana Wallet Adapter, CSS Modules (no Tailwind)
- **Solana**: @solana/web3.js, @solana/spl-token, tweetnacl (signature verification), bs58
- **KYC**: Sumsub (Web SDK + webhook)
- **OTP**: Currently logs to console (Twilio keys in env but not wired to SMS)
- **Escrow**: Rust/Anchor program — NOT BUILT YET
- **Package manager**: pnpm workspaces

## Environment Variables
Copy `.env.example` to `.env` in repo root. Key vars:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY`
- `SOLANA_RPC_URL` / `SOLANA_NETWORK` (devnet by default)
- `ESCROW_PROGRAM_ID` — Solana escrow program (not yet deployed/built)
- `TREASURY_WALLET` — receives 0.5% protocol fee (not yet used)
- `CORS_ORIGIN=http://localhost:3000`
- Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SOLANA_NETWORK`

## API Base
All REST endpoints: `http://localhost:4000/api/v1/`
WebSocket namespaces: `/trade` and `/chat` (Socket.io, rooms exist but no message handlers yet)

---

## What Is Built — Detail

### Backend — Fully Implemented

#### Auth (`/api/v1/auth`)
- `POST /register` — email or phone registration, sends verification email
- `POST /login/email` — email + password
- `POST /login/phone` — sends OTP (currently console.log only — no Twilio)
- `POST /otp/send` — resend OTP
- `POST /otp/verify` — verify OTP, marks PHONE_VERIFIED
- `POST /refresh` — rotate refresh token
- `POST /logout` — revoke refresh token
- `GET /me` — get current user
- `POST /forgot-password` — email reset link
- `POST /reset-password` — consume token, set new password

#### Email (`/api/v1/email`)
- `POST /send-verification` — resend verification email
- `GET /verify?token=` — verify email token

#### KYC (`/api/v1/kyc`)
- `POST /start` — create Sumsub applicant, return SDK access token
- `GET /status` — get user's KYC status
- `POST /webhook` — Sumsub webhook (verifies HMAC signature, updates kycStatus)

#### Listings (`/api/v1/listings`)
- `POST /seller-mode` — enable seller mode (requires KYC + verified wallet)
- `POST /` — create listing (requires seller mode + wallet)
- `PUT /:id` — update listing
- `DELETE /:id` — delete listing
- `GET /` — public discovery feed with location-based ranking (haversine), filters
- `GET /mine` — authenticated seller's listings
- `GET /:id` — single listing with seller stats (rating, trade count)
- `POST /:id/refresh` — refresh wallet liquidity for a listing

#### Wallet (`/api/v1/wallet`)
- `POST /verify` — verify Solana wallet signature (tweetnacl), connect to user
- `POST /disconnect` — unlink wallet
- `GET /balance` — fetch SOL + USDC balance on-chain

#### Users (`/api/v1/users`)
- `PUT /profile` — update username, latitude, longitude

#### Upload (`/api/v1/upload`)
- `POST /profile-photo` — multer upload, served from `/uploads/`

### Backend — STUB (501 Not Implemented)
- `POST/PUT/DELETE /api/v1/trades` — entire trade lifecycle
- `POST/PUT/DELETE /api/v1/buy-requests` — buyer-side requests
- `/api/v1/chat` — chat history REST endpoint (health only)
- `/api/v1/reviews` — post-trade reviews (health only)

### Socket.io — Scaffolded Only
- `/trade` namespace: join/leave `trade:{id}` rooms — **no event emission yet**
- `/chat` namespace: join/leave `chat:{id}` rooms — **no message handling yet**

### Frontend — Implemented

| Route | Status |
|-------|--------|
| `/login` | Full — email/phone tabs, OTP flow |
| `/register` | Full |
| `/verify-email` | Full |
| `/verify-otp` | Full |
| `/forgot-password` | Full |
| `/reset-password` | Full |
| `/` (Discover) | Full — listings feed, search, KYC/location banners, skeleton loading |
| `/sell` | Full — create listing form with KYC/wallet/sellerMode gates |
| `/sell/my-listings` | Exists |
| `/kyc` | Full — Sumsub Web SDK |
| `/profile` | Exists |
| `/profile/wallet` | Full — connect/disconnect/balance |
| `/trades` | Shell only — empty state, NOT connected to API |
| `/messages` | Shell only — empty state, NOT connected to socket |

### Frontend — Missing
- `/trade/[id]` — **Trade detail page does not exist** (linked from discover, 404s)
- `/trades` list connected to real API
- Chat UI connected to `/chat` socket namespace
- Buy request creation (buyer side)
- Reviews/ratings post-trade UI
- Dispute initiation UI
- Public trader profile view

---

## What to Build Next (Priority Order)

### 1. Trade Lifecycle — Core MVP blocker (Steps 12, 14, 15, 16)

**Backend files to create:**

`backend/server/src/services/trade.service.ts`
- `createTrade(buyerId, listingId, amount, paymentMethod)` → CREATED, sets paymentDeadline = now + 6h
- `markEscrowLocked(tradeId, escrowTxSignature)` → ESCROW_LOCKED (called after seller locks on-chain)
- `markPaymentSent(tradeId, buyerId)` → PAYMENT_MARKED_SENT, sets confirmationDeadline = now + 1h
- `confirmRelease(tradeId, sellerId)` → RELEASE_PENDING → COMPLETED (triggers on-chain release)
- `cancelTrade(tradeId, userId)` → CANCELLED (only allowed pre PAYMENT_MARKED_SENT)
- `openDispute(tradeId, userId, reason)` → DISPUTED
- Each transition writes a `TradeStateLog` and emits socket event to `trade:{tradeId}`

`backend/server/src/routes/trades.routes.ts` — replace 501 stubs:
- `POST /` — create trade from listing (buyer)
- `GET /` — list user's trades (as buyer + seller)
- `GET /:id` — trade detail with messages
- `POST /:id/escrow` — seller confirms escrow lock
- `POST /:id/payment-sent` — buyer marks payment sent
- `POST /:id/release` — seller confirms release
- `POST /:id/cancel` — cancel trade
- `POST /:id/dispute` — open dispute

**Frontend files to create:**

`apps/web/src/app/(main)/trade/[id]/page.tsx`
- Shows: counterparty info, asset, amount, price, payment method, trade type
- Status timeline (CREATED → ESCROW_LOCKED → ... → COMPLETED)
- Action buttons by role+status:
  - Seller: "Lock Escrow" (CREATED), "Confirm Release" (PAYMENT_MARKED_SENT), "Dispute"
  - Buyer: "Mark Payment Sent" (ESCROW_LOCKED), "Dispute"
- Countdown timer (payment deadline, confirmation deadline)
- Integrated chat (Socket.io `/chat` namespace)
- Real-time status updates (Socket.io `/trade` namespace)

Connect `/trades` page to `GET /api/v1/trades`

### 2. Chat — Socket.io message handling (Step 10)
Wire up the `/chat` namespace to actually send/store messages with AI contact-info blocking.
Blocked content: phone numbers, Telegram, WhatsApp, Discord, wallet addresses, links.
`ChatMessage` model has `isBlocked` + `blockReason` fields already in schema.

### 3. Buy Requests (Step 6)
- Backend: `buy-request.service.ts` + real `buyRequests.routes.ts`
  - Create, list active, expire after 30 minutes (cron or lazy expiry check)
- Frontend: Buyers tab on Discover page currently shows empty state

### 4. Reviews (Step 19)
- `POST /api/v1/reviews` — after COMPLETED, both parties can review once
- Frontend: Post-trade review prompt on trade detail page

### 5. Trader Profiles (Step 9)
- Public profile page `GET /api/v1/users/:username`
- Shows: username, photo, KYC badge, total trades, avg rating, account age, dispute ratio

### 6. Escrow Program (Step 13, 23)
- Rust/Anchor program on Solana devnet
- Instructions: `lock_escrow`, `release_escrow`, `cancel_escrow`
- 0.5% fee auto-sent to `TREASURY_WALLET`
- This is the final piece — trade flow can work with manual confirmation until this is ready

### 7. In-Person Video Verification (Step 17)
- Both users record video before in-person trade
- Store: GPS, timestamp, tradeId, userId, deviceId
- `VideoVerification` model already in schema

---

## Database Schema Summary
Key models: `User`, `Listing`, `BuyRequest`, `Trade`, `TradeStateLog`, `ChatMessage`, `Review`, `VideoVerification`, `Dispute`, `KycApplication`, `RefreshToken`, `OtpCode`, `EmailVerification`, `PasswordReset`

Trade status enum: `CREATED → ESCROW_LOCKED → PAYMENT_PENDING → PAYMENT_MARKED_SENT → RELEASE_PENDING → COMPLETED | CANCELLED | DISPUTED | RESOLVED`

Assets: `USDC`, `SOL` | Payment methods: `BANK_TRANSFER`, `CASH`, `WISE`, `REVOLUT`, `MOBILE_MONEY`, `PAYPAL`, `OTHER`

---

## Code Conventions
- Backend services: `export const tradeService = { fn1, fn2 }` pattern
- Controllers call services, respond with `res.json({ data: result })`
- Errors: `throw new AppError(message, statusCode, code)` — caught by `errorHandler` middleware
- Frontend API calls: all in `apps/web/src/lib/api.ts` via `fetchApi()` with auto token refresh on 401
- Auth store: `apps/web/src/stores/auth.store.ts` (Zustand) — persists user + tokens in localStorage key `merlink_tokens`
- CSS Modules for all styling — dark theme, purple accent `#7B5EFF`, green `#16C784`, amber `#FF9F0A`
- No Tailwind — pure CSS modules
- Routes protected by `authenticate` middleware (JWT), some also need `requireKyc`

## Auth Flow
1. Register → email verification email sent → verify token → logged in
2. Login email → JWT access (15min) + refresh (7d) tokens
3. Login phone → OTP (currently console.log only) → verify OTP → tokens
4. `fetchApi()` auto-refreshes access token on 401

## Listing Discovery Ranking (already built)
Weighted score: 40% distance (haversine, 100km radius) + 30% seller rating + 20% trade count + 10% price score
