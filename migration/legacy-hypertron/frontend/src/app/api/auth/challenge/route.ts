import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/prisma";
import { isValidStellarAddress } from "@/lib/stellar-address";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/auth/challenge
 * Body: { walletAddress: string }
 * Returns { challengeId, message } for Freighter signMessage (SEP-53).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    if (!walletAddress || !isValidStellarAddress(walletAddress)) {
      return NextResponse.json(
        { error: "walletAddress required (Stellar G..., 56 chars)" },
        { status: 400 }
      );
    }

    const nonce = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    const expiresIso = expiresAt.toISOString();

    const message = [
      "Hypertron dashboard sign-in",
      "",
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Expires (UTC): ${expiresIso}`,
      "",
      "Signing this message proves you control this wallet. Do not share this signature.",
    ].join("\n");

    const row = await db.authChallenge.create({
      data: {
        walletAddress,
        message,
        expiresAt,
      },
    });

    return NextResponse.json({
      challengeId: row.id,
      message: row.message,
      expiresAt: expiresIso,
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Auth challenge error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
