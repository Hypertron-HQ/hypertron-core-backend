import { NextRequest, NextResponse } from "next/server";
import { proxyRegintel } from "../proxy";
import { requireRegintelSession } from "@/lib/regintel-guard";

export async function POST(req: NextRequest) {
  const guard = await requireRegintelSession(req);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => ({}));
  const res = await proxyRegintel("/api/regintel/profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
