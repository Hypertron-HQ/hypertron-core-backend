/**
 * Treasury Vault Withdraw API.
 * 
 * POST /api/vault/treasury/withdraw
 * - Custodial: Fully signs and submits the transaction
 * - Hybrid: Returns partial-signed XDR for user to co-sign with Freighter
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireBusinessOwnedBySession } from "@/lib/require-session-wallet";
import {
  getVaultBalance,
  buildHybridWithdrawXdr,
  executeCustodialWithdraw,
} from "@/lib/vault";
import { normalizePaymentAssetCode, type PaymentAssetCode } from "@/lib/stellar-assets";

export const dynamic = "force-dynamic";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

function explorerTxUrl(hash: string): string {
  const base =
    STELLAR_NETWORK === "public"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${hash}`;
}

/**
 * POST /api/vault/treasury/withdraw
 * 
 * Body:
 * - businessId: string (required)
 * - amount: string (required)
 * - currency: "USDC" | "XLM" (default: "USDC")
 * - recipientAddress: string (required, Stellar G...)
 * - memo: string (optional)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessId,
      amount,
      currency: currencyRaw,
      recipientAddress,
      memo,
    } = body;

    const bid = typeof businessId === "string" ? businessId.trim() : "";
    if (!bid) {
      return NextResponse.json({ error: "businessId required" }, { status: 400 });
    }

    const auth = await requireBusinessOwnedBySession(req, bid);
    if (auth instanceof NextResponse) return auth;

    const business = await db.business.findUnique({
      where: { id: bid },
      select: {
        id: true,
        vaultAddress: true,
        vaultSecretEnc: true,
        vaultType: true,
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    if (!business.vaultAddress) {
      return NextResponse.json({ error: "No vault configured" }, { status: 400 });
    }

    if (business.vaultType === "external") {
      return NextResponse.json(
        { error: "External vaults are managed by the user directly. Use your own wallet app." },
        { status: 400 }
      );
    }

    const amt = typeof amount === "string" ? amount.trim() : String(amount ?? "").trim();
    if (!amt || !/^\d+(\.\d+)?$/.test(amt)) {
      return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
    }

    const amountNum = parseFloat(amt);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

    const currency = normalizePaymentAssetCode(currencyRaw) as PaymentAssetCode;

    const recipient = typeof recipientAddress === "string" ? recipientAddress.trim() : "";
    if (!recipient || !recipient.startsWith("G") || recipient.length !== 56) {
      return NextResponse.json({ error: "Valid Stellar recipient address (G...) required" }, { status: 400 });
    }

    const balance = await getVaultBalance(business.vaultAddress, STELLAR_NETWORK);
    if (!balance) {
      return NextResponse.json({ error: "Could not fetch vault balance" }, { status: 502 });
    }

    const available = currency === "XLM" ? balance.xlmRaw : balance.usdcRaw;
    if (available < amountNum) {
      return NextResponse.json(
        { error: `Insufficient ${currency} balance. Available: ${available.toFixed(4)} ${currency}` },
        { status: 400 }
      );
    }

    const memoStr = typeof memo === "string" ? memo.trim().slice(0, 28) : "";

    if (business.vaultType === "hybrid") {
      const xdrResult = await buildHybridWithdrawXdr(
        business.vaultAddress,
        recipient,
        amt,
        currency,
        STELLAR_NETWORK,
        memoStr
      );

      if (!xdrResult.success) {
        return NextResponse.json({ error: xdrResult.error }, { status: 502 });
      }

      const withdrawal = await db.withdrawal.create({
        data: {
          businessId: bid,
          amount: amt,
          recipientAddress: recipient,
          status: "pending_signature",
          nullifiers: [],
        },
      });

      return NextResponse.json({
        mode: "hybrid",
        withdrawalId: withdrawal.id,
        xdr: xdrResult.xdr,
        amount: amt,
        currency,
        recipientAddress: recipient,
        network: STELLAR_NETWORK,
        message: "Sign with Freighter to complete withdrawal",
      });
    }

    if (!business.vaultSecretEnc) {
      return NextResponse.json(
        { error: "Vault secret not found. Cannot execute custodial withdraw." },
        { status: 500 }
      );
    }

    const txResult = await executeCustodialWithdraw(
      business.vaultSecretEnc,
      recipient,
      amt,
      currency,
      STELLAR_NETWORK,
      memoStr
    );

    if (!txResult.success) {
      return NextResponse.json({ error: txResult.error }, { status: 502 });
    }

    const withdrawal = await db.withdrawal.create({
      data: {
        businessId: bid,
        amount: amt,
        recipientAddress: recipient,
        status: "completed",
        payoutTxHash: txResult.txHash,
        nullifiers: [],
      },
    });

    return NextResponse.json({
      mode: "custodial",
      withdrawalId: withdrawal.id,
      status: "completed",
      amount: amt,
      currency,
      recipientAddress: recipient,
      txHash: txResult.txHash,
      explorerUrl: explorerTxUrl(txResult.txHash),
    });
  } catch (e) {
    console.error("Vault withdraw POST error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PUT /api/vault/treasury/withdraw
 * Confirm a hybrid withdrawal after user has signed with Freighter.
 * 
 * Body:
 * - withdrawalId: string (required)
 * - signedXdr: string (required, fully signed transaction XDR)
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { withdrawalId, signedXdr, txHash } = body;

    if (!withdrawalId || typeof withdrawalId !== "string") {
      return NextResponse.json({ error: "withdrawalId required" }, { status: 400 });
    }

    const withdrawal = await db.withdrawal.findUnique({
      where: { id: withdrawalId.trim() },
      select: { id: true, businessId: true, status: true },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    }

    const auth = await requireBusinessOwnedBySession(req, withdrawal.businessId);
    if (auth instanceof NextResponse) return auth;

    if (withdrawal.status === "completed") {
      return NextResponse.json({ error: "Withdrawal already completed" }, { status: 400 });
    }

    if (txHash && typeof txHash === "string") {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "completed",
          payoutTxHash: txHash.trim(),
        },
      });

      return NextResponse.json({
        success: true,
        withdrawalId: withdrawal.id,
        status: "completed",
        txHash: txHash.trim(),
        explorerUrl: explorerTxUrl(txHash.trim()),
      });
    }

    if (!signedXdr || typeof signedXdr !== "string") {
      return NextResponse.json({ error: "signedXdr or txHash required" }, { status: 400 });
    }

    const { submitSignedTransaction } = await import("@/lib/stellar-payment");
    const { getHorizonUrl, getNetworkPassphrase } = await import("@/lib/stellar-payment");

    const result = await submitSignedTransaction(
      getHorizonUrl(STELLAR_NETWORK),
      getNetworkPassphrase(STELLAR_NETWORK),
      signedXdr
    );

    if (!result.success) {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "failed" },
      });
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    await db.withdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "completed",
        payoutTxHash: result.txHash,
      },
    });

    return NextResponse.json({
      success: true,
      withdrawalId: withdrawal.id,
      status: "completed",
      txHash: result.txHash,
      explorerUrl: explorerTxUrl(result.txHash),
    });
  } catch (e) {
    console.error("Vault withdraw PUT error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
