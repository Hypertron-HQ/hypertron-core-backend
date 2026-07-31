import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAppSession } from "@/lib/app-session";
import { getAuthSecret } from "@/lib/require-session-wallet";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { isValidStellarGAddress } from "@/lib/privy-stellar-wallet";

export const dynamic = "force-dynamic";

/** GET /api/auth/privy/wallet — Stellar wallet linked to the Privy app user. */
export async function GET(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: AUTH_SECRET is not set" },
      { status: 500 }
    );
  }

  const session = await getAppSession(req);
  if (!session || session.kind !== "privy") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.appUser.findUnique({
    where: { id: session.appUserId },
    select: { stellarAddress: true, privyWalletId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    address: user.stellarAddress,
    walletId: user.privyWalletId,
  });
}

/** POST /api/auth/privy/wallet — Persist Privy Stellar wallet metadata for the app user. */
export async function POST(req: NextRequest) {
  try {
    const secret = getAuthSecret();
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfiguration: AUTH_SECRET is not set" },
        { status: 500 }
      );
    }

    const session = await getAppSession(req);
    if (!session || session.kind !== "privy") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      address?: string;
      walletId?: string;
    };

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!isValidStellarGAddress(address)) {
      return NextResponse.json({ error: "Valid Stellar address (G…) required" }, { status: 400 });
    }

    const walletId =
      typeof body.walletId === "string" && body.walletId.trim().length > 0
        ? body.walletId.trim()
        : null;

    const user = await db.appUser.update({
      where: { id: session.appUserId },
      data: {
        stellarAddress: address,
        ...(walletId ? { privyWalletId: walletId } : {}),
      },
      select: { stellarAddress: true, privyWalletId: true },
    });

    return NextResponse.json({
      ok: true,
      address: user.stellarAddress,
      walletId: user.privyWalletId,
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Privy wallet sync error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
