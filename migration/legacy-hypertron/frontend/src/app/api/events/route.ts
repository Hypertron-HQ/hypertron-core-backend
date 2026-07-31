import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { resolveAppBaseUrl } from "@/lib/app-base-url";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import { getPaymentDetailsByTransactionHash } from "@/lib/horizon";

export const dynamic = "force-dynamic";
const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/**
 * Phase 3: Per-business event stream. Returns only safe fields — no client/payer address, no pool balance.
 * GET /api/events?businessId=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId query required" }, { status: 400 });
    }

    const auth = await requireBusinessOwnedBySession(req, businessId);
    if (auth instanceof NextResponse) return auth;

    const links = await db.paymentLink.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        businessId: true,
        amount: true,
        currency: true,
        purpose: true,
        clientName: true,
        workflowStage: true,
        paidAt: true,
        paymentTxHash: true,
        commitmentTxHash: true,
        createdAt: true,
      },
    });

    const normalizedLinks = await Promise.all(
      links.map(async (link) => {
        const amountRaw = typeof link.amount === "string" ? link.amount.trim() : "";
        if (link.paidAt && link.paymentTxHash && !amountRaw) {
          try {
            const details = await getPaymentDetailsByTransactionHash(
              link.paymentTxHash,
              STELLAR_NETWORK
            );
            if (details && Number.isFinite(parseFloat(details.amount))) {
              const paidAtFromLedger = details.createdAt
                ? new Date(details.createdAt)
                : link.paidAt;
              const nextPaidAt = Number.isNaN(paidAtFromLedger.getTime())
                ? link.paidAt
                : paidAtFromLedger;

              const updated = await db.paymentLink.update({
                where: { id: link.id },
                data: {
                  amount: details.amount,
                  paidAt: nextPaidAt,
                  ...(details.sourceAccount
                    ? { payerAddress: details.sourceAccount }
                    : {}),
                },
                select: {
                  id: true,
                  businessId: true,
                  amount: true,
                  currency: true,
                  purpose: true,
                  clientName: true,
                  workflowStage: true,
                  paidAt: true,
                  commitmentTxHash: true,
                  createdAt: true,
                },
              });
              return updated;
            }
          } catch {
            // Keep existing row when backfill fails.
          }
        }
        return link;
      })
    );

    const baseUrl = resolveAppBaseUrl(req);
    const events = normalizedLinks.map((l) => ({
      linkId: l.id,
      businessId: l.businessId,
      amount: l.amount,
      currency: l.currency ?? "USDC",
      purpose: l.purpose ?? undefined,
      clientName: l.clientName ?? undefined,
      workflowStage: l.workflowStage ?? undefined,
      paidAt: l.paidAt?.toISOString() ?? undefined,
      commitmentId: l.commitmentTxHash ?? undefined,
      createdAt: l.createdAt.toISOString(),
      url: `${baseUrl}/pay/${l.id}`,
    }));

    return NextResponse.json({ events });
  } catch (e) {
    console.error("Events list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
