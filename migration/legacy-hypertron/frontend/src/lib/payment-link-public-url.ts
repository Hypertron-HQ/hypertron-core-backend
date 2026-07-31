/** Branded origin for merchant-facing payment links (safe to import from client). */
export const PAYMENT_LINK_PUBLIC_BASE = "https://hypertron.space";

const PUBLIC_PAY_ORIGIN = PAYMENT_LINK_PUBLIC_BASE.replace(/\/$/, "");

function extractPayPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/pay/")) return parsed.pathname;
  } catch {
    const match = url.match(/\/pay\/[A-Za-z0-9_]+/);
    if (match) return match[0];
  }
  return null;
}

/** Branded URL for UI only, e.g. https://hypertron.space/pay/abc123 */
export function formatPaymentLinkForDisplay(url: string, linkId?: string): string {
  const path = extractPayPath(url) ?? (linkId?.trim() ? `/pay/${linkId.trim()}` : null);
  if (path) return `${PUBLIC_PAY_ORIGIN}${path}`;
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, PUBLIC_PAY_ORIGIN);
}

/**
 * URL for clipboard — on local dev uses the current origin (localhost:3000);
 * in production uses the real link URL from the API.
 */
export function resolvePaymentLinkCopyUrl(url: string, linkId?: string): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const onLocal =
      origin.includes("localhost") || origin.includes("127.0.0.1");
    const path = extractPayPath(url) ?? (linkId?.trim() ? `/pay/${linkId.trim()}` : null);
    if (onLocal && path) return `${origin}${path}`;
  }
  return url;
}

/** @deprecated Use resolvePaymentLinkCopyUrl — kept for any stale imports */
export function formatPaymentLinkForCopy(url: string, linkId?: string): string {
  return resolvePaymentLinkCopyUrl(url, linkId);
}

export function buildPublicPaymentLinkUrl(linkId: string): string {
  const id = linkId.trim();
  return `${PUBLIC_PAY_ORIGIN}/pay/${id}`;
}
