import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";
import { requireSessionWallet } from "@/lib/require-session-wallet";

/** GET /api/vault?businessId=... — list Document vault items for the signed-in business. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(req.url);
    let businessId = searchParams.get("businessId")?.trim();
    if (!businessId) {
      const b = await db.business.findUnique({
        where: { walletAddress: session },
        select: { id: true },
      });
      businessId = b?.id ?? "";
    }
    if (!businessId) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    const owned = await db.business.findFirst({
      where: { id: businessId, walletAddress: session },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const items = await db.documentVaultItem.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, title: true, itemsJson: true, createdAt: true },
    });
    const parsed = items.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      items: (() => {
        try {
          return JSON.parse(i.itemsJson) as { id: string; text: string; done: boolean }[];
        } catch {
          return [];
        }
      })(),
      createdAt: i.createdAt.toISOString(),
    }));
    return NextResponse.json({ items: parsed });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Vault GET: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Vault list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST /api/vault — save a checklist. Body: { businessId?: string, title?, items } */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionWallet(req);
    if (session instanceof NextResponse) return session;

    const body = await req.json().catch(() => ({}));
    let businessId = (body.businessId ?? "").trim();
    const title = (body.title ?? "Compliance checklist").trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!businessId) {
      const b = await db.business.findUnique({
        where: { walletAddress: session },
        select: { id: true },
      });
      businessId = b?.id ?? "";
    }
    if (!businessId) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    const business = await db.business.findFirst({
      where: { id: businessId, walletAddress: session },
    });
    if (!business) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = rawItems.map((x: { id?: string; text?: string; done?: boolean }) => ({
      id: typeof x.id === "string" ? x.id : `item-${Math.random().toString(36).slice(2, 9)}`,
      text: typeof x.text === "string" ? x.text : String(x),
      done: Boolean(x.done),
    }));

    const vault = await db.documentVaultItem.create({
      data: {
        businessId,
        type: "compliance_checklist",
        title: title || "Regulatory & compliance checklist",
        itemsJson: JSON.stringify(items),
      },
    });

    return NextResponse.json({
      id: vault.id,
      title: vault.title,
      createdAt: vault.createdAt.toISOString(),
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Vault POST: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Vault save error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
