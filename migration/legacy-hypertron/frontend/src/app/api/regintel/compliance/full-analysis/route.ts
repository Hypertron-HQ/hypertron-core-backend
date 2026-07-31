import { NextRequest, NextResponse } from "next/server";
import { proxyRegintel } from "../../proxy";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await proxyRegintel("/api/regintel/compliance/full-analysis", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
