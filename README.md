# Hypertron Core Backend (`hypertron-core-backend`)

NestJS backend for the Hypertron **dashboard and Collect checkout**. It authenticates Freighter wallets (SEP-53), owns businesses and workspaces, creates payment links (classic Stellar and private-pool settlement), and reconciles classic Collect payments against Horizon.

This is **not** the merchant Payments API. Secret keys, `Payment` objects, and webhooks live in `hypertron-api`. This service is the sole owner of `Business`, `PaymentLink`, and `AuthChallenge`.

| | |
| --- | --- |
| Default local port | **4000** |
| Database | MongoDB — database name **`hypertron`** |
| Package manager | **pnpm** (Node 20) |
| Framework | NestJS 11 + Prisma (MongoDB) + `@stellar/stellar-sdk` |

---

## Role in the stack

```
hypertron-frontend (localhost:3000)
        |
        | credentialed CORS + ht_dashboard cookie
        v
 this service  -- Collect payment links, auth, workspaces
        |
        | (optional) PUT /internal/merchant-settings
        v
 hypertron-api (localhost:4001)
        ^
        | X-Service-Key / Bearer SERVICE_ACCOUNT_API_KEY
        |
  hypertron-api resolving merchant Business.id
```

**Schema ownership** — do not `prisma db push` this schema from `hypertron-api`. Do not point this `DATABASE_URL` at `hypertron_api` or `hypertron_indexer`.

---

## Prerequisites

- Node.js **20.x**
- [pnpm](https://pnpm.io/) 10.x
- MongoDB connection string whose path is **`/hypertron`**
- A long random `AUTH_SECRET` (must match `hypertron-api` if dashboard cookies are shared)
- Optional: `hypertron-api` running if you want merchant-settings sync and API-key dashboard flows

---

## Quick start

```bash
cp .env.example .env
# Fill DATABASE_URL, AUTH_SECRET, CORS_ORIGIN, FRONTEND_URL

pnpm install
pnpm exec prisma generate
pnpm db:deploy
pnpm start:dev
```

`pnpm db:deploy` runs `prisma db push --accept-data-loss --skip-generate`. Use it against the **core** database only, and treat `--accept-data-loss` as unsafe on production data unless you intend a schema reset.

Health:

```bash
curl -sS http://localhost:4000/
# { "service": "hypertron-core-backend", "status": "ok" }

curl -sS http://localhost:4000/health
# { "service": "hypertron-core-backend", "status": "ok", "database": "ok" }
```

---

## Environment

Template: [`.env.example`](.env.example). AWS paste file: [`docs/ops/AWS_ENV.example`](docs/ops/AWS_ENV.example).

### Required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB URI for **`hypertron`** |
| `AUTH_SECRET` | HMAC for `ht_dashboard` cookies (7-day session). **Must match hypertron-api** if both services share cookies |
| `CORS_ORIGIN` | Comma-separated browser origins (dashboard + checkout) |
| `FRONTEND_URL` | Public frontend origin used when building payment-link URLs. Production must be the real site (for example `https://www.hypertron.space`), not localhost |

### Optional

| Variable | Notes |
| --- | --- |
| `PORT` | Default `4000`. Render / App Runner inject `PORT` — do not hardcode it on those platforms |
| `APP_URL` | Fallback if `FRONTEND_URL` is unset |
| `PAYMENT_POOL_ADDRESS` | Default pool / contract `C...` destination when a workspace vault is not set (required for **private** settlement links) |
| `MERCHANT_RECIPIENT` | Classic `G...` fallback when no pool address is configured |
| `COOKIE_SAMESITE` | Production defaults to `none` (Vercel frontend + Render API). Use `lax` only if the dashboard is same-site as this API |
| `NODE_ENV` | `development` locally; `production` on Render |
| `DISABLE_RECONCILER` | `true` to skip the 30s Collect Horizon poller |

### Service account (hypertron-api and tests)

| Variable | Notes |
| --- | --- |
| `SERVICE_ACCOUNT_API_KEY` | Secret. Generate: `node -e "console.log('ht_svc_'+require('crypto').randomBytes(32).toString('hex'))"` |
| `SERVICE_ACCOUNT_WALLET` | Stellar `G...` this service account acts as (Business is auto-created) |

Send the key as `Authorization: Bearer <key>` or `X-Service-Key`. It is treated as a wallet session for that `SERVICE_ACCOUNT_WALLET`.

### Payments API sync (core to hypertron-api)

| Variable | Notes |
| --- | --- |
| `PAYMENTS_API_URL` | Origin of `hypertron-api` (no trailing slash) |
| `INTERNAL_SERVICE_TOKEN` | Same token as `hypertron-api`. Enables `PUT /internal/merchant-settings` |

Sync is **non-blocking**. If these are unset or the API is down, core still works; the payments API falls back to env destinations.

---

## Authentication

Dashboard sign-in is **non-custodial**. The server never holds spend or view secrets.

1. `POST /api/auth/challenge` with `{ "walletAddress": "G..." }` — stores a one-time SEP-53 message (10 minute TTL).
2. Wallet signs the exact UTF-8 message.
3. `POST /api/auth/verify` with `{ challengeId, walletAddress, signedMessage }` — sets cookie **`ht_dashboard`** (HMAC-SHA256, `AUTH_SECRET`).
4. `GET /api/auth/me` and mutating business/workspace/link routes read that cookie (or the service-account key).
5. `POST /api/auth/logout` clears the cookie.

Cookie is credentialed CORS. Allowed origins are `CORS_ORIGIN`, plus `FRONTEND_URL` and `APP_URL` if set (trailing slashes stripped).

---

## HTTP API

### Auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/challenge` | public | Create SEP-53 challenge |
| `POST` | `/api/auth/verify` | public | Verify signature, set `ht_dashboard` |
| `GET` | `/api/auth/me` | cookie or service key | Current wallet identity |
| `POST` | `/api/auth/logout` | — | Clear cookies |

### Business

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/business/profile` | Active workspace profile |
| `PATCH` | `/api/business/profile` | Name, receive address, `viewPub` / `spendPub`, etc. |
| `POST` | `/api/business/link` | Set receive address (`G...` / `C...`) |
| `PATCH` | `/api/business/link` | Update receive address |

`viewPub` / `spendPub` are **public** keys for private notes. View and spend **secrets stay in the browser**.

### Workspaces

Wallet-based membership (`BusinessMember`). `businessId` is the isolation key used by payment links and `hypertron-api`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspaces` | List memberships + `activeWorkspaceId` |
| `POST` | `/api/workspaces` | Create workspace |
| `GET` | `/api/workspaces/:workspaceId` | One workspace |
| `POST` | `/api/workspaces/:workspaceId/activate` | Persist active workspace (`WalletPreference`) |

### Payment links (Collect)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/payment-link` | session | Create link (`businessId` required) |
| `GET` | `/api/payment-link` | session | List (`?businessId=`) |
| `GET` | `/api/payment-link/:id` | **public** | Checkout payload (410 if expired) |
| `GET` | `/api/payment-link/:id/status` | public | Paid / pending; optional `?txHash=` runs Horizon check |
| `POST` | `/api/payment-link/:id/claim` | public | Payer reports private-transfer `txHash` + `outCommitment` |
| `POST` | `/api/payment-link/:id/confirm` | session | Merchant confirms after decrypting the received note |

Create body (selected fields): `businessId`, `amount` or `flexibleAmount: true`, `currency` (`USDC` / `XLM`), `purpose`, `clientName`, `expiryDays`, `paymentMethods` (`wallet`, `qr`, `onramp`), `metadata` (merchant JSON string; private settlement flag lives here), optional legacy `shieldSalt` / `shieldCommitment` / `shieldProof`.

Classic links pay a `G...` receive address. Private settlement requires `viewPub` + `spendPub` on the business and `PAYMENT_POOL_ADDRESS` (or a pool destination on the workspace).

Public GET includes `viewPub` / `spendPub` so the payer can build the note. It never includes view/spend secrets.

### Ops

| Path | Notes |
| --- | --- |
| `GET /` | Service identity |
| `GET /health` | Mongo ping; **503** if the database is unreachable |

---

## Collect reconciler

[`CollectReconcilerScheduler`](src/reconciler/collect-reconciler.scheduler.ts) polls unpaid **classic** `G...` payment links every **30 seconds** (first tick ~5s after boot). It matches Horizon payments to `linkMemo` + amount + destination.

- Flexible-amount and pool/`C...` destinations are skipped by the poller.
- `GET /api/payment-link/:id/status` can reconcile on demand (optionally for a specific `txHash`) so the pay page does not wait for the timer.
- Set `DISABLE_RECONCILER=true` to idle the scheduler (useful when a second deploy must not share the live database).

Private links are marked paid on **claim** (`txHash` + `outCommitment`). Merchant **confirm** sets `confirmedAt` after the note is decrypted.

---

## Data model

Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma).

| Model | Role |
| --- | --- |
| `AuthChallenge` | One-time Freighter login messages |
| `Business` | Merchant workspace (receive address, viewing/spend **public** keys, profile) |
| `BusinessMember` | Wallet + role (`owner` by default) |
| `WalletPreference` | Active `businessId` for a wallet |
| `PaymentLink` | Collect link: memo, destination, classic paid fields, private claim/confirm fields |

`businessId` is a cuid string. `hypertron-api` stores that same string on `ApiKey` / `Payment` / `MerchantSettings` and must never treat it as a Mongo ObjectId.

---

## Scripts

| Script | Action |
| --- | --- |
| `pnpm start:dev` | Watch mode |
| `pnpm build` | `prisma generate` + Nest build |
| `pnpm start:prod` | `node dist/main.js` |
| `pnpm db:deploy` | `prisma db push` (see warning above) |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | E2E |
| `pnpm lint` | ESLint |

---

## Deploy

### Render

[`render.yaml`](render.yaml) — Docker web service, health `/health`, Oregon. Do not set `PORT`.

Match `hypertron-api`: `AUTH_SECRET`, `INTERNAL_SERVICE_TOKEN`, and `SERVICE_ACCOUNT_API_KEY` (API side: `CORE_BACKEND_SERVICE_ACCOUNT_API_KEY`). After the payments API is live, set `PAYMENTS_API_URL`.

Set `FRONTEND_URL` to the real dashboard origin so "Copy link" URLs work.

### AWS App Runner (second environment)

Independent of Render. See [`docs/ops/AWS_DEPLOY.md`](docs/ops/AWS_DEPLOY.md).

- Use a **different** Atlas database (for example `hypertron_aws`). Two instances on the same DB will both run the Collect reconciler.
- Do not copy live Render secrets unless you intentionally share sessions.
- Scripts and CloudFormation live under [`deploy/aws/`](deploy/aws/).

---

## Related docs

- [`docs/ops/AWS_DEPLOY.md`](docs/ops/AWS_DEPLOY.md) — App Runner
- [`INTEGRATION_PLAN.md`](INTEGRATION_PLAN.md) — core as BFF in front of `hypertron-api` developer routes
- [`migration/README.md`](migration/README.md) — legacy Express / Next route inventory
- Payments API: sibling repo `hypertron-api`
