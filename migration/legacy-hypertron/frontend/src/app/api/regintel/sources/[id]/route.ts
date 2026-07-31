import { NextRequest, NextResponse } from "next/server";
import { proxyRegintel } from "../../proxy";
import { requireRegintelSession } from "@/lib/regintel-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRegintelSession(req);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const res = await proxyRegintel(`/api/regintel/sources/${id}`, { method: "GET" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRegintelSession(req);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyRegintel(`/api/regintel/sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRegintelSession(req);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const res = await proxyRegintel(`/api/regintel/sources/${id}`, { method: "DELETE" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
