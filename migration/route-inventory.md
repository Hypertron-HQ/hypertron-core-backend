# Route Inventory

The following backend route groups were transferred from the old `hypertron/frontend/src/app/api` tree into `migration/legacy-hypertron/frontend/src/app/api`.

## Already Ported To Live Nest Modules

- `payment-link`
  Status: basic legacy backend flow ported into `src/payment-links`

## Still Pending Nest Port

- `agentic/rns`
- `agentic/widgets`
- `auth`
- `balance`
- `business/link`
- `business/profile`
- `compliance-agent`
- `compliance/generate`
- `dashboard-stats`
- `employees`
- `events`
- `payment-link/[id]`
- `payment-send`
- `regintel`
- `relayer/process`
- `templates`
- `transaction-analytics`
- `vault`
- `vault/treasury`
- `vault/treasury/withdraw`
- `withdraw`
- `workspace/create`

## Notes

- These route groups still depend on the transferred legacy server libs and Prisma schema.
- The Nest migration should convert them into feature modules under `src/` rather than keep Next route semantics.
