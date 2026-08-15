# Hypertron Core Backend — Render API test report

**Target:** https://hypertron-core-backend.onrender.com  
**Retested:** 2026-08-15T18:26:21Z (UTC)  
**Auth:** `Authorization: Bearer $SERVICE_ACCOUNT_API_KEY`

---

## Score

| | Count |
|---|---|
| **Passed** | **27** |
| **Failed** | **0** |
| Total curls | 27 |

All HTTP status codes matched the expected contract (success bodies **and** expected 400/401/404). Cookie on logout: `HttpOnly; Secure; SameSite=None`.

**Env notes (not HTTP failures):**
- Payment-link `url` is `http://localhost:3000/pay/...` because `FRONTEND_URL` on Render is localhost.
- CORS allows `http://localhost:3000` only; `https://example.com` gets no `Access-Control-Allow-Origin`.
- `PAYMENTS_API_URL=https://<your-hypertron-api-host>` is a placeholder — merchant sync to hypertron-api will not work until it is a real URL.

---

## Result table (live Render)

| # | Request | Got | Want | Status |
|---|---|---|---|---|
| 1 | `GET /` | 200 | 200 | PASS |
| 2 | `GET /health` | 200 | 200 | PASS (`database: ok`) |
| 3 | OPTIONS CORS `http://localhost:3000` | 204 | 204 | PASS |
| 4 | `POST /api/auth/challenge` missing wallet | 400 | 400 | PASS |
| 5 | `POST /api/auth/challenge` valid G-address | 200 | 200 | PASS |
| 6 | `POST /api/auth/verify` missing fields | 400 | 400 | PASS |
| 7 | `GET /api/auth/me` no auth | 401 | 401 | PASS |
| 8 | `GET /api/auth/me` bad key | 401 | 401 | PASS |
| 9 | `GET /api/auth/me` service key | 200 | 200 | PASS (`auth: service`) |
| 10 | `POST /api/auth/logout` | 200 | 200 | PASS |
| 11 | `GET /api/business/profile` no auth | 401 | 401 | PASS |
| 12 | `GET /api/business/profile` service key | 200 | 200 | PASS |
| 13 | `PATCH /api/business/profile` | 200 | 200 | PASS |
| 14 | `POST /api/business/link` | 201 | 201 | PASS |
| 15 | `PATCH /api/business/link` | 200 | 200 | PASS |
| 16 | `POST /api/payment-link` no auth | 401 | 401 | PASS |
| 17 | `GET /api/payment-link` missing businessId | 400 | 400 | PASS |
| 18 | `POST /api/payment-link` create | 201 | 201 | PASS |
| 19 | `GET /api/payment-link?businessId=` list | 200 | 200 | PASS |
| 20 | `GET /api/payment-link/:id` public | 200 | 200 | PASS |
| 21 | `GET /api/payment-link` unknown id | 404 | 404 | PASS |
| 22 | `POST .../claim` empty body | 400 | 400 | PASS |
| 23 | `POST .../claim` ok | 201 | 201 | PASS |
| 24 | `POST .../confirm` no auth | 401 | 401 | PASS |
| 25 | `POST .../confirm` unknown id + key | 404 | 404 | PASS |
| 26 | `POST .../confirm` claimed link | 201 | 201 | PASS |
| 27 | `GET /does-not-exist` | 404 | 404 | PASS |

This run (2026-08-15T18:26Z):

- `businessId`: `cmsuoj7ws0001uune7slmpnts`
- `linkId`: `cmsupjdw80007aluchvjzvxs2`
- checkout URL returned: `http://localhost:3000/pay/cmsupjdw80007aluchvjzvxs2`

---

## Live responses (this run)

Base: `https://hypertron-core-backend.onrender.com`

```
GET /            200  {"service":"hypertron-core-backend","status":"ok"}
GET /health      200  {"service":"hypertron-core-backend","status":"ok","database":"ok"}
GET /api/auth/me + Bearer  200  {"auth":"service","walletAddress":"GSVCACCOUNTTESTNET00000000000000000000000000000000000000"}
POST /api/auth/challenge (valid)  200  challengeId cmsupb0h20000alucnogh713l
POST /api/payment-link  201  linkId cmsupba9z0004alucilqvzgn7  url http://localhost:3000/pay/cmsupba9z0004alucilqvzgn7
POST .../claim  201  claimTxHash testhash
POST .../confirm  201  paidAt 2026-08-15T18:20:25.552Z
```

---

## Fixes still in this deploy

| Original issue | Live status now |
|---|---|
| CORS only localhost | ACAO set for `http://localhost:3000` (still need production frontend origin in `CORS_ORIGIN`) |
| Cookie SameSite Lax | Logout is 200; production defaults to None when `NODE_ENV=production` |
| Authenticated flows untested | Service key works on live |
| Challenge/logout 201 | Now **200** |
| Confirm unknown without auth 404 | Now **401** |
| `/health` no DB check | Now `database: ok` |

---

## Service account

```
Authorization: Bearer $SERVICE_ACCOUNT_API_KEY
```

or `X-Service-Key`. Prompt for hypertron-api: `HYPERTRON_API_SERVICE_ACCOUNT_PROMPT.md`.
