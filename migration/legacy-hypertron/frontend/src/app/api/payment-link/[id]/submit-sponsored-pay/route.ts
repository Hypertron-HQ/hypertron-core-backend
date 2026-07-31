import { NextRequest, NextResponse } from "next/server";
import { submitSponsoredPayment } from "@/lib/fee-sponsor-server";
import { STELLAR_NETWORK } from "@/lib/stellar-explorer";

/**
 * Wraps a payer-signed inner payment in a fee-bump tx (sponsor pays network fee).
 * Body: { signedInnerTxXdr: string, payerPublicKey: string }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: linkId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const signedInnerTxXdr =
      typeof body.signedInnerTxXdr === "string" ? body.signedInnerTxXdr.trim() : "";
    const payerPublicKey =
      typeof body.payerPublicKey === "string" ? body.payerPublicKey.trim() : "";

    if (!signedInnerTxXdr || !payerPublicKey) {
      return NextResponse.json(
        { error: "signedInnerTxXdr and payerPublicKey are required" },
        { status: 400 }
      );
    }

    const result = await submitSponsoredPayment({
      linkId,
      signedInnerTxXdr,
      payerPublicKey,
      network: STELLAR_NETWORK,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 }
      );
    }

    return NextResponse.json({ txHash: result.txHash });
  } catch (e) {
    console.error("submit-sponsored-pay error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
