import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { resolveAppBaseUrl } from "@/lib/app-base-url";
import {
  parseExpiryDays,
  parseLinkCurrency,
  normalizePaymentMethods,
} from "@/lib/payment-link-fields";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import { isPrismaConnectionError, DB_UNAVAILABLE_MESSAGE } from "@/lib/prisma-errors";

/** Pool address where payment-link funds are sent (legacy/privacy mode). */
const PAYMENT_POOL_ADDRESS = (
  process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
  ""
).trim();
const FALLBACK_RECIPIENT = process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() || "";

/**
 * Determine payment destination:
 * 1. If business has a vault, use vault address (direct vault mode)
 * 2. Otherwise fall back to pool address (legacy/privacy mode)
 */
function resolveDestinationAddress(business: {
  vaultAddress?: string | null;
  vaultType?: string | null;
  receiveAddress?: string | null;
}): string {
  if (business.vaultAddress && business.vaultType) {
    return business.vaultAddress;
  }
  if (PAYMENT_POOL_ADDRESS) {
    return PAYMENT_POOL_ADDRESS;
  }
  if (business.receiveAddress) {
    return business.receiveAddress;
  }
  return FALLBACK_RECIPIENT;
}

function generateLinkMemo(): string {
  return "hpl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

/** Create a payment link (DB). Destination: pool address if set, else business.receiveAddress, else NEXT_PUBLIC_MERCHANT_RECIPIENT. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessId,
      amount,
      purpose,
      clientName,
      workflowStage,
      flexibleAmount,
      currency,
      expiryDays,
      metadata,
      paymentMethods,
    } = body;

    const bid = typeof businessId === "string" ? businessId.trim() : "";
    const isFlexible = flexibleAmount === true || flexibleAmount === "true";
    const amt = isFlexible ? "" : (typeof amount === "string" ? amount.trim() : String(amount ?? "").trim());
    if (!bid) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;
    if (!isFlexible && !amt) {
      return NextResponse.json({ error: "amount required (or set flexibleAmount: true for pay-any-amount link)" }, { status: 400 });
    }

    const business = await db.business.findUnique({
      where: { id: bid },
      select: {
        id: true,
        vaultAddress: true,
        vaultType: true,
        receiveAddress: true,
      },
    });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const destinationAddress = resolveDestinationAddress(business);
    if (!destinationAddress) {
      return NextResponse.json(
        {
          error:
            "No payment destination configured. Create a vault in Settings → Treasury, or set NEXT_PUBLIC_PAYMENT_POOL_ADDRESS in .env.",
        },
        { status: 400 }
      );
    }

    const isDirectVault = business.vaultAddress === destinationAddress;

    let linkMemo = generateLinkMemo();
    while (await db.paymentLink.findUnique({ where: { linkMemo } })) {
      linkMemo = generateLinkMemo();
    }

    const linkCurrency = parseLinkCurrency(currency);
    const methods = normalizePaymentMethods(paymentMethods);
    const expiresAt = parseExpiryDays(expiryDays);

    const link = await db.paymentLink.create({
      data: {
        businessId: bid,
        amount: amt || "",
        currency: linkCurrency,
        purpose: purpose ? String(purpose).trim() : null,
        clientName: clientName ? String(clientName).trim() : null,
        workflowStage: workflowStage ? String(workflowStage).trim() : null,
        metadata: metadata ? String(metadata).trim().slice(0, 2000) : null,
        paymentMethods: methods,
        expiresAt,
        linkMemo,
        destinationAddress,
      },
    });

    const baseUrl = resolveAppBaseUrl(req);
    const url = `${baseUrl}/pay/${link.id}`;
    const qrPayload = url;

    return NextResponse.json({
      linkId: link.id,
      url,
      qrPayload,
      memo: link.linkMemo,
      amount: link.amount,
      currency: link.currency,
      expiresAt: link.expiresAt,
      paymentMethods: link.paymentMethods,
      destinationAddress: link.destinationAddress,
      mode: isDirectVault ? "direct_vault" : "pool",
    });
  } catch (e) {
    if (isPrismaConnectionError(e)) {
      console.warn("Payment link create: database unavailable");
      return NextResponse.json({ error: DB_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Payment link create error:", e);
    const message =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "Database error. Run: npx prisma generate (and npx prisma db push if the schema changed).";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** List payment links for a business. Query: businessId (required). */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId) {
      return NextResponse.json({ error: "businessId query required" }, { status: 400 });
    }

    const auth = await requireBusinessOwnedBySession(req, businessId);
    if (auth instanceof NextResponse) return auth;

    const links = await db.paymentLink.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        purpose: true,
        clientName: true,
        workflowStage: true,
        metadata: true,
        paymentMethods: true,
        expiresAt: true,
        linkMemo: true,
        paidAt: true,
        paymentTxHash: true,
        commitmentTxHash: true,
        createdAt: true,
      },
    });

    const baseUrl = resolveAppBaseUrl(req);
    return NextResponse.json({
      links: links.map((l) => ({
        ...l,
        url: `${baseUrl}/pay/${l.id}`,
      })),
    });
  } catch (e) {
    console.error("Payment link list error:", e);
    const message =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? e.message
        : "Server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
