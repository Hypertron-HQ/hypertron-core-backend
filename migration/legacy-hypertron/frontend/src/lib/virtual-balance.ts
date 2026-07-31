import { db } from "@/lib/prisma";
import { normalizePaymentAssetCode, type PaymentAssetCode } from "@/lib/stellar-assets";

export type UnspentLink = {
  id: string;
  amount: number;
  nullifier: string;
  currency: PaymentAssetCode;
};

/** Nullifiers already spent via completed withdrawals or outbound sends. */
export async function getUsedNullifiers(businessId: string): Promise<Set<string>> {
  const [withdrawals, sends] = await Promise.all([
    db.withdrawal.findMany({
      where: { businessId, status: "completed" },
      select: { nullifiers: true },
    }),
    db.outgoingPayment.findMany({
      where: { businessId, status: "completed" },
      select: { nullifiers: true },
    }),
  ]);
  return new Set([
    ...withdrawals.flatMap((w) => w.nullifiers),
    ...sends.flatMap((s) => s.nullifiers),
  ]);
}

/** Paid, committed links with unspent nullifiers for a business. */
export async function getUnspentCommittedLinks(
  businessId: string,
  currency?: PaymentAssetCode
): Promise<UnspentLink[]> {
  const usedNullifiers = await getUsedNullifiers(businessId);

  const paidLinks = await db.paymentLink.findMany({
    where: {
      businessId,
      paidAt: { not: null },
      nullifier: { not: null },
      commitmentTxHash: { not: null },
    },
    select: { id: true, amount: true, nullifier: true, currency: true },
    orderBy: { paidAt: "desc" },
  });

  const out: UnspentLink[] = [];
  for (const link of paidLinks) {
    const nullifier = link.nullifier!;
    if (usedNullifiers.has(nullifier)) continue;
    const linkCurrency = normalizePaymentAssetCode(link.currency);
    if (currency && linkCurrency !== currency) continue;
    const amt = parseFloat(link.amount ?? "");
    if (Number.isFinite(amt) && amt > 0) {
      out.push({
        id: link.id,
        amount: amt,
        nullifier,
        currency: linkCurrency,
      });
    }
  }
  return out;
}

export function sumUnspent(unspent: UnspentLink[]): number {
  return unspent.reduce((s, u) => s + u.amount, 0);
}

/** Greedy selection of links to cover `amountNum` (same as withdraw). */
export function selectLinksForAmount(
  unspent: UnspentLink[],
  amountNum: number
): { selected: UnspentLink[]; total: number } {
  let sum = 0;
  const selected: UnspentLink[] = [];
  for (const u of unspent) {
    if (sum >= amountNum) break;
    selected.push(u);
    sum += u.amount;
  }
  return { selected, total: sum };
}

export async function getVirtualBalances(businessId: string): Promise<{
  virtualBalanceUsdc: string;
  virtualBalanceXlm: string;
  unspentCount: number;
}> {
  const unspent = await getUnspentCommittedLinks(businessId);
  let usdc = 0;
  let xlm = 0;
  for (const u of unspent) {
    if (u.currency === "XLM") xlm += u.amount;
    else usdc += u.amount;
  }
  return {
    virtualBalanceUsdc: usdc.toFixed(4),
    virtualBalanceXlm: xlm.toFixed(4),
    unspentCount: unspent.length,
  };
}
