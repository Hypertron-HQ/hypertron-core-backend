import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

/** Dark pool: get a one-time opaque memo (32-byte hash) for this link+amount. Client uses MEMO_HASH so on-chain only the hash is visible. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: linkId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";

    const link = await db.paymentLink.findUnique({
      where: { id: linkId },
      select: { id: true, amount: true },
    });
    if (!link) {
      return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
    }

    // Normalize amount: DB may store number or string; accept "2", "2.5", "2.0000000"
    const fromBody = (amount || "").trim().replace(/\s*(XLM|USDC|EURC)$/i, "");
    const fromLink = link.amount != null ? String(link.amount).trim().replace(/\s*(XLM|USDC|EURC)$/i, "") : "";
    const rawAmt = fromBody || fromLink;
    const normalized = rawAmt.replace(/,/g, ".");
    const match = normalized.match(/^\d+(\.\d+)?$/);
    const amt = match ? match[0] : "";
    if (!amt || Number.parseFloat(amt) <= 0) {
      return NextResponse.json(
        {
          error: link.amount == null || String(link.amount).trim() === ""
            ? "Enter the amount you want to pay (e.g. 2 or 2.5)"
            : "Valid amount required (e.g. 2 or 2.5)",
        },
        { status: 400 }
      );
    }

    const nonce = randomBytes(16);
    const memoHash = createHash("sha256")
      .update(linkId + "|" + amt)
      .update(nonce)
      .digest();

    const memoHashHex = memoHash.toString("hex");

    await db.pendingPaymentMemo.create({
      data: {
        linkId: link.id,
        memoHash: memoHashHex,
        amount: amt,
      },
    });

    return NextResponse.json({
      memoHashBase64: memoHash.toString("base64"),
      amount: amt,
    });
  } catch (e) {
    console.error("Prepare-pay error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
