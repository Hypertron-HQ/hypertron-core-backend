import type { NextRequest } from "next/server";

import { PAYMENT_LINK_PUBLIC_BASE } from "@/lib/payment-link-public-url";

const PRODUCTION_BASE = "https://www.hypertron.space";

export { PAYMENT_LINK_PUBLIC_BASE };

/**
 * Base URL for payment link share URLs / QR payloads.
 * Override with NEXT_PUBLIC_PAYMENT_LINK_BASE_URL; otherwise uses hypertron.space in dev
 * and resolveAppBaseUrl in production.
 */
export function resolvePaymentLinkBaseUrl(req: NextRequest): string {
  const override = process.env.NEXT_PUBLIC_PAYMENT_LINK_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (!isProduction) return PAYMENT_LINK_PUBLIC_BASE;

  const appBase = resolveAppBaseUrl(req);
  if (appBase.includes("localhost") || appBase.includes("127.0.0.1")) {
    return PAYMENT_LINK_PUBLIC_BASE;
  }
  return appBase;
}

/**
 * Base URL for absolute links (payment URLs, QR payloads).
 * When NEXT_PUBLIC_APP_URL is unset, uses the incoming request origin so
 * `next dev --experimental-https` matches (https://localhost:3000) and plain `next dev` still works (http://...).
 */
export function resolveAppBaseUrl(req: NextRequest): string {
  const rawBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const isProductionOrMain =
    process.env.NODE_ENV === "production" || process.env.VERCEL_GIT_COMMIT_REF === "main";
  if (rawBase) {
    if (isProductionOrMain && (!rawBase || rawBase.includes("localhost"))) {
      return PRODUCTION_BASE;
    }
    return rawBase;
  }
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}
