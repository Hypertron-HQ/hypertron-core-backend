/**
 * Server-only: send XLM or USDC from pool account to recipient.
 * Requires POOL_PAYOUT_SECRET or SOROBAN_COMMIT_SOURCE_SECRET.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { getUsdcIssuer, normalizePaymentAmount, type PaymentAssetCode } from "@/lib/stellar-assets";

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

export type PayoutResult =
  | { success: true; txHash: string }
  | { success: false; error: string };

export type SendPayoutOptions = {
  assetCode?: PaymentAssetCode;
  /** Plain text memo (max 28 chars). */
  memo?: string;
};

function getPoolSecret(): string | null {
  return (
    process.env.POOL_PAYOUT_SECRET?.trim() ||
    process.env.SOROBAN_COMMIT_SOURCE_SECRET?.trim() ||
    null
  );
}

/**
 * Build, sign, and submit a payment from the pool account to recipient.
 */
export async function sendPayout(
  recipientAddress: string,
  amount: string,
  network: StellarNetwork,
  options?: SendPayoutOptions
): Promise<PayoutResult> {
  const secret = getPoolSecret();
  if (!secret) {
    return { success: false, error: "POOL_PAYOUT_SECRET or SOROBAN_COMMIT_SOURCE_SECRET not set" };
  }

  const assetCode = options?.assetCode ?? "XLM";
  const keypair = Keypair.fromSecret(secret);
  const horizonUrl = getHorizonUrl(network);
  const networkPassphrase = getNetworkPassphrase(network);

  try {
    const {
      Horizon,
      TransactionBuilder,
      Operation,
      Asset,
      Memo,
    } = await import("@stellar/stellar-sdk");
    const server = new Horizon.Server(horizonUrl);
    const sourceAccount = await server.loadAccount(keypair.publicKey());
    const amountStr = normalizePaymentAmount(amount, assetCode);

    const builder = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase,
    });

    const paymentAsset =
      assetCode === "XLM" ? Asset.native() : new Asset("USDC", getUsdcIssuer(network));

    const memoText = options?.memo?.trim().slice(0, 28);
    if (memoText) {
      builder.addMemo(Memo.text(memoText));
    }

    let destinationExists = true;
    try {
      await server.loadAccount(recipientAddress);
    } catch {
      destinationExists = false;
    }

    if (!destinationExists && assetCode !== "XLM") {
      return {
        success: false,
        error:
          "Recipient account is not activated on this network. They must fund their Stellar account before receiving USDC.",
      };
    }

    if (destinationExists) {
      builder.addOperation(
        Operation.payment({
          destination: recipientAddress,
          asset: paymentAsset,
          amount: amountStr,
        })
      );
    } else {
      builder.addOperation(
        Operation.createAccount({
          destination: recipientAddress,
          startingBalance: amountStr,
        })
      );
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

/** @deprecated Pass `amount` with optional `assetCode: "XLM"`. */
export async function sendPayoutXlm(
  recipientAddress: string,
  amountXlm: string,
  network: StellarNetwork
): Promise<PayoutResult> {
  return sendPayout(recipientAddress, amountXlm, network, { assetCode: "XLM" });
}
