/**
 * Canonical payment destination for a link (relayer > pool > link fallback).
 * Must match GET /api/payment-link/[id] so pay page and sponsored submit agree.
 */
export function getExpectedPaymentDestination(linkDestinationAddress: string): string {
  const pool = (
    process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
    ""
  ).trim();
  const relayer = (process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY ?? "").trim();
  return relayer || pool || linkDestinationAddress;
}
