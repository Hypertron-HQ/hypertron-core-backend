import { NextRequest, NextResponse } from "next/server";
import { requireSessionWallet } from "@/lib/require-session-wallet";
import { forwardResponse, proxyJson } from "../lib";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;

    const body = await req.json().catch(() => ({}));
    const upstream = await proxyJson("/agent/business-impact-news", body);
    return forwardResponse(upstream);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy error" },
      { status: 500 }
    );
  }
}
