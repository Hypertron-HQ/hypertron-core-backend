import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAppSession, type AppSession } from "@/lib/app-session";
import { getAuthSecret } from "@/lib/require-session-wallet";

/** Synthetic Business.walletAddress for Privy-only users (not a Stellar G...). */
export function privyPlaceholderWallet(privyId: string): string {
  return `PRIVY_${privyId}`;
}

export function isRealStellarWallet(address: string): boolean {
  const a = address.trim();
  return a.length === 56 && a.startsWith("G");
}

export async function requireAppSession(
  req: NextRequest
): Promise<AppSession | NextResponse> {
  const secret = getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfiguration: AUTH_SECRET is not set" },
      { status: 500 }
    );
  }
  const session = await getAppSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

async function findBusinessByMembership(appUserId: string) {
  const membership = await db.membership.findFirst({
    where: { userId: appUserId },
    orderBy: { createdAt: "asc" },
    include: {
      business: {
        select: {
          id: true,
          walletAddress: true,
          name: true,
          email: true,
          businessNature: true,
          selectedWidgets: true,
          selectedTier: true,
          selectedTierName: true,
          selectedTierAt: true,
          receiveAddress: true,
          complianceForm: true,
          activeTemplateId: true,
          activeTemplateAt: true,
        },
      },
    },
  });
  return membership?.business ?? null;
}

export async function getOrCreateBusinessForPrivyUser(
  appUserId: string,
  privyId: string
) {
  const existing = await findBusinessByMembership(appUserId);
  if (existing) return existing;

  const appUser = await db.appUser.findUnique({
    where: { id: appUserId },
    select: { email: true, name: true },
  });

  const business = await db.business.create({
    data: {
      walletAddress: privyPlaceholderWallet(privyId),
      email: appUser?.email ?? null,
      name: appUser?.name ?? null,
    },
    select: {
      id: true,
      walletAddress: true,
      name: true,
      email: true,
      businessNature: true,
      selectedWidgets: true,
      selectedTier: true,
      selectedTierName: true,
      selectedTierAt: true,
      receiveAddress: true,
      complianceForm: true,
      activeTemplateId: true,
      activeTemplateAt: true,
    },
  });

  await db.membership.create({
    data: {
      userId: appUserId,
      businessId: business.id,
      role: "owner",
    },
  });

  return business;
}

const businessProfileSelect = {
  id: true,
  walletAddress: true,
  name: true,
  email: true,
  businessNature: true,
  selectedWidgets: true,
  selectedTier: true,
  selectedTierName: true,
  selectedTierAt: true,
  receiveAddress: true,
  complianceForm: true,
  activeTemplateId: true,
  activeTemplateAt: true,
} as const;

export type BusinessProfileRecord = {
  id: string;
  walletAddress: string;
  name: string | null;
  email: string | null;
  businessNature: string | null;
  selectedWidgets: string[];
  selectedTier: string | null;
  selectedTierName: string | null;
  selectedTierAt: Date | null;
  receiveAddress: string | null;
  complianceForm: unknown;
  activeTemplateId: string | null;
  activeTemplateAt: Date | null;
};

/** Resolves (and creates if needed) the Business row for the current Privy or wallet session. */
export async function getBusinessForAppSession(
  req: NextRequest,
  options?: { createIfMissing?: boolean }
): Promise<{ business: BusinessProfileRecord; session: AppSession } | NextResponse> {
  const session = await requireAppSession(req);
  if (session instanceof NextResponse) return session;

  const createIfMissing = options?.createIfMissing !== false;

  if (session.kind === "wallet") {
    let business = await db.business.findUnique({
      where: { walletAddress: session.walletAddress },
      select: businessProfileSelect,
    });
    if (!business && createIfMissing) {
      business = await db.business.create({
        data: { walletAddress: session.walletAddress },
        select: businessProfileSelect,
      });
    }
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    return { business: business as BusinessProfileRecord, session };
  }

  const business = await getOrCreateBusinessForPrivyUser(
    session.appUserId,
    session.privyId
  );
  return { business: business as BusinessProfileRecord, session };
}

/** Ensures `businessId` belongs to the signed-in Privy user or wallet session. */
export async function requireBusinessOwnedByAppSession(
  req: NextRequest,
  businessId: string
): Promise<{ session: AppSession; businessId: string } | NextResponse> {
  const session = await requireAppSession(req);
  if (session instanceof NextResponse) return session;

  const bid = businessId.trim();
  if (!bid) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }

  if (session.kind === "wallet") {
    const business = await db.business.findFirst({
      where: { id: bid, walletAddress: session.walletAddress },
      select: { id: true },
    });
    if (!business) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { session, businessId: bid };
  }

  const membership = await db.membership.findFirst({
    where: { userId: session.appUserId, businessId: bid },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { session, businessId: bid };
}
