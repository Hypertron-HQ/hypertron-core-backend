import { NextRequest, NextResponse } from "next/server";
import { proxyRegintel } from "../../../proxy";
import { requireRegintelSession } from "@/lib/regintel-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const guard = await requireRegintelSession(req, orgId);
  if (guard instanceof NextResponse) return guard;

  const res = await proxyRegintel(`/api/regintel/profile/org/${encodeURIComponent(orgId)}`, {
    method: "GET",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  });
}
