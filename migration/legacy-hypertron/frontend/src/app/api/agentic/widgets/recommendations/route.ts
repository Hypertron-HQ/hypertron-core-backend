import { NextRequest, NextResponse } from "next/server";
import { requireSessionWallet } from "@/lib/require-session-wallet";

/**
 * Proxy to the Cosmos AI backend (ai-analyzer / cosmos-ai) to avoid browser CORS.
 * Configure via COSMOS_AI_URL or NEXT_PUBLIC_COSMOS_AI_URL; default: http://localhost:8001
 */
const DEFAULT_BASE_URL = "http://localhost:8001";
const BASE_URL = (process.env.COSMOS_AI_URL || process.env.NEXT_PUBLIC_COSMOS_AI_URL || DEFAULT_BASE_URL).replace(
  /\/$/,
  ""
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(input: string, init: RequestInit, attempts = 3) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(input, init);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(400 + i * 300);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Upstream request failed");
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;

    const body = await req.json();

    const upstream = await fetchWithRetry(`${BASE_URL}/api/widgets/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Proxy error" },
      { status: 500 }
    );
  }
}
