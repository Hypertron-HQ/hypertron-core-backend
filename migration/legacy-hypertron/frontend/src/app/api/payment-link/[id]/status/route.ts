import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import {
  findPaymentToAccountByMemo,
  findPaymentsToAccountWithHashMemo,
  getPaymentDetailsByTransactionHash,
} from "@/lib/horizon";
import { isLinkExpired } from "@/lib/payment-link-fields";
import { isPrivateSettlementEnabled } from "@/lib/privacy-features";
import {
  executeCommit,
  hashToScalar,
} from "@/lib/soroban-commit-server";
import { normalizePaymentAssetCode } from "@/lib/stellar-assets";
import { isRelayerConfigured, processRelayerInbox } from "@/lib/relayer";
import { randomBytes } from "crypto";

const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet") as "testnet" | "public";

const PAYMENT_POOL_ADDRESS = (
  process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
  ""
).trim();

function isValidStellarG(addr: string): boolean {
  const s = (addr || "").trim();
  return s.length === 56 && s.startsWith("G");
}

/** Check if this link has been paid; if so, add ZK commitment on-chain (Phase 2) and update link. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isPrivateSettlementEnabled() && isRelayerConfigured()) {
      await processRelayerInbox(STELLAR_NETWORK);
    }

    const link = await db.paymentLink.findUnique({
      where: { id },
      include: { business: true },
    });
    if (!link) {
      return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
    }

    if (isLinkExpired(link.expiresAt)) {
      return NextResponse.json({ status: "expired" as const, error: "Payment link expired" }, { status: 410 });
    }

    const linkCurrency = normalizePaymentAssetCode(link.currency);

    if (link.paidAt && link.paymentTxHash) {
      // Backfill amount for old pay-any-amount links that were marked paid before
      // we started persisting the paid amount.
      if (!link.amount || String(link.amount).trim() === "") {
        const paymentDetails = await getPaymentDetailsByTransactionHash(
          link.paymentTxHash,
          STELLAR_NETWORK
        );
        if (paymentDetails && Number.isFinite(parseFloat(paymentDetails.amount))) {
          const paidAtDate = paymentDetails.createdAt
            ? new Date(paymentDetails.createdAt)
            : link.paidAt;
          await db.paymentLink.update({
            where: { id },
            data: {
              amount: paymentDetails.amount,
              paidAt: Number.isNaN(paidAtDate.getTime()) ? link.paidAt : paidAtDate,
              payerAddress:
                link.payerAddress && link.payerAddress.trim().length > 0
                  ? link.payerAddress
                  : paymentDetails.sourceAccount || undefined,
            },
          });
        }
      }
      return NextResponse.json({
        status: "paid" as const,
        paymentTxHash: link.paymentTxHash,
        paidAt: link.paidAt,
        commitmentTxHash: link.commitmentTxHash ?? undefined,
      });
    }

    let pool = PAYMENT_POOL_ADDRESS || link.destinationAddress?.trim() || "";
    if (!isValidStellarG(pool) && link.business?.receiveAddress) {
      const alt = link.business.receiveAddress.trim();
      if (isValidStellarG(alt)) pool = alt;
    }
    if (!pool) {
      return NextResponse.json({
        status: "pending" as const,
        hint: "Set a valid Stellar receive address (G..., 56 chars) in the dashboard and try again.",
      });
    }

    let found: { txHash: string; sourceAccount: string; amount: string; createdAt: string } | null =
      await findPaymentToAccountByMemo(
        pool,
        link.linkMemo,
        STELLAR_NETWORK,
        100,
        linkCurrency
      );

    // Dark pool: match by hash memo via PendingPaymentMemo (private settlement only)
    if (!found && isPrivateSettlementEnabled()) {
      const hashPayments = await findPaymentsToAccountWithHashMemo(
        pool,
        STELLAR_NETWORK
      );
      const pendingForLink = await db.pendingPaymentMemo.findMany({
        where: { linkId: id },
        select: { memoHash: true, amount: true },
      });
      const pendingAmountByHash = new Map(pendingForLink.map((p) => [p.memoHash, p.amount]));
      for (const hp of hashPayments) {
        if (!pendingAmountByHash.has(hp.memoHashHex)) continue;
        found = {
          txHash: hp.txHash,
          sourceAccount: hp.sourceAccount,
          amount: pendingAmountByHash.get(hp.memoHashHex) || hp.amount || "0",
          createdAt: hp.createdAt,
        };
        await db.pendingPaymentMemo.deleteMany({
          where: { linkId: id, memoHash: hp.memoHashHex },
        });
        break;
      }
    }

    if (!found) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Payment status] No match yet. Pool:",
          pool.slice(0, 8) + "..." + pool.slice(-4),
          "| Link ID:",
          id
        );
      }
      const destHint = pool ? `${pool.slice(0, 8)}...${pool.slice(-4)}` : "(not set)";
      return NextResponse.json({
        status: "pending" as const,
        hint: `No payment found to ${destHint}. Wait 10–20 sec for the ledger and Horizon to update, then click Check status again.`,
        destination: pool,
        network: STELLAR_NETWORK,
      });
    }

    const payerAddress = found.sourceAccount || "";
    const paidAmount = Number.isFinite(parseFloat(found.amount)) ? String(found.amount) : "";
    const paidAtDate = found.createdAt ? new Date(found.createdAt) : new Date();
    const normalizedPaidAt = Number.isNaN(paidAtDate.getTime()) ? new Date() : paidAtDate;

    const paidData = {
      paidAt: normalizedPaidAt,
      paymentTxHash: found.txHash,
      ...(paidAmount && (!link.amount || String(link.amount).trim() === "") ? { amount: paidAmount } : {}),
      payerAddress: payerAddress || undefined,
    };

    // TODO(production-privacy): re-enable PoolManager commit when private settlement launches.
    if (!isPrivateSettlementEnabled()) {
      await db.paymentLink.update({ where: { id }, data: paidData });
      return NextResponse.json({
        status: "paid" as const,
        paymentTxHash: found.txHash,
        paidAt: normalizedPaidAt.toISOString(),
      });
    }

    const nonce = randomBytes(16).toString("hex");
    const secretAmount = (link.amount && String(link.amount).trim()) || paidAmount || "";
    const secret = hashToScalar(payerAddress, link.businessId, secretAmount);
    const nullifier = hashToScalar(nonce, link.id);

    const commitResult = await executeCommit(secret, nullifier, STELLAR_NETWORK);

    if (!commitResult.success) {
      console.error("Commit failed for link", id, commitResult.error);
      await db.paymentLink.update({
        where: { id },
        data: {
          ...paidData,
          nonce,
          nullifier: nullifier.toString(),
        },
      });
      return NextResponse.json({
        status: "paid" as const,
        paymentTxHash: found.txHash,
        paidAt: normalizedPaidAt.toISOString(),
        commitmentError: commitResult.error,
      });
    }

    await db.paymentLink.update({
      where: { id },
      data: {
        ...paidData,
        nonce,
        nullifier: nullifier.toString(),
        commitmentTxHash: commitResult.commitmentTxHash,
      },
    });
    return NextResponse.json({
      status: "paid" as const,
      paymentTxHash: found.txHash,
      paidAt: normalizedPaidAt.toISOString(),
      commitmentTxHash: commitResult.commitmentTxHash,
    });
  } catch (e) {
    console.error("Payment link status error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
