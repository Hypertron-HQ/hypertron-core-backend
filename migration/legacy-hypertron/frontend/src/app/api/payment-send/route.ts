import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { executeWithdraw } from "@/lib/soroban-commit-server";
import { sendPayout, type StellarNetwork } from "@/lib/payout-server";
import { parseStellarRecipient } from "@/lib/parse-stellar-recipient";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import {
  getUnspentCommittedLinks,
  selectLinksForAmount,
  sumUnspent,
  getVirtualBalances,
} from "@/lib/virtual-balance";
import { normalizePaymentAssetCode, type PaymentAssetCode } from "@/lib/stellar-assets";

export const dynamic = "force-dynamic";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as StellarNetwork;

function explorerTxUrl(hash: string): string {
  const base =
    STELLAR_NETWORK === "public"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${hash}`;
}

/** List outbound sends + vault balance + saved contacts. GET /api/payment-send?businessId=... */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    if (!businessId?.trim()) {
      return NextResponse.json({ error: "businessId query required" }, { status: 400 });
    }

    const bid = businessId.trim();
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const [sends, balances, employees, business] = await Promise.all([
      db.outgoingPayment.findMany({
        where: { businessId: bid },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amount: true,
          currency: true,
          recipientAddress: true,
          recipientLabel: true,
          memo: true,
          deliveryMethod: true,
          privateSend: true,
          status: true,
          payoutTxHash: true,
          scheduledAt: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      getVirtualBalances(bid),
      db.businessEmployee.findMany({
        where: {
          businessId: bid,
          status: "active",
          walletAddress: { not: null },
        },
        select: { id: true, name: true, email: true, walletAddress: true },
        orderBy: { name: "asc" },
        take: 50,
      }),
      db.business.findUnique({
        where: { id: bid },
        select: { name: true },
      }),
    ]);

    const completed = sends.filter((s) => s.status === "completed");
    let sentVolumeUsdc = 0;
    for (const s of completed) {
      const n = parseFloat(s.amount);
      if (Number.isFinite(n) && normalizePaymentAssetCode(s.currency) === "USDC") {
        sentVolumeUsdc += n;
      }
    }

    const vaultBase = business?.name?.trim() || "Hypertron";
    const vaultName = vaultBase.endsWith("Vault") ? vaultBase : `${vaultBase} Vault`;

    return NextResponse.json({
      vaultName,
      balances,
      stats: {
        sentVolumeUsdc: sentVolumeUsdc.toFixed(2),
        paymentsSent: completed.length,
      },
      contacts: employees
        .filter((e) => e.walletAddress)
        .map((e) => ({
          id: e.id,
          name: e.name,
          detail: e.walletAddress!,
          email: e.email,
          type: "wallet" as const,
        })),
      sends: sends.map((s) => ({
        ...s,
        explorerUrl: s.payoutTxHash ? explorerTxUrl(s.payoutTxHash) : null,
      })),
    });
  } catch (e) {
    console.error("Payment send list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Send USDC/XLM from virtual vault via pool payout.
 * POST /api/payment-send
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessId,
      amount,
      currency: currencyRaw,
      recipient,
      recipientLabel: labelRaw,
      memo,
      deliveryMethod,
      privateSend,
      timing,
      scheduledAt,
    } = body;

    const bid = typeof businessId === "string" ? businessId.trim() : "";
    if (!bid) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const amt = typeof amount === "string" ? amount.trim() : String(amount ?? "").trim();
    if (!amt || !/^\d+(\.\d+)?$/.test(amt)) {
      return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
    }
    const amountNum = parseFloat(amt);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const currency = normalizePaymentAssetCode(currencyRaw) as PaymentAssetCode;
    const method =
      typeof deliveryMethod === "string" && deliveryMethod.trim()
        ? deliveryMethod.trim()
        : "wallet";

    if (method === "email") {
      return NextResponse.json(
        { error: "Email-link delivery is not available yet. Use Stellar Wallet with a G… address." },
        { status: 501 }
      );
    }
    if (method === "bank") {
      return NextResponse.json({ error: "Bank transfer is not available yet." }, { status: 501 });
    }

    const recipientInput =
      typeof recipient === "string" ? recipient : typeof body.recipientAddress === "string" ? body.recipientAddress : "";
    const parsed = parseStellarRecipient(recipientInput);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const recipientLabel =
      (typeof labelRaw === "string" && labelRaw.trim()) ||
      parsed.label ||
      parsed.address.slice(0, 8) + "…" + parsed.address.slice(-4);

    const memoStr = typeof memo === "string" ? memo.trim().slice(0, 200) : "";
    const isPrivate = privateSend === true;
    const isSchedule = timing === "schedule";

    let scheduleDate: Date | null = null;
    if (isSchedule) {
      if (typeof scheduledAt !== "string" || !scheduledAt.trim()) {
        return NextResponse.json({ error: "scheduledAt required for scheduled sends" }, { status: 400 });
      }
      scheduleDate = new Date(scheduledAt);
      if (Number.isNaN(scheduleDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
      }
      if (scheduleDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Schedule time must be in the future" }, { status: 400 });
      }

      const scheduled = await db.outgoingPayment.create({
        data: {
          businessId: bid,
          amount: amt,
          currency,
          recipientAddress: parsed.address,
          recipientLabel,
          memo: memoStr || null,
          deliveryMethod: method,
          privateSend: isPrivate,
          scheduledAt: scheduleDate,
          status: "scheduled",
        },
      });

      return NextResponse.json({
        sendId: scheduled.id,
        status: "scheduled",
        scheduledAt: scheduleDate.toISOString(),
        message: "Payment scheduled. Automated execution will be added in a future release.",
      });
    }

    const unspent = await getUnspentCommittedLinks(bid, currency);
    const available = sumUnspent(unspent);
    if (available < amountNum) {
      return NextResponse.json(
        {
          error: `Insufficient ${currency} balance. Available: ${available.toFixed(4)} ${currency}, requested: ${amt}`,
        },
        { status: 400 }
      );
    }

    const { selected: toSpend } = selectLinksForAmount(unspent, amountNum);
    const nullifiersBigint = toSpend.map((u) => BigInt(u.nullifier));

    const outgoing = await db.outgoingPayment.create({
      data: {
        businessId: bid,
        amount: amt,
        currency,
        recipientAddress: parsed.address,
        recipientLabel,
        memo: memoStr || null,
        deliveryMethod: method,
        privateSend: isPrivate,
        status: "pending",
        nullifiers: toSpend.map((u) => u.nullifier),
      },
    });

    const contractResult = await executeWithdraw(parsed.address, nullifiersBigint, STELLAR_NETWORK);
    const isUnknownNullifier =
      !contractResult.success &&
      (contractResult.error.includes("Contract, #2)") ||
        contractResult.error.includes("unknown nullifier"));

    if (!contractResult.success && !isUnknownNullifier) {
      await db.outgoingPayment.update({
        where: { id: outgoing.id },
        data: { status: "failed" },
      });
      return NextResponse.json(
        { error: "Contract withdraw failed: " + contractResult.error },
        { status: 502 }
      );
    }

    const payoutResult = await sendPayout(parsed.address, amt, STELLAR_NETWORK, {
      assetCode: currency,
      memo: memoStr || undefined,
    });

    if (!payoutResult.success) {
      await db.outgoingPayment.update({
        where: { id: outgoing.id },
        data: {
          status: "failed",
          contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
        },
      });
      return NextResponse.json({ error: "Payout failed: " + payoutResult.error }, { status: 502 });
    }

    await db.outgoingPayment.update({
      where: { id: outgoing.id },
      data: {
        status: "completed",
        contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
        payoutTxHash: payoutResult.txHash,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      sendId: outgoing.id,
      status: "completed",
      amount: amt,
      currency,
      recipientAddress: parsed.address,
      recipientLabel,
      payoutTxHash: payoutResult.txHash,
      contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
      explorerUrl: explorerTxUrl(payoutResult.txHash),
    });
  } catch (e) {
    console.error("Payment send POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
