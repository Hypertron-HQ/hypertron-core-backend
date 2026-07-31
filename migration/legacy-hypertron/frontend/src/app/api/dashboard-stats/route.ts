import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import { getPaymentDetailsByTransactionHash } from "@/lib/horizon";

export const dynamic = "force-dynamic";
const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/**
 * Phase 3: Dashboard stats for overview cards.
 * GET /api/dashboard-stats?businessId=...
 * Returns totalReceived (sum of paid amounts), linkCount, completed, pending.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId?.trim()) {
      return NextResponse.json(
        { error: "businessId query required" },
        { status: 400 }
      );
    }

    const bid = businessId.trim();
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const [links, paidLinks] = await Promise.all([
      db.paymentLink.findMany({
        where: { businessId: bid },
        select: { id: true, paidAt: true, amount: true },
      }),
      db.paymentLink.findMany({
        where: { businessId: bid, paidAt: { not: null } },
        select: { id: true, amount: true, paymentTxHash: true, paidAt: true },
      }),
    ]);

    const completed = paidLinks.length;
    const pending = links.length - completed;
    let totalReceived = 0;
    for (const p of paidLinks) {
      let amountStr = p.amount ?? "";
      const isMissingAmount = String(amountStr).trim() === "";
      if (isMissingAmount && p.paymentTxHash) {
        try {
          const details = await getPaymentDetailsByTransactionHash(
            p.paymentTxHash,
            STELLAR_NETWORK
          );
          if (details && Number.isFinite(parseFloat(details.amount))) {
            amountStr = details.amount;
            const paidAtFromLedger = details.createdAt
              ? new Date(details.createdAt)
              : p.paidAt ?? undefined;
            const nextPaidAt =
              paidAtFromLedger && !Number.isNaN(paidAtFromLedger.getTime())
                ? paidAtFromLedger
                : p.paidAt;
            await db.paymentLink.update({
              where: { id: p.id },
              data: {
                amount: details.amount,
                paidAt: nextPaidAt,
                ...(details.sourceAccount
                  ? { payerAddress: details.sourceAccount }
                  : {}),
              },
            });
          }
        } catch {
          // Skip backfill failure; stats falls back to existing values.
        }
      }

      const amt = parseFloat(String(amountStr));
      if (Number.isFinite(amt)) totalReceived += amt;
    }

    return NextResponse.json({
      businessId: bid,
      totalReceivedXlm: totalReceived.toFixed(4),
      linkCount: links.length,
      completed,
      pending,
    });
  } catch (e) {
    console.error("Dashboard stats error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
