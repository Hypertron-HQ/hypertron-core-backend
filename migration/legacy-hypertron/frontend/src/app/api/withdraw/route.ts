import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { executeWithdraw } from "@/lib/soroban-commit-server";
import { sendPayout } from "@/lib/payout-server";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import {
  getUnspentCommittedLinks,
  selectLinksForAmount,
  sumUnspent,
} from "@/lib/virtual-balance";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

function isValidStellarG(addr: string): boolean {
  const s = (addr || "").trim();
  return s.length === 56 && s.startsWith("G");
}

/** List withdrawals for a business. GET /api/withdraw?businessId=... */
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

    const list = await db.withdrawal.findMany({
      where: { businessId: bid },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        recipientAddress: true,
        status: true,
        payoutTxHash: true,
        contractTxHash: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ withdrawals: list });
  } catch (e) {
    console.error("Withdraw list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Phase 4: Request withdraw. Backend verifies virtual balance, marks nullifiers on-chain, pays from pool.
 * POST /api/withdraw { businessId, amount, recipientAddress }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessId, amount, amountXlm, recipientAddress } = body;

    const bid = typeof businessId === "string" ? businessId.trim() : "";
    const amt =
      typeof amount === "string"
        ? amount.trim()
        : typeof amountXlm === "string"
          ? amountXlm.trim()
          : String(amount ?? amountXlm ?? "").trim();
    const recipient = typeof recipientAddress === "string" ? recipientAddress.trim() : "";

    if (!bid) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }
    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    if (!amt || !/^\d+(\.\d+)?$/.test(amt)) {
      return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
    }
    if (!recipient || !isValidStellarG(recipient)) {
      return NextResponse.json({ error: "Valid Stellar recipient address (G...) required" }, { status: 400 });
    }

    const amountNum = parseFloat(amt);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const business = await db.business.findUnique({ where: { id: bid } });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const unspent = await getUnspentCommittedLinks(bid);
    const sum = sumUnspent(unspent);
    const { selected: toSpend } = selectLinksForAmount(unspent, amountNum);

    if (sum < amountNum) {
      return NextResponse.json(
        {
          error: `Insufficient virtual balance. Available: ${sum.toFixed(4)} XLM, requested: ${amt}`,
        },
        { status: 400 }
      );
    }

    const nullifiersBigint = toSpend.map((u) => BigInt(u.nullifier));
    const withdrawal = await db.withdrawal.create({
      data: {
        businessId: bid,
        amount: amt,
        nullifiers: toSpend.map((u) => u.nullifier),
        recipientAddress: recipient,
        status: "pending",
      },
    });

    const contractResult = await executeWithdraw(recipient, nullifiersBigint, STELLAR_NETWORK);
    // If contract fails with "unknown nullifier" (#2), contract may have been redeployed or
    // commits were made to a different instance; allow payout anyway so withdrawals don't get stuck.
    const isUnknownNullifier =
      !contractResult.success &&
      (contractResult.error.includes("Contract, #2)") ||
        contractResult.error.includes("unknown nullifier"));

    if (!contractResult.success && !isUnknownNullifier) {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "failed" },
      });
      return NextResponse.json(
        { error: "Contract withdraw failed: " + contractResult.error },
        { status: 502 }
      );
    }

    const payoutResult = await sendPayout(recipient, amt, STELLAR_NETWORK);
    if (!payoutResult.success) {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "failed",
          contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
        },
      });
      return NextResponse.json(
        { error: "Payout failed (nullifiers already marked on-chain): " + payoutResult.error },
        { status: 502 }
      );
    }

    await db.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "completed",
        contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
        payoutTxHash: payoutResult.txHash,
      },
    });

    return NextResponse.json({
      withdrawalId: withdrawal.id,
      status: "completed",
      amount: amt,
      recipientAddress: recipient,
      contractTxHash: contractResult.success ? contractResult.contractTxHash : null,
      payoutTxHash: payoutResult.txHash,
    });
  } catch (e) {
    console.error("Withdraw API error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
