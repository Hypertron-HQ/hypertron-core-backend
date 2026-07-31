# Route Inventory

The following backend route groups were transferred from the old `hypertron/frontend/src/app/api` tree into `migration/legacy-hypertron/frontend/src/app/api`.

## Already Ported To Live Nest Modules

- `auth`
  Status: wallet challenge/SEP-53 verification, signed sessions, logout, Privy sync, and Privy wallet metadata are active in `src/auth`.
- `balance`
  Status: virtual balances from committed, unspent payment links are active in `src/balance`.
- `business/link`
  Status: authenticated business linking and receive-address updates are active in `src/business`.
- `business/profile`
  Status: authenticated profile retrieval and updates, including active-template validation, are active in `src/business`.
- `payment-link`
  Status: database-backed create, authenticated listing, and public link retrieval are active in `src/payment-links`.
- `payment-link/[id]`
  Status: public link retrieval is active in `src/payment-links`; payment status and sponsored payment subroutes remain pending.
- `templates`
  Status: authenticated template list, create, retrieve, and update routes are active in `src/templates`.
- `workspace/create`
  Status: workspace wizard persistence is active in `src/workspace`.

## Still Pending Nest Port

- `agentic/rns`
- `agentic/widgets`
- `compliance-agent`
- `compliance/generate`
- `dashboard-stats`
- `employees`
- `events`
- `payment-link/[id]/prepare-pay`
- `payment-link/[id]/status`
- `payment-link/[id]/submit-sponsored-pay`
- `payment-send`
- `regintel`
- `relayer/process`
- `transaction-analytics`
- `vault`
- `vault/treasury`
- `vault/treasury/withdraw`
- `withdraw`

## Notes

- The pending payment-link settlement subroutes depend on the transferred Horizon, relayer, and privacy adapters. They must be migrated together to avoid changing on-chain attribution behavior.
- The remaining route groups still depend on the transferred legacy server libs and Prisma schema. Each should be converted into a Nest feature module under `src/` rather than retaining Next route semantics.
