import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { isValidStellarAddress } from "@/lib/stellar-address";
import { verifySep53SignedMessage } from "@/lib/sep53-verify";
import {
  appendDashboardSessionCookie,
  createDashboardSessionToken,
} from "@/lib/dashboard-session";
import { getAuthSecret } from "@/lib/require-session-wallet";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify
 * Body: { challengeId, walletAddress, signedMessage } (signedMessage = base64 from Freighter signMessage)
 */
export async function POST(req: NextRequest) {
  try {
    const secret = getAuthSecret();
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfiguration: AUTH_SECRET is not set" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
    const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    const signedMessage = typeof body.signedMessage === "string" ? body.signedMessage.trim() : "";

    if (!challengeId || !walletAddress || !signedMessage) {
      return NextResponse.json(
        { error: "challengeId, walletAddress, and signedMessage required" },
        { status: 400 }
      );
    }
    if (!isValidStellarAddress(walletAddress)) {
      return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
    }

    const challenge = await db.authChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge || challenge.used) {
      return NextResponse.json({ error: "Invalid or used challenge" }, { status: 400 });
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
    }
    if (challenge.walletAddress !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match challenge" }, { status: 400 });
    }

    if (!verifySep53SignedMessage(challenge.message, signedMessage, walletAddress)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await db.authChallenge.update({
      where: { id: challengeId },
      data: { used: true },
    });

    const token = await createDashboardSessionToken(walletAddress, secret);
    const res = NextResponse.json({ ok: true, walletAddress });
    appendDashboardSessionCookie(res, token);
    return res;
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Auth verify error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
