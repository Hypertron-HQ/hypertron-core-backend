# Hypertron Core Backend — Render API test report

**Target:** https://hypertron-core-backend.onrender.com  
**Tested:** 2026-08-15T17:42:17Z (UTC)  
**Method:** live `curl` against every public route (no Freighter session cookie)

---

## Summary

The service is **up**. MongoDB is reachable (`POST /api/auth/challenge` wrote a challenge). Auth guards and validation error paths behave as coded.

**Blockers for a hosted dashboard (Vercel → Render):**

1. `CORS_ORIGIN` only allows `http://localhost:3000`.
2. Session cookie is `SameSite=Lax` (cross-site XHR will not send `ht_dashboard`).
3. Authenticated happy paths were **not** executed (need a Freighter SEP-53 signature).

---

## Issues

### 1. CORS only allows localhost (production frontend will fail)

`CORS_ORIGIN` on Render appears to be `http://localhost:3000`.

| Origin | `Access-Control-Allow-Origin` |
|---|---|
| `http://localhost:3000` | set |
| `https://example.com` | **missing** (browser will block) |

**Fix on Render:**

```
CORS_ORIGIN=https://<your-frontend-host>
FRONTEND_URL=https://<your-frontend-host>
```

To keep local + production:

```
CORS_ORIGIN=https://<your-frontend-host>,http://localhost:3000
```

### 2. Session cookie is `SameSite=Lax`

Logout response:

```
set-cookie: ht_dashboard=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax
```

A frontend on another host (e.g. Vercel) talking to this API is **cross-site**. Browsers will not send `SameSite=Lax` cookies on credentialed XHR.

**Fix on Render:**

```
COOKIE_SAMESITE=none
```

Requires HTTPS (`Secure` is already set).

### 3. Authenticated flows not tested

These need a real Freighter signature of the challenge message, then `Cookie: ht_dashboard=...`:

- `POST /api/auth/verify` (valid signature)
- `GET /api/auth/me` (with cookie)
- `GET/PATCH /api/business/profile`
- `POST/PATCH /api/business/link`
- `POST /api/payment-link` (create)
- `GET /api/payment-link?businessId=...` (list)
- `POST /api/payment-link/:id/confirm`

### 4. Minor (not blockers)

| Item | Observed |
|---|---|
| Nest POST status | `201` on `/api/auth/challenge` and `/api/auth/logout` (not `200`) |
| Confirm without cookie, unknown id | `404 Payment link not found` (lookup before auth), not `401` |
| `GET /health` | Process liveness only; does not check Mongo. Challenge already proved DB is up. |

---

## Curl log and API responses

Base URL used in all commands: `https://hypertron-core-backend.onrender.com`

Test wallet (format only, not a signed session):

`GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR`

Unknown id used for 404 cases: `clxxxxxxxxxxxxxxxxxxxxxxxxx`

### Health

```bash
curl -i https://hypertron-core-backend.onrender.com/
```

**HTTP/2 200**

```json
{"service":"hypertron-core-backend","status":"ok"}
```

```bash
curl -i https://hypertron-core-backend.onrender.com/health
```

**HTTP/2 200**

```json
{"service":"hypertron-core-backend","status":"ok"}
```

### CORS preflight

```bash
curl -i -X OPTIONS https://hypertron-core-backend.onrender.com/api/auth/me \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type"
```

**HTTP/2 204**

```
access-control-allow-credentials: true
access-control-allow-headers: content-type
access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
access-control-allow-origin: http://localhost:3000
```

```bash
curl -i -X OPTIONS https://hypertron-core-backend.onrender.com/api/auth/me \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type"
```

**HTTP/2 204** — no `access-control-allow-origin`

### Auth

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{}'
```

**HTTP/2 400**

```json
{"error":"walletAddress required (Stellar G..., 56 chars)"}
```

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"not-a-stellar-address"}'
```

**HTTP/2 400**

```json
{"error":"walletAddress required (Stellar G..., 56 chars)"}
```

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**HTTP/2 201** (DB write succeeded)

```json
{
  "challengeId": "cmsunyhox0002osaop94bk8ay",
  "message": "Hypertron dashboard sign-in\n\nWallet: GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR\nNonce: e9ddd2ab3a9e92c8d14f1545a8716ba3128c05afbea4cbf3\nExpires (UTC): 2026-08-15T17:52:21.201Z\n\nSigning this message proves you control this wallet. Do not share this signature.",
  "expiresAt": "2026-08-15T17:52:21.201Z"
}
```

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{}'
```

**HTTP/2 400**

```json
{"error":"challengeId, walletAddress, and signedMessage required"}
```

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"clxxxxxxxxxxxxxxxxxxxxxxxxx","walletAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR","signedMessage":"aaaa"}'
```

**HTTP/2 400**

```json
{"error":"Invalid or used challenge"}
```

```bash
curl -i https://hypertron-core-backend.onrender.com/api/auth/me
```

**HTTP/2 401**

```json
{"error":"Unauthorized"}
```

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/auth/logout
```

**HTTP/2 201**

```json
{"ok":true}
```

```
set-cookie: ht_dashboard=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax
```

### Business (no cookie)

```bash
curl -i https://hypertron-core-backend.onrender.com/api/business/profile
```

**HTTP/2 401** `{"error":"Unauthorized"}`

```bash
curl -i -X PATCH https://hypertron-core-backend.onrender.com/api/business/profile \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Co"}'
```

**HTTP/2 401** `{"error":"Unauthorized"}`

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/business/link \
  -H "Content-Type: application/json" \
  -d '{"receiveAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**HTTP/2 401** `{"error":"Unauthorized"}`

```bash
curl -i -X PATCH https://hypertron-core-backend.onrender.com/api/business/link \
  -H "Content-Type: application/json" \
  -d '{"receiveAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**HTTP/2 401** `{"error":"Unauthorized"}`

### Payment links

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/payment-link \
  -H "Content-Type: application/json" \
  -d '{"businessId":"x","amount":"1"}'
```

**HTTP/2 401** `{"error":"Unauthorized"}`

```bash
curl -i https://hypertron-core-backend.onrender.com/api/payment-link
```

**HTTP/2 400** `{"error":"businessId query required"}`

```bash
curl -i "https://hypertron-core-backend.onrender.com/api/payment-link?businessId=x"
```

**HTTP/2 401** `{"error":"Unauthorized"}`

```bash
curl -i https://hypertron-core-backend.onrender.com/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx
```

**HTTP/2 404** `{"error":"Payment link not found"}`

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx/claim \
  -H "Content-Type: application/json" \
  -d '{}'
```

**HTTP/2 400** `{"error":"txHash required"}`

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx/claim \
  -H "Content-Type: application/json" \
  -d '{"txHash":"abc","outCommitment":"def"}'
```

**HTTP/2 404** `{"error":"Payment link not found"}`

```bash
curl -i -X POST https://hypertron-core-backend.onrender.com/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx/confirm
```

**HTTP/2 404** `{"error":"Payment link not found"}`

```bash
curl -i https://hypertron-core-backend.onrender.com/does-not-exist
```

**HTTP/2 404**

```json
{"message":"Cannot GET /does-not-exist","error":"Not Found","statusCode":404}
```

---

## Result table

| # | Request | Status | Body / note | Pass? |
|---|---|---|---|---|
| 1 | `GET /` | 200 | service ok | yes |
| 2 | `GET /health` | 200 | service ok | yes |
| 3 | OPTIONS CORS localhost:3000 | 204 | ACAO set | yes |
| 4 | OPTIONS CORS https://example.com | 204 | **no ACAO** | fail for hosted FE |
| 5 | challenge missing wallet | 400 | walletAddress required | yes |
| 6 | challenge invalid wallet | 400 | walletAddress required | yes |
| 7 | challenge valid G-address | 201 | challengeId + message | yes (DB ok) |
| 8 | verify missing fields | 400 | fields required | yes |
| 9 | verify fake challenge | 400 | Invalid or used challenge | yes |
| 10 | `GET /api/auth/me` no cookie | 401 | Unauthorized | yes |
| 11 | `POST /api/auth/logout` | 201 | ok; SameSite=Lax | cookie config issue |
| 12–15 | business routes no cookie | 401 | Unauthorized | yes |
| 16 | create payment-link no cookie | 401 | Unauthorized | yes |
| 17 | list payment-link no businessId | 400 | businessId query required | yes |
| 18 | list payment-link no cookie | 401 | Unauthorized | yes |
| 19 | public get unknown id | 404 | Payment link not found | yes |
| 20 | claim empty body | 400 | txHash required | yes |
| 21 | claim unknown id | 404 | Payment link not found | yes |
| 22 | confirm unknown id, no cookie | 404 | not 401 | minor |
| 23 | unknown path | 404 | Nest default | yes |

---

## Render env vars to set

```
NODE_ENV=production
DATABASE_URL=<atlas uri>
AUTH_SECRET=<long secret, match hypertron-api if cookies are shared>
CORS_ORIGIN=https://<your-frontend-host>
FRONTEND_URL=https://<your-frontend-host>
COOKIE_SAMESITE=none
PAYMENT_POOL_ADDRESS=<optional>
MERCHANT_RECIPIENT=<optional>
```

Do **not** set `PORT` on a Docker service; Render injects it.
