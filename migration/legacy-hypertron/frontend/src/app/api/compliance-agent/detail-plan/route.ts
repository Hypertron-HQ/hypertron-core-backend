import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BASE = "http://localhost:8001";
const BASE =
  (process.env.COSMOS_AI_URL || process.env.NEXT_PUBLIC_COSMOS_AI_URL || DEFAULT_BASE).replace(
    /\/$/,
    ""
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const response = await fetch(`${BASE}/api/compliance-agent/detail-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Compliance detail proxy error:", error);
    return NextResponse.json(
      {
        error:
          "Could not reach Compliance Agent backend. Ensure ai-analyzer is running on port 8001.",
      },
      { status: 502 }
    );
  }
}
