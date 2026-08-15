# Prompt: wire Hypertron API to Core Backend service account

Copy everything below into a new Cursor chat in the HypertronCode workspace.

---

You are working in the Hypertron monorepo. `hypertron-core-backend` now authenticates **service-to-service** calls with a service account API key. `hypertron-api` (Payments API / API gateway) must use that key to call core-backend.

## What already exists

**Core backend (source of merchant Business + payment links):**

- Session cookie `ht_dashboard` for Freighter dashboard users (unchanged).
- Service account auth:
  - Header `Authorization: Bearer <SERVICE_ACCOUNT_API_KEY>` **or** `X-Service-Key: <SERVICE_ACCOUNT_API_KEY>`
  - Env: `SERVICE_ACCOUNT_API_KEY`, `SERVICE_ACCOUNT_WALLET` (Stellar G-address, 56 chars).
  - The service account is treated as that wallet: `GET /api/auth/me` returns `{ "auth": "service", "walletAddress": "G..." }`.
  - Business profile is auto-created for that wallet on first authenticated profile/link call.
- Core already **pushes** merchant settings **to** hypertron-api:
  - `PUT {PAYMENTS_API_URL}/internal/merchant-settings`
  - Header `X-Internal-Token: {INTERNAL_SERVICE_TOKEN}`
  - Guard: `hypertron-api/src/common/guards/internal-service.guard.ts`

**Do not replace Freighter cookie auth. Add service-account client calls alongside it.**

## What you must implement in `hypertron-api`

1. **Config (env, no secrets in git)**
   - `CORE_BACKEND_URL` — e.g. `https://hypertron-core-backend.onrender.com`
   - `CORE_BACKEND_SERVICE_ACCOUNT_API_KEY` — same value as core `SERVICE_ACCOUNT_API_KEY`
   - Keep existing `INTERNAL_SERVICE_TOKEN` for inbound `/internal/*` from core.

2. **HTTP client**
   - Small service, e.g. `CoreBackendClient`, that sends:
     - `Authorization: Bearer ${CORE_BACKEND_SERVICE_ACCOUNT_API_KEY}`
     - `Content-Type: application/json`
   - Timeout, no cookie jar, log status without logging the key.
   - Base URL from `CORE_BACKEND_URL` with no trailing slash.

3. **Use it where the Payments API needs core merchant/link data**, for example:
   - `GET /api/auth/me` — connectivity check
   - `GET /api/business/profile` — merchant profile for the service wallet (or later: scoped business id if you add that)
   - `GET /api/payment-link/:id` — public checkout metadata (no key required today; still use the client for consistency if calling from the server)
   - `POST /api/payment-link` / list / confirm only if product requires the gateway to create/confirm links as the service merchant

4. **Do not**
   - Commit real keys
   - Send the service key to browsers
   - Mix this key with merchant `sk_test_` / `sk_live_` keys (`ApiKeyGuard`)
   - Call core `/internal/*` — that direction is core → api with `INTERNAL_SERVICE_TOKEN`

5. **Tests**
   - Unit-test the client with a mocked fetch
   - One integration test: missing key → 401 from core; valid key → 200 `/api/auth/me` with `auth: "service"`

6. **Docs / .env.example**
   - Document `CORE_BACKEND_URL` and `CORE_BACKEND_SERVICE_ACCOUNT_API_KEY`
   - Render env for hypertron-api: set both; values must match core Render env

## Auth matrix (keep this)

| Caller | Target | Credential |
|---|---|---|
| Browser dashboard | core-backend | `ht_dashboard` cookie |
| Browser / merchant app | hypertron-api `/v1/*` | `Authorization: Bearer sk_test_…` / `sk_live_…` |
| Core backend | hypertron-api `/internal/*` | `X-Internal-Token` |
| Hypertron-api | core-backend `/api/*` | `Authorization: Bearer ht_svc_…` (this task) |

Preserve existing architecture. Smallest production-safe change.
