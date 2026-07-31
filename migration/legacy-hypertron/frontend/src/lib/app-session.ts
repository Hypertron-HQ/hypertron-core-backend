import { NextRequest } from "next/server";
import {
  getDashboardWalletFromRequest,
  parseDashboardSessionToken,
  readDashboardSessionCookie,
  DASHBOARD_SESSION_COOKIE,
} from "@/lib/dashboard-session";
import { getPrivySessionFromRequest } from "@/lib/privy-session";
import { getAuthSecret } from "@/lib/require-session-wallet";

export type AppSessionKind = "privy" | "wallet";

export type AppSession =
  | { kind: "privy"; appUserId: string; privyId: string }
  | { kind: "wallet"; walletAddress: string };

/** True if request has a valid Privy or legacy wallet dashboard session. */
export async function getAppSession(req: NextRequest): Promise<AppSession | null> {
  const secret = getAuthSecret();
  if (!secret) return null;

  const privy = await getPrivySessionFromRequest(req, secret);
  if (privy) {
    return { kind: "privy", appUserId: privy.appUserId, privyId: privy.privyId };
  }

  const wallet = await getDashboardWalletFromRequest(req, secret);
  if (wallet) {
    return { kind: "wallet", walletAddress: wallet };
  }

  return null;
}

export async function hasAppSession(req: NextRequest): Promise<boolean> {
  return (await getAppSession(req)) !== null;
}

export { readDashboardSessionCookie, parseDashboardSessionToken, DASHBOARD_SESSION_COOKIE };
