import { NextResponse } from "next/server";
import { clearDashboardSessionCookie } from "@/lib/dashboard-session";
import { clearPrivySessionCookie } from "@/lib/privy-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearDashboardSessionCookie(res);
  clearPrivySessionCookie(res);
  return res;
}
