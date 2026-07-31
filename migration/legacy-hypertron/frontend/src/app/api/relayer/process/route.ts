import { NextResponse } from "next/server";
import { isRelayerConfigured, processRelayerInbox } from "@/lib/relayer";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

/**
 * POST /api/relayer/process — process incoming payments to the relayer and forward to pool.
 * Call from a cron job (e.g. every 1–2 min) so payments are forwarded without waiting for a status check.
 * Optional: if relayer is not configured, returns 200 with processed: 0.
 */
export async function POST() {
  try {
    if (!isRelayerConfigured()) {
      return NextResponse.json({ processed: 0, message: "Relayer not configured" });
    }
    const processed = await processRelayerInbox(STELLAR_NETWORK);
    return NextResponse.json({ processed });
  } catch (e) {
    console.error("Relayer process error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
