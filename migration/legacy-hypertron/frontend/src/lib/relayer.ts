/**
 * Server-only: relayer flow so the pool only sees "relayer → pool" (payer hidden).
 * 1. Client pays RELAYER with hash memo.
 * 2. This module watches relayer, forwards each payment to POOL with same memo, then commits.
 */

import {
  Horizon,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
  Asset,
} from "@stellar/stellar-sdk";
import { db } from "@/lib/prisma";
import { findPaymentsToAccountWithHashMemo } from "@/lib/horizon";
import { executeCommit, hashToScalar } from "@/lib/soroban-commit-server";
import { randomBytes } from "crypto";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_MAINNET = "https://horizon.stellar.org";
const NETWORK_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const NETWORK_PASSPHRASE_MAINNET = "Public Global Stellar Network ; September 2015";

export type StellarNetwork = "testnet" | "public";

function getHorizonUrl(network: StellarNetwork): string {
  return network === "testnet" ? HORIZON_TESTNET : HORIZON_MAINNET;
}

function getNetworkPassphrase(network: StellarNetwork): string {
  return network === "testnet" ? NETWORK_PASSPHRASE_TESTNET : NETWORK_PASSPHRASE_MAINNET;
}

function normalizeAmount(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 0) return "0.0000000";
  return n.toFixed(7);
}

function getRelayerKeypair(): Keypair | null {
  const secret = process.env.RELAYER_SECRET_KEY?.trim();
  if (!secret) return null;
  try {
    return Keypair.fromSecret(secret);
  } catch {
    return null;
  }
}

export function isRelayerConfigured(): boolean {
  const pub = (process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY ?? "").trim();
  const keypair = getRelayerKeypair();
  return pub.length === 56 && pub.startsWith("G") && keypair !== null;
}

/**
 * Submit a payment from relayer to pool (same amount + memo hash). Returns tx hash or error.
 */
export async function submitRelayerToPool(
  amountXlm: string,
  memoHashHex: string,
  poolAddress: string,
  network: StellarNetwork
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  const keypair = getRelayerKeypair();
  if (!keypair) {
    return { success: false, error: "RELAYER_SECRET_KEY not set" };
  }

  const horizonUrl = getHorizonUrl(network);
  const networkPassphrase = getNetworkPassphrase(network);

  try {
    const server = new Horizon.Server(horizonUrl);
    const sourceAccount = await server.loadAccount(keypair.publicKey());
    const amountStr = normalizeAmount(amountXlm);

    const builder = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase,
    });

    try {
      await server.loadAccount(poolAddress);
      builder.addOperation(
        Operation.payment({
          destination: poolAddress,
          asset: Asset.native(),
          amount: amountStr,
        })
      );
    } catch {
      builder.addOperation(
        Operation.createAccount({
          destination: poolAddress,
          startingBalance: amountStr,
        })
      );
    }

    if (memoHashHex.length === 64 && /^[0-9a-fA-F]+$/.test(memoHashHex)) {
      builder.addMemo(Memo.hash(memoHashHex));
    }

    const tx = builder.setTimeout(30).build();
    tx.sign(keypair);
    const result = await server.submitTransaction(tx);
    return { success: true, txHash: result.hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Process incoming payments to the relayer: for each hash-memo payment that matches a
 * PendingPaymentMemo, forward to pool, run commit (using relayer as "payer" so real payer is hidden), update link.
 */
export async function processRelayerInbox(network: StellarNetwork): Promise<number> {
  const relayerPub = (process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY ?? "").trim();
  const poolAddress = (
    process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
    ""
).trim();

  if (!relayerPub || !poolAddress || !getRelayerKeypair()) return 0;

  const payments = await findPaymentsToAccountWithHashMemo(relayerPub, network, 50);
  if (payments.length === 0) return 0;

  const pendingByHash = await db.pendingPaymentMemo.findMany({
    where: { memoHash: { in: payments.map((p) => p.memoHashHex) } },
    select: { id: true, linkId: true, memoHash: true, amount: true },
  });
  const mapByHash = new Map(pendingByHash.map((p) => [p.memoHash, p]));

  let processed = 0;
  for (const hp of payments) {
    const pending = mapByHash.get(hp.memoHashHex);
    if (!pending) continue;

    const link = await db.paymentLink.findUnique({
      where: { id: pending.linkId },
      include: { business: true },
    });
    if (!link) continue;

    const forward = await submitRelayerToPool(
      pending.amount,
      hp.memoHashHex,
      poolAddress,
      network
    );
    if (!forward.success) {
      console.error("[Relayer] forward failed for link", pending.linkId, forward.error);
      continue;
    }

    const relayerAddress = relayerPub;
    const nonce = randomBytes(16).toString("hex");
    const secret = hashToScalar(relayerAddress, link.businessId, link.amount ?? "");
    const nullifier = hashToScalar(nonce, link.id);

    const commitResult = await executeCommit(secret, nullifier, network);

    await db.pendingPaymentMemo.deleteMany({
      where: { linkId: pending.linkId, memoHash: hp.memoHashHex },
    });

    await db.paymentLink.update({
      where: { id: pending.linkId },
      data: {
        paidAt: new Date(),
        paymentTxHash: forward.txHash,
        payerAddress: undefined,
        nonce,
        nullifier: nullifier.toString(),
        commitmentTxHash: commitResult.success ? commitResult.commitmentTxHash : undefined,
      },
    });

    if (!commitResult.success) {
      console.error("[Relayer] commit failed for link", pending.linkId, commitResult.error);
    }
    processed++;
  }

  return processed;
}
