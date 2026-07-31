/**
 * Hybrid Vault: Dedicated Stellar account per workspace.
 * 
 * Vault Types:
 * - custodial: Hypertron controls the vault (single signer)
 * - hybrid: Hypertron + user must co-sign (multisig threshold 2)
 * - external: User provides their own wallet address (no key storage)
 * 
 * For hybrid mode, the vault requires both Hypertron and the user to sign withdrawals.
 */

import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { encryptSecret, decryptSecret } from "./vault-crypto";
import { getUsdcIssuer, type PaymentAssetCode } from "./stellar-assets";
import { getHorizonUrl, getNetworkPassphrase, type StellarNetwork } from "./stellar-payment";

export type VaultType = "custodial" | "hybrid" | "external";

export interface VaultBalance {
  xlm: string;
  usdc: string;
  xlmRaw: number;
  usdcRaw: number;
}

export type CreateVaultResult =
  | { success: true; vaultAddress: string; vaultSecretEnc: string }
  | { success: false; error: string };

export type SetupHybridResult =
  | { success: true; txHash: string }
  | { success: false; error: string };

const HYPERTRON_SIGNER_SECRET = process.env.HYPERTRON_VAULT_SIGNER_SECRET || process.env.SOROBAN_COMMIT_SOURCE_SECRET;
const HYPERTRON_SIGNER_PUBLIC = process.env.HYPERTRON_VAULT_SIGNER_PUBLIC || process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY;

export function getHypertronSignerPublic(): string | null {
  if (HYPERTRON_SIGNER_PUBLIC) return HYPERTRON_SIGNER_PUBLIC;
  if (HYPERTRON_SIGNER_SECRET) {
    try {
      return Keypair.fromSecret(HYPERTRON_SIGNER_SECRET).publicKey();
    } catch {
      return null;
    }
  }
  return null;
}

export function getHypertronSignerKeypair(): Keypair | null {
  if (!HYPERTRON_SIGNER_SECRET) return null;
  try {
    return Keypair.fromSecret(HYPERTRON_SIGNER_SECRET);
  } catch {
    return null;
  }
}

/**
 * Generate a new vault keypair and encrypt the secret.
 */
export function createVaultKeypair(): CreateVaultResult {
  try {
    const keypair = Keypair.random();
    const vaultSecretEnc = encryptSecret(keypair.secret());
    return {
      success: true,
      vaultAddress: keypair.publicKey(),
      vaultSecretEnc,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create vault keypair",
    };
  }
}

/**
 * Fund a new vault account on Stellar (activation).
 * Requires a funded source account (pool payout secret).
 */
export async function fundVaultAccount(
  vaultAddress: string,
  network: StellarNetwork,
  startingBalance: string = "2"
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  const sourceSecret = process.env.POOL_PAYOUT_SECRET || process.env.SOROBAN_COMMIT_SOURCE_SECRET;
  if (!sourceSecret) {
    return { success: false, error: "POOL_PAYOUT_SECRET not configured" };
  }

  try {
    const sourceKeypair = Keypair.fromSecret(sourceSecret);
    const horizonUrl = getHorizonUrl(network);
    const networkPassphrase = getNetworkPassphrase(network);
    const server = new Horizon.Server(horizonUrl);

    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(
        Operation.createAccount({
          destination: vaultAddress,
          startingBalance,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(sourceKeypair);
    const result = await server.submitTransaction(tx);

    return { success: true, txHash: result.hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fund vault",
    };
  }
}

/**
 * Set up hybrid multisig on vault account.
 * Requires the vault master key (before it's disabled).
 */
export async function setupHybridMultisig(
  vaultSecretEnc: string,
  userCoSignerAddress: string,
  network: StellarNetwork
): Promise<SetupHybridResult> {
  const hypertronPublic = getHypertronSignerPublic();
  if (!hypertronPublic) {
    return { success: false, error: "HYPERTRON_VAULT_SIGNER not configured" };
  }

  try {
    const vaultSecret = decryptSecret(vaultSecretEnc);
    const vaultKeypair = Keypair.fromSecret(vaultSecret);
    const horizonUrl = getHorizonUrl(network);
    const networkPassphrase = getNetworkPassphrase(network);
    const server = new Horizon.Server(horizonUrl);

    const vaultAccount = await server.loadAccount(vaultKeypair.publicKey());

    const tx = new TransactionBuilder(vaultAccount, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: hypertronPublic,
            weight: 1,
          },
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: userCoSignerAddress,
            weight: 1,
          },
        })
      )
      .addOperation(
        Operation.setOptions({
          masterWeight: 0,
          lowThreshold: 2,
          medThreshold: 2,
          highThreshold: 2,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(vaultKeypair);
    const result = await server.submitTransaction(tx);

    return { success: true, txHash: result.hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to setup multisig",
    };
  }
}

/**
 * Add USDC trustline to vault account.
 */
export async function addUsdcTrustline(
  vaultSecretEnc: string,
  network: StellarNetwork
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const vaultSecret = decryptSecret(vaultSecretEnc);
    const vaultKeypair = Keypair.fromSecret(vaultSecret);
    const horizonUrl = getHorizonUrl(network);
    const networkPassphrase = getNetworkPassphrase(network);
    const server = new Horizon.Server(horizonUrl);

    const vaultAccount = await server.loadAccount(vaultKeypair.publicKey());
    const usdcAsset = new Asset("USDC", getUsdcIssuer(network));

    const tx = new TransactionBuilder(vaultAccount, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: usdcAsset,
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(vaultKeypair);
    const result = await server.submitTransaction(tx);

    return { success: true, txHash: result.hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add trustline",
    };
  }
}

/**
 * Get vault balances from Horizon.
 */
export async function getVaultBalance(
  vaultAddress: string,
  network: StellarNetwork
): Promise<VaultBalance | null> {
  try {
    const horizonUrl = getHorizonUrl(network);
    const server = new Horizon.Server(horizonUrl);
    const account = await server.loadAccount(vaultAddress);
    const usdcIssuer = getUsdcIssuer(network);

    let xlmRaw = 0;
    let usdcRaw = 0;

    for (const balance of account.balances) {
      if (balance.asset_type === "native") {
        xlmRaw = parseFloat(balance.balance);
      } else if (
        balance.asset_type === "credit_alphanum4" &&
        (balance as any).asset_code === "USDC" &&
        (balance as any).asset_issuer === usdcIssuer
      ) {
        usdcRaw = parseFloat(balance.balance);
      }
    }

    return {
      xlm: xlmRaw.toFixed(4),
      usdc: usdcRaw.toFixed(2),
      xlmRaw,
      usdcRaw,
    };
  } catch {
    return null;
  }
}

/**
 * Build a partial-signed withdraw transaction for hybrid mode.
 * Hypertron signs first, then user co-signs with Freighter.
 */
export async function buildHybridWithdrawXdr(
  vaultAddress: string,
  recipientAddress: string,
  amount: string,
  assetCode: PaymentAssetCode,
  network: StellarNetwork,
  memo?: string
): Promise<{ success: true; xdr: string } | { success: false; error: string }> {
  const hypertronKeypair = getHypertronSignerKeypair();
  if (!hypertronKeypair) {
    return { success: false, error: "HYPERTRON_VAULT_SIGNER not configured" };
  }

  try {
    const horizonUrl = getHorizonUrl(network);
    const networkPassphrase = getNetworkPassphrase(network);
    const server = new Horizon.Server(horizonUrl);

    const vaultAccount = await server.loadAccount(vaultAddress);

    const paymentAsset =
      assetCode === "XLM" ? Asset.native() : new Asset("USDC", getUsdcIssuer(network));

    const amountStr = parseFloat(amount).toFixed(assetCode === "XLM" ? 7 : 2);

    const builder = new TransactionBuilder(vaultAccount, {
      fee: "100",
      networkPassphrase,
    });

    if (memo && memo.trim()) {
      builder.addMemo(Memo.text(memo.trim().slice(0, 28)));
    }

    builder.addOperation(
      Operation.payment({
        destination: recipientAddress,
        asset: paymentAsset,
        amount: amountStr,
      })
    );

    const tx = builder.setTimeout(300).build();

    tx.sign(hypertronKeypair);

    return { success: true, xdr: tx.toXDR() };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to build withdraw transaction",
    };
  }
}

/**
 * Build and fully sign a withdraw transaction for custodial mode.
 */
export async function executeCustodialWithdraw(
  vaultSecretEnc: string,
  recipientAddress: string,
  amount: string,
  assetCode: PaymentAssetCode,
  network: StellarNetwork,
  memo?: string
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const vaultSecret = decryptSecret(vaultSecretEnc);
    const vaultKeypair = Keypair.fromSecret(vaultSecret);
    const horizonUrl = getHorizonUrl(network);
    const networkPassphrase = getNetworkPassphrase(network);
    const server = new Horizon.Server(horizonUrl);

    const vaultAccount = await server.loadAccount(vaultKeypair.publicKey());

    const paymentAsset =
      assetCode === "XLM" ? Asset.native() : new Asset("USDC", getUsdcIssuer(network));

    const amountStr = parseFloat(amount).toFixed(assetCode === "XLM" ? 7 : 2);

    const builder = new TransactionBuilder(vaultAccount, {
      fee: "100",
      networkPassphrase,
    });

    if (memo && memo.trim()) {
      builder.addMemo(Memo.text(memo.trim().slice(0, 28)));
    }

    builder.addOperation(
      Operation.payment({
        destination: recipientAddress,
        asset: paymentAsset,
        amount: amountStr,
      })
    );

    const tx = builder.setTimeout(30).build();
    tx.sign(vaultKeypair);

    const result = await server.submitTransaction(tx);
    return { success: true, txHash: result.hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to execute withdraw",
    };
  }
}
