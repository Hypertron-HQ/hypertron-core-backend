/**
 * Server-side Horizon helpers for payment attribution (pool + memo).
 * Uses /accounts/{id}/payments to find incoming payments, then matches by transaction memo.
 */

import { getClassicAssetIssuer, type PaymentAssetCode } from "@/lib/stellar-assets";
import { getHorizonUrl, type StellarNetwork } from "./stellar-payment";

export interface HorizonTransaction {
  id: string;
  source_account?: string;
  memo?: string;
  memo_type?: string;
  created_at: string;
  successful: boolean;
}

/** Horizon payment record (payment operation). */
interface HorizonPayment {
  id: string;
  from: string;
  to: string;
  type: string;
  transaction_hash: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  created_at: string;
  transaction?: { memo_type?: string; memo?: string };
}

function paymentMatchesAsset(
  payment: HorizonPayment,
  currency: PaymentAssetCode,
  network: StellarNetwork
): boolean {
  if (currency === "XLM") {
    return payment.asset_type === "native" || !payment.asset_code;
  }
  const issuer = getClassicAssetIssuer(currency, network);
  return (
    payment.asset_type === "credit_alphanum4" &&
    payment.asset_code === currency &&
    payment.asset_issuer === issuer
  );
}

/** Decode memo from Horizon tx. With join=transactions, Horizon may return memo already decoded (plain string); otherwise it's base64. */
function decodeMemo(tx: { memo_type?: string; memo?: string }): string | null {
  if (tx.memo_type !== "text") return null;
  if (!tx.memo) return "";
  const raw = String(tx.memo).trim();
  if (!raw) return "";
  // When Horizon embeds transaction (join=transactions), memo is often already plain text.
  if (!/^[A-Za-z0-9+/]+=*$/.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded || raw;
  } catch {
    return raw;
  }
}

/** Get transaction memo (fetch full tx if not in payment record). */
async function getTransactionMemo(
  txHash: string,
  network: StellarNetwork
): Promise<string | null> {
  const base = getHorizonUrl(network);
  const res = await fetch(`${base}/transactions/${encodeURIComponent(txHash)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const tx = (await res.json()) as { memo_type?: string; memo?: string };
  return decodeMemo(tx);
}

/** Get memo hash from tx as hex (32 bytes). For memo_type "hash", memo is base64. */
function getMemoHashHex(tx: { memo_type?: string; memo?: string }): string | null {
  if (tx.memo_type !== "hash" || !tx.memo) return null;
  try {
    const raw = String(tx.memo).trim();
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf.toString("hex");
  } catch {
    return null;
  }
}

/** Get the source (payer) account of a transaction. */
export async function getTransactionSourceAccount(
  txHash: string,
  network: StellarNetwork
): Promise<string | null> {
  const base = getHorizonUrl(network);
  const res = await fetch(`${base}/transactions/${encodeURIComponent(txHash)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const tx = (await res.json()) as { source_account?: string };
  return tx.source_account ?? null;
}

/**
 * Find an incoming payment to the account with the given memo.
 * Uses /accounts/{id}/payments so we only consider payment operations (incoming when to === accountId).
 */
export async function findPaymentToAccountByMemo(
  accountId: string,
  memoFilter: string,
  network: StellarNetwork,
  limit = 100,
  currency: PaymentAssetCode = "USDC"
): Promise<{ txHash: string; memo: string; sourceAccount: string; amount: string; createdAt: string } | null> {
  const base = getHorizonUrl(network);
  const pool = accountId.trim();
  const want = memoFilter.trim();

  // Get payments where this account participated; we want incoming (to === pool).
  // join=transactions embeds tx so we can read memo without extra request.
  const url = `${base}/accounts/${encodeURIComponent(pool)}/payments?limit=${limit}&order=desc&join=transactions`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Horizon] payments fetch failed", res.status, await res.text());
    }
    return null;
  }

  const data = (await res.json()) as { _embedded?: { records?: HorizonPayment[] } };
  const records = data._embedded?.records ?? [];

  for (const payment of records) {
    if (payment.type !== "payment") continue;
    if (payment.to !== pool) continue; // only incoming to pool
    if (!paymentMatchesAsset(payment, currency, network)) continue;

    const txHash = payment.transaction_hash;
    let memo: string | null = null;
    if (payment.transaction?.memo_type != null) {
      memo = decodeMemo(payment.transaction);
    }
    if (memo === null) {
      memo = await getTransactionMemo(txHash, network);
    }
    if (memo === null) continue;
    if (memo.trim() !== want) continue;

    const sourceAccount =
      payment.from ?? (await getTransactionSourceAccount(txHash, network)) ?? "";
    return {
      txHash,
      memo: memo.trim(),
      sourceAccount,
      amount: payment.amount ?? "0",
      createdAt: payment.created_at,
    };
  }
  return null;
}

/** Incoming payment with hash memo (for dark pool). */
export interface PaymentWithHashMemo {
  txHash: string;
  memoHashHex: string;
  sourceAccount: string;
  amount: string;
  createdAt: string;
}

/**
 * Fetch recent incoming payments to the pool that have a hash memo.
 * Used to match dark-pool payments to PendingPaymentMemo.
 */
export async function findPaymentsToAccountWithHashMemo(
  accountId: string,
  network: StellarNetwork,
  limit = 100
): Promise<PaymentWithHashMemo[]> {
  const base = getHorizonUrl(network);
  const pool = accountId.trim();
  const url = `${base}/accounts/${encodeURIComponent(pool)}/payments?limit=${limit}&order=desc&join=transactions`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { _embedded?: { records?: HorizonPayment[] } };
  const records = data._embedded?.records ?? [];
  const out: PaymentWithHashMemo[] = [];

  for (const payment of records) {
    if (payment.type !== "payment") continue;
    if (payment.to !== pool) continue;
    const memoHashHex = payment.transaction
      ? getMemoHashHex(payment.transaction)
      : null;
    if (!memoHashHex) continue;
    const sourceAccount =
      payment.from ?? (await getTransactionSourceAccount(payment.transaction_hash, network)) ?? "";
    out.push({
      txHash: payment.transaction_hash,
      memoHashHex,
      sourceAccount,
      amount: (payment as { amount?: string }).amount ?? "0",
      createdAt: payment.created_at,
    });
  }
  return out;
}

/** Daily aggregate of incoming payments (for transaction analytics). */
export interface DailyPaymentStats {
  date: string; // YYYY-MM-DD
  count: number;
  totalAmount: number;
}

/** Resolve amount + created time for a specific transaction hash (payment operation). */
export async function getPaymentDetailsByTransactionHash(
  txHash: string,
  network: StellarNetwork
): Promise<{ amount: string; createdAt: string; sourceAccount: string } | null> {
  const base = getHorizonUrl(network);
  const url = `${base}/transactions/${encodeURIComponent(txHash)}/payments?limit=20&order=desc`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as { _embedded?: { records?: HorizonPayment[] } };
  const records = data._embedded?.records ?? [];
  const payment = records.find((record) => record.type === "payment");
  if (!payment) return null;

  const sourceAccount =
    payment.from ?? (await getTransactionSourceAccount(txHash, network)) ?? "";
  return {
    amount: payment.amount ?? "0",
    createdAt: payment.created_at,
    sourceAccount,
  };
}

/**
 * Fetch incoming payments to the account from Stellar Horizon and aggregate by day.
 * Used for dashboard transaction analytics (daily payments received).
 */
export async function getDailyIncomingPayments(
  accountId: string,
  network: StellarNetwork,
  options: { days?: number; limit?: number } = {}
): Promise<DailyPaymentStats[]> {
  const { days = 30, limit = 200 } = options;
  const base = getHorizonUrl(network);
  const pool = accountId.trim();
  const url = `${base}/accounts/${encodeURIComponent(pool)}/payments?limit=${limit}&order=desc`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { _embedded?: { records?: HorizonPayment[] } };
  const records = data._embedded?.records ?? [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const byDay = new Map<string, { count: number; totalAmount: number }>();

  for (const payment of records) {
    if (payment.type !== "payment") continue;
    if (payment.to !== pool) continue;
    const created = new Date(payment.created_at);
    if (created < cutoff) continue;
    const dateKey = payment.created_at.slice(0, 10);
    const amount = parseFloat((payment as { amount?: string }).amount ?? "0") || 0;
    const existing = byDay.get(dateKey) ?? { count: 0, totalAmount: 0 };
    byDay.set(dateKey, {
      count: existing.count + 1,
      totalAmount: existing.totalAmount + amount,
    });
  }

  const sorted = Array.from(byDay.entries())
    .map(([date, v]) => ({ date, count: v.count, totalAmount: v.totalAmount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return sorted;
}
