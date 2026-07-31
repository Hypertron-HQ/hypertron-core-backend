import { normalizePaymentAssetCode, type PaymentAssetCode } from "@/lib/stellar-assets";

export const PAYMENT_METHOD_IDS = ["wallet", "qr", "onramp", "card"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

const DEFAULT_METHODS: PaymentMethodId[] = ["wallet", "qr"];

export function parseExpiryDays(raw: unknown): Date | null {
  if (raw === "never" || raw === null || raw === undefined || raw === "") return null;
  const days = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function normalizePaymentMethods(raw: unknown): PaymentMethodId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_METHODS];
  const set = new Set<PaymentMethodId>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (id === "wallet" || id === "qr" || id === "onramp") set.add(id);
  }
  if (set.size === 0) return [...DEFAULT_METHODS];
  return Array.from(set);
}

export function parseLinkCurrency(raw: unknown): PaymentAssetCode {
  return normalizePaymentAssetCode(raw);
}

export function isLinkExpired(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) return false;
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
