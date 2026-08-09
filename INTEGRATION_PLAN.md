# Hypertron Core Backend ↔ Payments API Integration Plan

> **Goal:** Let dashboard users (via `hypertron-core-backend`) generate API keys that authenticate against `hypertron-api` payment routes (`/v1/payments`, `/v1/customers`).
>
> **Status:** Ready to execute part-by-part  
> **Prerequisite on payments API:** Phases 0–5 done (keys + payments CRUD exist). Phase 6+ not required for this integration.

---

## Current state (why this plan exists)

| Layer | Today |
|-------|--------|
| Shared MongoDB | Both services point at the same `hypertron` DB |
| `Membership` / `Business` | Owned by **core-backend**; payments API reads `Membership` |
| API key storage + `/v1/*` | Owned by **hypertron-api** |
| Key management HTTP API | Lives on **hypertron-api** (`/api/developer/api-keys`) |
| Dashboard auth | Lives on **core-backend** (`ht_dashboard` / `ht_privy` cookies) |
| payments `SessionGuard` | Stub only (unsigned base64 JSON) — **not** wired to core cookies |
| core-backend developer routes | **None** |
| Frontend Developers → API Keys | **Mock data only** |

```
TODAY
  Frontend ──cookies──► core-backend (auth, business, payment-links)
  Merchant SDK ──sk_xxx──► hypertron-api (/v1/payments)   ← works if you mint a key manually
  Dashboard ──✗──► hypertron-api developer routes         ← not connected

TARGET
  Frontend ──cookies──► core-backend /api/developer/*
                              │
                              │ trusted internal call
                              ▼
                        hypertron-api /api/developer/*
                              │
                              ▼
                        ApiKey rows (businessId = Business.id)
                              │
  Merchant SDK ──sk_xxx───────┘──► /v1/payments
```

---

## Design choice (locked for this plan)

**Use core-backend as a BFF (Backend-for-Frontend) proxy.**

- Frontend keeps talking only to core-backend (same origin / cookies).
- core-backend validates the real dashboard session + Membership role.
- core-backend calls hypertron-api with a **short-lived internal session token** that payments API trusts.
- Raw `secret_key` is returned once through core-backend → frontend (never logged).

This avoids teaching the browser two backends and matches how auth already works.

> Companion work on `hypertron-api` is called out inside each part so the two repos stay in sync. Do those companion tasks in the same PR pair / same day.

---

## Part checklist

- [ ] **Part 1** — Shared config & health bridge
- [ ] **Part 2** — Session bridge (core cookies → payments SessionGuard)
- [ ] **Part 3** — Developer proxy module (API keys)
- [ ] **Part 4** — Role / workspace enforcement
- [ ] **Part 5** — Smoke tests (key → create payment)
- [ ] **Part 6** — Frontend wiring (API Keys page)
- [ ] **Part 7** — Hardening & docs

Execute **strictly in order**. Do not start Part N+1 until Part N’s “Definition of done” is green.

---

## Part 1 — Shared config & health bridge

**Why:** Make both services discover each other safely before any auth work.

### Do in `hypertron-core-backend`

1. Add env vars (`.env` + `.env.example`):

```bash
# Payments API (hypertron-api)
PAYMENTS_API_BASE_URL=http://127.0.0.1:3000
# Shared secret used to mint internal session tokens for payments API (Part 2)
PAYMENTS_SESSION_SECRET=<same-value-as-hypertron-api>
# Optional: fail fast if payments API is down on boot (default false in dev)
PAYMENTS_API_REQUIRED=false
```

2. Add a small `PaymentsApiConfig` / Joi (or class-validator) config reader.
3. Add `PaymentsApiClient` skeleton (HTTP client only — no auth yet):
   - `getHealth()` → `GET {PAYMENTS_API_BASE_URL}/health`
4. Expose `GET /api/integrations/payments/health` (Owner/Admin or any authenticated session) that returns payments health status for the dashboard.

### Companion in `hypertron-api`

1. Confirm `/health` is reachable from core-backend’s host.
2. Document that local default port is `3000` (api) vs `4000` (core).

### Definition of done

- [ ] core-backend starts with the new env vars
- [ ] `GET /api/integrations/payments/health` returns payments API up/down without crashing when down (`PAYMENTS_API_REQUIRED=false`)
- [ ] Both services share the same `DATABASE_URL` database name (`hypertron`)

---

## Part 2 — Session bridge

**Why:** payments `/api/developer/*` must accept a real identity derived from core-backend’s session, not the unsigned stub.

### Contract (freeze this)

Internal bearer token minted by core-backend for payments API:

```json
{
  "userId": "<AppUser.id or synthetic wallet user id>",
  "businessId": "<Business.id>",
  "role": "owner | admin | viewer",
  "exp": 1710000000,
  "iss": "hypertron-core-backend",
  "aud": "hypertron-api"
}
```

- Sign with HMAC-SHA256 using `PAYMENTS_SESSION_SECRET` (same secret on both sides).
- TTL: **60 seconds** (request-scoped). Do not reuse across user requests longer than needed.
- Map roles:
  - Membership `owner` / `admin` → same
  - Membership `finance` / `compliance` / `viewer` → `viewer` for key **reads**
  - Only `owner` / `admin` may create / rotate / revoke keys

### Do in `hypertron-core-backend`

1. Add `PaymentsSessionTokenService`:
   - `mint({ userId, businessId, role })` → signed token string
2. Resolve identity from existing `AuthService` / `BusinessAccessService`:
   - Privy session → `appUserId` + Membership for active workspace
   - Wallet session → Business by `walletAddress` (treat as owner for that business)
3. Unit tests for mint + expiry + role mapping

### Companion in `hypertron-api`

1. Replace stub `SessionGuard.validateToken()` with HMAC verification of the same payload/secret.
2. Keep `generateTestSessionToken()` for tests only (unsigned or test-secret).
3. Reject expired / wrong `aud` / missing fields with `401 authentication_error`.

### Definition of done

- [ ] core-backend can mint a token
- [ ] Manual curl: mint token → `GET http://localhost:3000/api/developer/api-keys` with `Authorization: Bearer <token>` returns `200` (empty list OK)
- [ ] Tampered / expired token → `401` from payments API

---

## Part 3 — Developer proxy module (API keys)

**Why:** Dashboard never talks to payments API directly; core-backend owns the cookie boundary.

### Do in `hypertron-core-backend`

Create `DeveloperModule`:

```
src/developer/
  developer.module.ts
  payments-api.client.ts          # authenticated HTTP calls
  api-keys.controller.ts          # /api/developer/api-keys*
  api-keys.service.ts             # session resolve → mint → proxy
  dto/
    create-api-key.dto.ts
```

#### Routes to expose (mirror payments API)

| Method | core-backend route | Proxies to payments API |
|--------|--------------------|-------------------------|
| `GET` | `/api/developer/api-keys` | `GET /api/developer/api-keys` |
| `POST` | `/api/developer/api-keys` | `POST /api/developer/api-keys` |
| `POST` | `/api/developer/api-keys/:id/rotate` | same |
| `POST` | `/api/developer/api-keys/:id/revoke` | same |

#### Request flow

```
1. Read dashboard cookie session (existing AuthService)
2. Resolve active Business + Membership role (BusinessAccessService)
3. Enforce Owner/Admin on mutating routes
4. Mint payments session token (Part 2)
5. Forward request body/params to PAYMENTS_API_BASE_URL
6. Return payments response as-is (status + JSON)
7. Never log secret_key / Authorization headers
```

#### Body for create (match payments DTO)

```json
{
  "name": "Backend production",
  "environment": "test"
}
```

### Companion in `hypertron-api`

1. Confirm create uses `user.businessId` from the bridged session (already true).
2. Optionally: on create, verify Membership exists for `(userId, businessId)` before writing `ApiKey` (hardens against forged tokens if secret leaks). Prefer this check once SessionGuard is real.

### Definition of done

- [ ] Authenticated curl against **core-backend** creates a key
- [ ] Response includes `secret_key` once
- [ ] Key row in Mongo `api_keys` has `businessId` equal to the workspace `Business.id`
- [ ] List/rotate/revoke work through core-backend
- [ ] Unauthenticated request → `401` from core-backend (never reaches payments)

---

## Part 4 — Role / workspace enforcement

**Why:** Prevent cross-workspace key leaks and viewer privilege escalation.

### Do in `hypertron-core-backend`

1. Require an explicit workspace context on developer routes:
   - Prefer header `X-Hypertron-Business-Id: <businessId>` **or**
   - Query/body `businessId` consistent with existing workspace APIs
2. Use `BusinessAccessService.requireOwnedBusiness()` (or Membership lookup) before minting.
3. Role matrix:

| Action | owner | admin | finance | compliance | viewer |
|--------|:-----:|:-----:|:-------:|:----------:|:------:|
| List keys | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / rotate / revoke | ✓ | ✓ | ✗ | ✗ | ✗ |

4. Return `403` from core-backend when role is insufficient (do not proxy).

### Companion in `hypertron-api`

1. Keep `RolesGuard` as a second line of defense.
2. Ensure list-by-membership still scopes to the session `businessId` used for creates (avoid showing keys from other businesses the user belongs to unless product wants multi-workspace list — **default: active workspace only**).

### Definition of done

- [ ] Viewer can list, cannot create
- [ ] User cannot mint keys for a `businessId` they do not belong to
- [ ] Integration test covers both cases

---

## Part 5 — Smoke tests (key → payment)

**Why:** Prove the generated key actually unlocks payment services.

### Do in `hypertron-core-backend` (script or e2e)

Add `test/integration/payments-api-keys.smoke.spec.ts` (or a `scripts/smoke-api-key.sh`):

1. Create/login session against core-backend (or seed Membership + cookie).
2. `POST /api/developer/api-keys` → capture `secret_key`.
3. Call payments API directly:

```bash
curl -s http://127.0.0.1:3000/v1/payments \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "currency": "USDC",
    "customer": { "email": "smoke@example.com" }
  }'
```

4. Expect `201` with `status: "pending"` (or `created`→`pending` per current Phase 4 behavior).
5. `GET /v1/payments/:id` with same key → `200`.
6. Wrong key / revoked key → `401`.

### Notes

- On-chain confirmation is **out of scope** (Phase 6). Success = auth + CRUD.
- Redis must be up if idempotency depends on it locally.

### Definition of done

- [ ] Smoke test passes on a clean local stack (Mongo + Redis + both Nest apps)
- [ ] Documented in README as the “developer key happy path”

---

## Part 6 — Frontend wiring (API Keys page)

**Why:** Replace mock Developers → API Keys UI with real core-backend calls.

> This part touches `hypertron-frontend`, but is required to finish the product loop. Keep backend contract stable from Parts 3–4 before starting.

### Do in `hypertron-frontend`

1. Add API client helpers, e.g. `src/lib/developer-api-keys.ts`:
   - `listApiKeys()`
   - `createApiKey({ name, environment })`
   - `rotateApiKey(id)`
   - `revokeApiKey(id)`
2. Point them at core-backend `/api/developer/api-keys` (credentials/cookies included).
3. Replace mock arrays in `developers-api-keys-page.tsx` with live data.
4. UX requirements:
   - Show raw `secret_key` in a one-time modal after create/rotate
   - Copy button; warn “you won’t see this again”
   - Mask as `sk_test_••••{lastFour}` in the table thereafter
5. Disable create/rotate/revoke for viewer roles (hide or show disabled + tooltip).

### Definition of done

- [ ] Logged-in dashboard user can create a test key in the UI
- [ ] Refreshing the page still lists the key (without secret)
- [ ] Revoke removes it from active list / marks revoked per API response

---

## Part 7 — Hardening & docs

**Why:** Make the bridge safe for staging.

### Do in `hypertron-core-backend`

1. Timeouts on payments HTTP client (e.g. 10s); map upstream 5xx → `502 payments_api_unavailable`.
2. Structured logs: `businessId`, `userId`, route — **never** secrets.
3. Rate-limit developer mutating routes (reuse existing patterns if any).
4. README section:
   - Local ports (`4000` core / `3000` payments)
   - Required shared env (`DATABASE_URL`, `PAYMENTS_SESSION_SECRET`)
   - Smoke commands from Part 5
5. Feature flag (optional): `PAYMENTS_DEVELOPER_PROXY_ENABLED=true` so staging can flip on safely.

### Companion in `hypertron-api`

1. Confirm CORS does **not** need the browser if all dashboard traffic stays on core-backend.
2. Keep `/v1/*` CORS ready for merchant backends.

### Definition of done

- [ ] Upstream down → clear error to client, no stack leak
- [ ] README documents the integration
- [ ] Checklist at top of this file can be fully ticked through Part 6

---

## Out of scope (do later)

| Item | Why later |
|------|-----------|
| Webhook endpoint proxy | Needs hypertron-api Phase 7 |
| Payment reconciler / auto-complete | hypertron-api Phase 6 |
| Live-mode compliance gates | Product policy |
| Moving key CRUD fully into core-backend DB | Would duplicate source of truth — **don’t** |
| Browser calling hypertron-api directly | Rejected in favor of BFF |

---

## Suggested execution order (calendar)

| Day | Part | Owner focus |
|-----|------|-------------|
| 1 | Parts 1–2 | Config + session bridge (both repos) |
| 2 | Parts 3–4 | Proxy + RBAC |
| 3 | Part 5 | Smoke / e2e |
| 4 | Part 6 | Frontend |
| 5 | Part 7 | Hardening + docs |

---

## Quick verification commands

```bash
# Terminal A
cd hypertron-api && pnpm start:dev      # :3000

# Terminal B
cd hypertron-core-backend && npm run start:dev   # :4000

# After Part 1
curl -s http://127.0.0.1:4000/api/integrations/payments/health | jq

# After Part 3 (with real dashboard cookie)
curl -s http://127.0.0.1:4000/api/developer/api-keys \
  -H "Cookie: ht_privy=..." \
  -H "X-Hypertron-Business-Id: <businessId>" | jq
```

---

## Decision log

| Decision | Choice |
|----------|--------|
| Integration style | BFF proxy via core-backend |
| Source of truth for keys | hypertron-api `ApiKey` collection |
| Identity link | `businessId` = core `Business.id`; `userId` = `AppUser.id` |
| Session to payments | Short-lived HMAC token (`PAYMENTS_SESSION_SECRET`) |
| Frontend talks to | core-backend only for developer key UI |
