import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getAuthSecret } from "@/lib/require-session-wallet";
import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — Privy user and/or legacy wallet session. */
export async function GET(req: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: AUTH_SECRET is not set" },
      { status: 500 }
    );
  }

  const session = await getAppSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.kind === "wallet") {
    return NextResponse.json({
      auth: "wallet" as const,
      walletAddress: session.walletAddress,
    });
  }

  const user = await db.appUser.findUnique({
    where: { id: session.appUserId },
    select: {
      id: true,
      privyId: true,
      email: true,
      name: true,
      stellarAddress: true,
      privyWalletId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    auth: "privy" as const,
    user: {
      id: user.id,
      privyId: user.privyId,
      email: user.email,
      name: user.name,
    },
    stellarAddress: user.stellarAddress,
    privyWalletId: user.privyWalletId,
  });
}
