import { NextRequest, NextResponse } from "next/server";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { isValidStellarAddress } from "@/lib/stellar-address";

/**
 * RegIntel dashboard APIs require a signed-in session. When `orgIdFromPath` is a Stellar G address,
 * it must match the session wallet.
 */
export async function requireRegintelSession(
  req: NextRequest,
  orgIdFromPath?: string
): Promise<string | NextResponse> {
  const w = await requireSessionWallet(req);
  if (w instanceof NextResponse) return w;
  if (orgIdFromPath) {
    const decoded = decodeURIComponent(orgIdFromPath).trim();
    if (isValidStellarAddress(decoded) && decoded !== w) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return w;
}
