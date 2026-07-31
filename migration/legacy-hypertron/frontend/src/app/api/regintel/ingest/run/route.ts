import { NextRequest, NextResponse } from "next/server";
import { proxyRegintel } from "../../proxy";

export async function POST(req: NextRequest) {
  const secret = process.env.INGESTION_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { detail: "INGESTION_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") || req.headers.get("x-ingestion-secret");
  const provided = auth?.replace("Bearer ", "") || (req.headers.get("x-ingestion-secret") ?? "");
  if (provided !== secret) {
    return NextResponse.json({ detail: "Invalid or missing ingestion secret" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await proxyRegintel("/api/regintel/ingest/run", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "x-ingestion-secret": secret,
    },
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
