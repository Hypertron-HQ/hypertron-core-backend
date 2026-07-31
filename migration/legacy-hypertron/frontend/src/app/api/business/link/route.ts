import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { isValidStellarAddress } from "@/lib/stellar-address";

/** Get or create a business for the signed-in wallet. Optional body: receiveAddress (Stellar G...). Returns { businessId, receiveAddress }. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const address = session;

    const body = await req.json();
    const receiveAddress = body.receiveAddress;
    let business = await db.business.findUnique({
      where: { walletAddress: address },
    });
    const receiveTrimmed = typeof receiveAddress === "string" ? receiveAddress.trim() : "";
    if (receiveTrimmed && !isValidStellarAddress(receiveTrimmed)) {
      return NextResponse.json(
        { error: "receiveAddress must be a valid Stellar address (starts with G, 56 characters)" },
        { status: 400 }
      );
    }
    if (!business) {
      business = await db.business.create({
        data: {
          walletAddress: address,
          receiveAddress: receiveTrimmed.length === 56 ? receiveTrimmed : undefined,
        },
      });
    } else if (receiveTrimmed.length === 56) {
      business = await db.business.update({
        where: { id: business.id },
        data: { receiveAddress: receiveTrimmed },
      });
    }
    return NextResponse.json({
      businessId: business.id,
      receiveAddress: business.receiveAddress ?? null,
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Business link POST: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Business link error:", e);
    const message =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "Database error. Check DATABASE_URL, run: npx prisma generate (and npx prisma db push if using SQL).";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Update receive address for the signed-in business. Body: { receiveAddress }. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;
    const address = session;

    const body = await req.json();
    const receiveAddress = body.receiveAddress;
    const g = typeof receiveAddress === "string" ? receiveAddress.trim() : "";
    if (!g || !isValidStellarAddress(g)) {
      return NextResponse.json(
        { error: "receiveAddress must be a valid Stellar address (starts with G, 56 characters)" },
        { status: 400 }
      );
    }

    const business = await db.business.findUnique({ where: { walletAddress: address } });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    const updated = await db.business.update({
      where: { id: business.id },
      data: { receiveAddress: g },
    });
    return NextResponse.json({ businessId: updated.id, receiveAddress: updated.receiveAddress });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Business link PATCH: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Business PATCH error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
