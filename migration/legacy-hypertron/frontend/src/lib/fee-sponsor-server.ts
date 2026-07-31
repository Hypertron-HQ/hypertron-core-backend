import {
  Horizon,
  Keypair,
  MemoHash,
  MemoText,
  Transaction,
  TransactionBuilder,
  WebAuth,
} from "@stellar/stellar-sdk";
import type { Operation } from "@stellar/stellar-sdk";
import { db } from "@/lib/prisma";
import { getExpectedPaymentDestination } from "@/lib/payment-destination";
import { getHorizonUrl, getNetworkPassphrase, type StellarNetwork } from "@/lib/stellar-payment";

const FEE_SPONSOR_MAX_FEE_STROOPS = (process.env.FEE_SPONSOR_MAX_FEE_STROOPS ?? "100000").trim();

function normalizeAmount7(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n < 0) return "0.0000000";
  return n.toFixed(7);
}

function getNativePaymentOrCreate(op: Operation): { destination: string; amount: string } | null {
  if (op.type === "payment") {
    if (!op.asset.isNative()) return null;
    return { destination: op.destination, amount: normalizeAmount7(op.amount) };
  }
  if (op.type === "createAccount") {
    return { destination: op.destination, amount: normalizeAmount7(op.startingBalance) };
  }
  return null;
}

export interface SubmitSponsoredPaymentInput {
  linkId: string;
  signedInnerTxXdr: string;
  payerPublicKey: string;
  network: StellarNetwork;
}

export type SubmitSponsoredPaymentResult =
  | { success: true; txHash: string }
  | { success: false; error: string; status?: number };

/**
 * Validates payer-signed inner payment tx, wraps as fee bump, submits to Horizon.
 * Requires FEE_SPONSOR_SECRET (must not match payer). Validates destination, amount, memo vs DB.
 */
export async function submitSponsoredPayment(
  input: SubmitSponsoredPaymentInput
): Promise<SubmitSponsoredPaymentResult> {
  const secret = process.env.FEE_SPONSOR_SECRET?.trim();
  if (!secret) {
    return { success: false, error: "Fee sponsorship is not configured", status: 503 };
  }

  const sponsorKeypair = Keypair.fromSecret(secret);
  const passphrase = getNetworkPassphrase(input.network);
  const horizonUrl = getHorizonUrl(input.network);

  const expectedSponsorPub = process.env.NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY?.trim();
  if (expectedSponsorPub && expectedSponsorPub !== sponsorKeypair.publicKey()) {
    return {
      success: false,
      error: "FEE_SPONSOR_SECRET does not match NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY",
      status: 500,
    };
  }

  if (sponsorKeypair.publicKey() === input.payerPublicKey.trim()) {
    return { success: false, error: "Fee sponsor and payer must be different accounts" };
  }

  let innerTx: Transaction;
  try {
    innerTx = new Transaction(input.signedInnerTxXdr, passphrase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Invalid transaction XDR: ${msg}` };
  }

  if (innerTx.source !== input.payerPublicKey.trim()) {
    return { success: false, error: "Inner transaction source does not match payer" };
  }

  if (!WebAuth.verifyTxSignedBy(innerTx, input.payerPublicKey.trim())) {
    return { success: false, error: "Inner transaction is not signed by the payer" };
  }

  if (innerTx.operations.length !== 1) {
    return { success: false, error: "Only single-operation payment transactions are allowed" };
  }

  const link = await db.paymentLink.findUnique({
    where: { id: input.linkId },
    select: { id: true, destinationAddress: true, linkMemo: true, amount: true },
  });
  if (!link) {
    return { success: false, error: "Payment link not found", status: 404 };
  }

  const expectedDest = getExpectedPaymentDestination(link.destinationAddress);
  const parsed = getNativePaymentOrCreate(innerTx.operations[0]);
  if (!parsed) {
    return { success: false, error: "Operation must be a native XLM payment or createAccount" };
  }
  if (parsed.destination !== expectedDest) {
    return { success: false, error: "Payment destination does not match this link" };
  }

  let expectedAmount: string;
  if (innerTx.memo.type === MemoHash) {
    const memoHex =
      innerTx.memo.value instanceof Buffer
        ? innerTx.memo.value.toString("hex")
        : Buffer.from(innerTx.memo.value as unknown as Uint8Array).toString("hex");

    const pending = await db.pendingPaymentMemo.findFirst({
      where: { linkId: link.id, memoHash: memoHex },
      select: { amount: true },
    });
    if (!pending) {
      return {
        success: false,
        error: "Memo hash is not registered for this link (use Prepare payment first)",
      };
    }
    expectedAmount = normalizeAmount7(pending.amount);
  } else if (innerTx.memo.type === MemoText) {
    const textVal =
      typeof innerTx.memo.value === "string"
        ? innerTx.memo.value
        : Buffer.from(innerTx.memo.value as Buffer).toString("utf8");
    const expectedMemo = link.linkMemo.trim().slice(0, 28);
    if (textVal.trim().slice(0, 28) !== expectedMemo) {
      return { success: false, error: "Memo does not match this payment link" };
    }
    if (link.amount == null || String(link.amount).trim() === "") {
      return {
        success: false,
        error: "Flexible amount links require the opaque memo flow (prepare payment)",
      };
    }
    expectedAmount = normalizeAmount7(String(link.amount));
  } else {
    return {
      success: false,
      error: "Unsupported memo type for sponsored pay (use hash memo or link text memo)",
    };
  }

  if (parsed.amount !== expectedAmount) {
    return { success: false, error: "Payment amount does not match the prepared link payment" };
  }

  try {
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      FEE_SPONSOR_MAX_FEE_STROOPS,
      innerTx,
      passphrase
    );
    feeBump.sign(sponsorKeypair);

    const server = new Horizon.Server(horizonUrl);
    const result = await server.submitTransaction(feeBump);
    return { success: true, txHash: result.hash };
  } catch (e) {
    const message =
      e instanceof Error && "response" in e
        ? JSON.stringify((e as { response?: { data?: unknown } }).response?.data ?? e.message)
        : e instanceof Error
          ? e.message
          : String(e);
    return { success: false, error: message };
  }
}
