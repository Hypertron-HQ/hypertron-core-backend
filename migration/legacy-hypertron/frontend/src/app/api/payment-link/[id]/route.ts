import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getExpectedPaymentDestination } from "@/lib/payment-destination";
import { isLinkExpired } from "@/lib/payment-link-fields";
import { normalizePaymentAssetCode } from "@/lib/stellar-assets";

/** Get a payment link by id (for pay page and attribution). When relayer is set, return relayer so clients pay relayer (backend forwards to pool). Otherwise pool address. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const link = await db.paymentLink.findUnique({
      where: { id },
      include: { business: { select: { name: true } } },
    });
    if (!link) {
      return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
    }
    if (isLinkExpired(link.expiresAt)) {
      return NextResponse.json({ error: "This payment link has expired", expired: true }, { status: 410 });
    }
    const destinationAddress = getExpectedPaymentDestination(link.destinationAddress);
    return NextResponse.json({
      id: link.id,
      amount: link.amount,
      currency: normalizePaymentAssetCode(link.currency),
      memo: link.linkMemo,
      destinationAddress,
      purpose: link.purpose,
      businessName: link.business?.name?.trim() || null,
      clientName: link.clientName,
      workflowStage: link.workflowStage,
      metadata: link.metadata,
      paymentMethods: link.paymentMethods ?? ["wallet", "qr"],
      expiresAt: link.expiresAt,
      paidAt: link.paidAt,
      paymentTxHash: link.paymentTxHash,
    });
  } catch (e) {
    console.error("Payment link get error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
