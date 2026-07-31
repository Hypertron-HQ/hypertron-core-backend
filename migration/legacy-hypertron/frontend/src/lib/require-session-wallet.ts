import { NextRequest, NextResponse } from "next/server";
import { getDashboardWalletFromRequest } from "@/lib/dashboard-session";
import { requireBusinessOwnedByAppSession } from "@/lib/business-for-session";

export function getAuthSecret(): string | null {
  return process.env.AUTH_SECRET?.trim() ?? null;
}

/** Returns session Stellar address or a 401/500 NextResponse. */
export async function requireSessionWallet(req: NextRequest): Promise<string | NextResponse> {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: AUTH_SECRET is not set" },
      { status: 500 }
    );
  }
  const w = await getDashboardWalletFromRequest(req, secret);
  if (!w) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return w;
}

/** Ensures `businessId` belongs to the signed-in Privy user or wallet session. */
export async function requireBusinessOwnedBySession(
  req: NextRequest,
  businessId: string
): Promise<{ wallet?: string; session: import("@/lib/app-session").AppSession } | NextResponse> {
  const auth = await requireBusinessOwnedByAppSession(req, businessId);
  if (auth instanceof NextResponse) return auth;
  if (auth.session.kind === "wallet") {
    return { wallet: auth.session.walletAddress, session: auth.session };
  }
  return { session: auth.session };
}
