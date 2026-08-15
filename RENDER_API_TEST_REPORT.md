# Hypertron Core Backend — Render API test report

**Target (local retest after fixes):** `http://127.0.0.1:4010`  
**Retested:** 2026-08-15T17:58:27Z (UTC)  
**Auth:** service account `Authorization: Bearer $SERVICE_ACCOUNT_API_KEY`  
**Live Render:** https://hypertron-core-backend.onrender.com — still the previous image until you **deploy this commit** and set the new env vars.

---

## Fixes applied (from previous errors)

| Issue | Fix |
|---|---|
| CORS only `localhost` | `CORS_ORIGIN` is still required for extra origins. `FRONTEND_URL` and `APP_URL` are now also allowed origins. Set production frontend URL on Render. |
| Cookie `SameSite=Lax` in production | Production now defaults to `SameSite=None; Secure`. Override with `COOKIE_SAMESITE=lax` only if the dashboard is same-site. |
| Authenticated flows untested | Service account API key (`ht_svc_…`) can call all session-gated routes. |
| POST challenge/logout returned 201 | `@HttpCode(200)` on those routes. |
| Confirm unknown id without auth returned 404 | Auth is checked first → **401**, then **404** if the link is missing. |
| `/health` did not check Mongo | `/health` now pings the database (`database: "ok"`). `GET /` stays process liveness. |

---

## Service account

Set these on **local `.env` and Render** (never commit the real key):

```
SERVICE_ACCOUNT_API_KEY=ht_svc_<your-secret>
SERVICE_ACCOUNT_WALLET=GSVCACCOUNTTESTNET00000000000000000000000000000000000000
```

Use either header:

```
Authorization: Bearer $SERVICE_ACCOUNT_API_KEY
```

or

```
X-Service-Key: $SERVICE_ACCOUNT_API_KEY
```

`GET /api/auth/me` returns `{ "auth": "service", "walletAddress": "<SERVICE_ACCOUNT_WALLET>" }`.  
The Business row for that wallet is created on first profile/link call.

**Render also needs (dashboard CORS):**

```
CORS_ORIGIN=https://<your-frontend-host>
FRONTEND_URL=https://<your-frontend-host>
COOKIE_SAMESITE=none
```

Prompt for wiring this key into `hypertron-api`: `HYPERTRON_API_SERVICE_ACCOUNT_PROMPT.md`.

---

## Result table (local, after fix)

| # | Request | Status | Result |
|---|---|---|---|
| 1 | `GET /` | 200 | liveness ok |
| 2 | `GET /health` | 200 | `database: ok` |
| 3 | OPTIONS CORS `http://localhost:3000` | 204 | ACAO set |
| 4 | challenge missing wallet | 400 | validation |
| 5 | challenge valid G-address | **200** (was 201) | challengeId |
| 6 | `GET /api/auth/me` no auth | 401 | Unauthorized |
| 7 | `GET /api/auth/me` bad key | 401 | Invalid service account key |
| 8 | `GET /api/auth/me` service key | **200** | `auth: service` |
| 9 | `POST /api/auth/logout` | **200** (was 201) | `{ok:true}` |
| 10 | confirm unknown, no auth | **401** (was 404) | Unauthorized |
| 11 | confirm unknown, with key | 404 | Payment link not found |
| 12 | `GET /api/business/profile` | **200** | business created |
| 13 | `PATCH /api/business/profile` | **200** | name updated |
| 14 | `POST /api/business/link` | 201 | receiveAddress set |
| 15 | `PATCH /api/business/link` | **200** | receiveAddress set |
| 16 | `POST /api/payment-link` | 201 | link created |
| 17 | `GET /api/payment-link?businessId=` | **200** | list |
| 18 | `GET /api/payment-link/:id` public | **200** | checkout payload |
| 19 | claim empty body | 400 | txHash required |
| 20 | claim with txHash | 201 | claimed |
| 21 | confirm with service key | 201 | confirmed/paid |

---

## Curl log and API responses

Base: `http://127.0.0.1:4010`  
Header: `-H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"`

Service wallet:

`GSVCACCOUNTTESTNET00000000000000000000000000000000000000`

Created in this run:

- `businessId`: `cmsuoj7ws0001uune7slmpnts`
- `linkId`: `cmsuojk7d0003uunehic2uv2x`

### Health

```bash
curl -sS http://127.0.0.1:4010/
```

**200** `{"service":"hypertron-core-backend","status":"ok"}`

```bash
curl -sS http://127.0.0.1:4010/health
```

**200** `{"service":"hypertron-core-backend","status":"ok","database":"ok"}`

### CORS

```bash
curl -sS -D - -o /dev/null -X OPTIONS http://127.0.0.1:4010/api/auth/me \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET"
```

**204** `Access-Control-Allow-Origin: http://localhost:3000`

### Auth

```bash
curl -sS -X POST http://127.0.0.1:4010/api/auth/challenge \
  -H "Content-Type: application/json" -d '{}'
```

**400** `{"error":"walletAddress required (Stellar G..., 56 chars)"}`

```bash
curl -sS -X POST http://127.0.0.1:4010/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**200**

```json
{
  "challengeId": "cmsuoj7mf0000uunecoabdsr2",
  "message": "Hypertron dashboard sign-in\n\nWallet: GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR\nNonce: d47fd6edf2445b220b869d504ecff27b43dda92f588dbefa\nExpires (UTC): 2026-08-15T18:08:27.926Z\n\nSigning this message proves you control this wallet. Do not share this signature.",
  "expiresAt": "2026-08-15T18:08:27.926Z"
}
```

```bash
curl -sS http://127.0.0.1:4010/api/auth/me
```

**401** `{"error":"Unauthorized"}`

```bash
curl -sS http://127.0.0.1:4010/api/auth/me \
  -H "Authorization: Bearer ht_svc_invalid"
```

**401** `{"error":"Invalid service account key"}`

```bash
curl -sS http://127.0.0.1:4010/api/auth/me \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

**200**

```json
{
  "auth": "service",
  "walletAddress": "GSVCACCOUNTTESTNET00000000000000000000000000000000000000"
}
```

```bash
curl -sS -D - -X POST http://127.0.0.1:4010/api/auth/logout
```

**200** `{"ok":true}`  
`Set-Cookie: ht_dashboard=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`  
(local `NODE_ENV` is not `production`, so SameSite stays Lax unless you set `COOKIE_SAMESITE=none`)

### Confirm auth order

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx/confirm
```

**401** `{"error":"Unauthorized"}`

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link/clxxxxxxxxxxxxxxxxxxxxxxxxx/confirm \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

**404** `{"error":"Payment link not found"}`

### Business (service account)

```bash
curl -sS http://127.0.0.1:4010/api/business/profile \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

**200** (first call created the business)

```json
{
  "businessId": "cmsuoj7ws0001uune7slmpnts",
  "name": "",
  "email": "",
  "businessNature": "",
  "selectedWidgets": [],
  "selectedTier": null,
  "selectedTierName": null,
  "selectedTierAt": null,
  "receiveAddress": null,
  "viewPub": null,
  "spendPub": null,
  "complianceForm": null
}
```

```bash
curl -sS -X PATCH http://127.0.0.1:4010/api/business/profile \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Service Account Test Co"}'
```

**200** `"name":"Service Account Test Co"`

```bash
curl -sS -X POST http://127.0.0.1:4010/api/business/link \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"receiveAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**201**

```json
{
  "businessId": "cmsuoj7ws0001uune7slmpnts",
  "receiveAddress": "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"
}
```

```bash
curl -sS -X PATCH http://127.0.0.1:4010/api/business/link \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"receiveAddress":"GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR"}'
```

**200** same payload.

### Payment links

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"cmsuoj7ws0001uune7slmpnts","amount":"1.00","currency":"USDC","purpose":"service-account-test"}'
```

**201**

```json
{
  "linkId": "cmsuojk7d0003uunehic2uv2x",
  "url": "http://localhost:3000/pay/cmsuojk7d0003uunehic2uv2x",
  "qrPayload": "http://localhost:3000/pay/cmsuojk7d0003uunehic2uv2x",
  "memo": "hpl_msuojk5v_f35c2f1c2905",
  "amount": "1.00",
  "currency": "USDC",
  "expiresAt": null,
  "paymentMethods": ["wallet", "qr"],
  "destinationAddress": "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
  "mode": "direct_receive",
  "shieldSalt": null,
  "shieldCommitment": null,
  "shieldProof": null
}
```

```bash
curl -sS "http://127.0.0.1:4010/api/payment-link?businessId=cmsuoj7ws0001uune7slmpnts" \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

**200** `{"links":[{ "id":"cmsuojk7d0003uunehic2uv2x", ... }]}`

```bash
curl -sS http://127.0.0.1:4010/api/payment-link/cmsuojk7d0003uunehic2uv2x
```

**200** public checkout payload (`businessName`: `Service Account Test Co`).

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link/cmsuojk7d0003uunehic2uv2x/claim \
  -H "Content-Type: application/json" -d '{}'
```

**400** `{"error":"txHash required"}`

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link/cmsuojk7d0003uunehic2uv2x/claim \
  -H "Content-Type: application/json" \
  -d '{"txHash":"testhash","outCommitment":"aabbcc"}'
```

**201**

```json
{
  "id": "cmsuojk7d0003uunehic2uv2x",
  "claimedAt": "2026-08-15T17:58:44.829Z",
  "claimTxHash": "testhash",
  "claimOutCommitment": "0xaabbcc"
}
```

```bash
curl -sS -X POST http://127.0.0.1:4010/api/payment-link/cmsuojk7d0003uunehic2uv2x/confirm \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

**201**

```json
{
  "id": "cmsuojk7d0003uunehic2uv2x",
  "confirmedAt": "2026-08-15T17:58:45.211Z",
  "paidAt": "2026-08-15T17:58:45.211Z",
  "paymentTxHash": "testhash"
}
```

---

## Deploy checklist (Render)

1. Push this commit (Dockerfile + service-account auth).
2. Set env:

```
CORS_ORIGIN=https://<frontend>
FRONTEND_URL=https://<frontend>
COOKIE_SAMESITE=none
SERVICE_ACCOUNT_API_KEY=<same ht_svc_ key as local>
SERVICE_ACCOUNT_WALLET=GSVCACCOUNTTESTNET00000000000000000000000000000000000000
```

3. Redeploy, then:

```bash
curl -sS https://hypertron-core-backend.onrender.com/health
curl -sS https://hypertron-core-backend.onrender.com/api/auth/me \
  -H "Authorization: Bearer $SERVICE_ACCOUNT_API_KEY"
```

Expect `{"auth":"service","walletAddress":"GSVC…"}`.
