import { NextRequest, NextResponse } from "next/server";
import { getVirtualBalances } from "@/lib/virtual-balance";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";

export const dynamic = "force-dynamic";

/**
 * Virtual spendable balance for a business (committed paid links minus spent nullifiers).
 * GET /api/balance?businessId=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId?.trim()) {
      return NextResponse.json({ error: "businessId query required" }, { status: 400 });
    }

    const bid = businessId.trim();
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const balances = await getVirtualBalances(bid);

    return NextResponse.json({
      businessId: bid,
      ...balances,
      /** @deprecated Use virtualBalanceXlm */
      virtualBalanceXlm: balances.virtualBalanceXlm,
    });
  } catch (e) {
    console.error("Balance API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
