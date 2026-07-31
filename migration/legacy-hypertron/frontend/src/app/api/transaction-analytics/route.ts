import { NextRequest, NextResponse } from "next/server";
import { getDailyIncomingPayments } from "@/lib/horizon";
import { requireSessionWallet } from "@/lib/require-session-wallet";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/**
 * GET /api/transaction-analytics?days=30
 * Returns daily payment counts for the **session** wallet from Stellar Horizon.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(req.url);
    const days = Math.min(90, Math.max(7, parseInt(searchParams.get("days") ?? "30", 10) || 30));

    const daily = await getDailyIncomingPayments(session, STELLAR_NETWORK, {
      days,
      limit: 200,
    });

    return NextResponse.json({ daily, walletAddress: session });
  } catch (e) {
    console.error("Transaction analytics API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
