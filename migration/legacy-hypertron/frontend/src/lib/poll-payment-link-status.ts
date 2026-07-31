export type PaymentLinkStatusResult =
  | { status: "paid"; paymentTxHash?: string }
  | { status: "pending"; hint?: string }
  | { status: "expired" }
  | { status: "error"; error: string };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Single status check against Horizon via the payment-link status API. */
export async function fetchPaymentLinkStatus(linkId: string): Promise<PaymentLinkStatusResult> {
  try {
    const res = await fetch(`/api/payment-link/${linkId}/status`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 410) return { status: "expired" };
    if (!res.ok) {
      return {
        status: "error",
        error: typeof data?.error === "string" ? data.error : "Status check failed",
      };
    }
    if (data.status === "paid") {
      return {
        status: "paid",
        paymentTxHash: typeof data.paymentTxHash === "string" ? data.paymentTxHash : undefined,
      };
    }
    return {
      status: "pending",
      hint: typeof data.hint === "string" ? data.hint : undefined,
    };
  } catch (e) {
    return {
      status: "error",
      error: e instanceof Error ? e.message : "Status check failed",
    };
  }
}

/** Poll until paid, expired, error, or attempts exhausted. */
export async function pollPaymentLinkStatus(
  linkId: string,
  options?: { maxAttempts?: number; intervalMs?: number; signal?: AbortSignal }
): Promise<PaymentLinkStatusResult> {
  const maxAttempts = options?.maxAttempts ?? 15;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fetchPaymentLinkStatus(linkId);
    if (result.status === "paid" || result.status === "expired" || result.status === "error") {
      return result;
    }
    if (attempt < maxAttempts - 1) {
      try {
        await sleep(intervalMs, options?.signal);
      } catch {
        return { status: "error", error: "Cancelled" };
      }
    }
  }
  return { status: "pending" };
}

/** Notify dashboard views to refresh payment stats and transaction lists. */
export function notifyPaymentReceived(linkId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("hypertron:payment-received", { detail: { linkId } })
  );
}

/** Check status for multiple pending links (merchant dashboard). */
export async function syncPendingPaymentLinks(
  linkIds: string[]
): Promise<{ confirmed: string[] }> {
  const confirmed: string[] = [];
  for (const linkId of linkIds) {
    const result = await fetchPaymentLinkStatus(linkId);
    if (result.status === "paid") {
      confirmed.push(linkId);
    }
  }
  if (confirmed.length > 0) {
    notifyPaymentReceived(confirmed[0]);
  }
  return { confirmed };
}
