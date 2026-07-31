import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getPrivyClient } from "@/lib/privy-server";
import { appendPrivySessionCookie, createPrivySessionToken } from "@/lib/privy-session";
import { getAuthSecret } from "@/lib/require-session-wallet";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

function pickEmail(
  user: { email?: { address?: string } | null; google?: { email?: string } | null }
): string | null {
  const direct = user.email?.address?.trim();
  if (direct) return direct;
  const google = user.google?.email?.trim();
  if (google) return google;
  return null;
}

function pickName(
  user: {
    google?: { name?: string | null } | null;
    twitter?: { name?: string | null } | null;
    github?: { name?: string | null } | null;
  }
): string | null {
  const n =
    user.google?.name?.trim() ||
    user.twitter?.name?.trim() ||
    user.github?.name?.trim() ||
    null;
  return n && n.length > 0 ? n : null;
}

/**
 * POST /api/auth/privy/sync
 * Authorization: Bearer <privy-access-token>
 * Verifies token with Privy, upserts AppUser, sets ht_privy session cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = getAuthSecret();
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfiguration: AUTH_SECRET is not set" },
        { status: 500 }
      );
    }

    const privy = getPrivyClient();
    if (!privy) {
      return NextResponse.json(
        { error: "Server misconfiguration: Privy is not configured (PRIVY_APP_SECRET)" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    let claims: { userId: string };
    try {
      claims = await privy.verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired Privy token" }, { status: 401 });
    }

    const privyId = claims.userId?.trim();
    if (!privyId) {
      return NextResponse.json({ error: "Invalid token claims" }, { status: 401 });
    }

    let email: string | null = null;
    let name: string | null = null;
    try {
      const full = await privy.getUser(privyId);
      email = pickEmail(full);
      name = pickName(full);
    } catch {
      // User record optional; session still works with privyId only
    }

    const appUser = await db.appUser.upsert({
      where: { privyId },
      create: {
        privyId,
        email,
        name,
      },
      update: {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
      select: { id: true, privyId: true, email: true, name: true },
    });

    const sessionToken = await createPrivySessionToken(appUser.id, appUser.privyId, secret);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: appUser.id,
        privyId: appUser.privyId,
        email: appUser.email,
        name: appUser.name,
      },
    });
    appendPrivySessionCookie(res, sessionToken);
    return res;
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Privy sync error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
