/**
 * Server-only: submit PoolManager.commit(secret, nullifier) for Phase 2.
 * Commitment shape: secret = hashToScalar(payer, businessId, amount), nullifier = hashToScalar(nonce, linkId).
 * Requires SOROBAN_COMMIT_SOURCE_SECRET and pool manager contract ID in env.
 */

import { createHash } from "crypto";
import {
  Address,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

const SOROBAN_RPC_TESTNET = "https://soroban-testnet.stellar.org";
const SOROBAN_RPC_MAINNET = "https://soroban-mainnet.stellar.org";
const NETWORK_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const NETWORK_PASSPHRASE_MAINNET = "Public Global Stellar Network ; September 2015";

const BN254_SCALAR_FIELD_ORDER = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

export type StellarNetwork = "testnet" | "public";

function getRpcUrl(network: StellarNetwork): string {
  return network === "testnet" ? SOROBAN_RPC_TESTNET : SOROBAN_RPC_MAINNET;
}

function getNetworkPassphrase(network: StellarNetwork): string {
  return network === "testnet" ? NETWORK_PASSPHRASE_TESTNET : NETWORK_PASSPHRASE_MAINNET;
}

/** Deterministic scalar in BN254 field from string parts (for commitment shape). */
export function hashToScalar(...parts: string[]): bigint {
  const input = parts.join("|");
  const hash = createHash("sha256").update(input, "utf8").digest("hex");
  let value = BigInt("0x" + hash);
  return value % BN254_SCALAR_FIELD_ORDER;
}

export interface ExecuteCommitResult {
  success: true;
  commitmentTxHash: string;
}

export interface ExecuteCommitError {
  success: false;
  error: string;
}

/**
 * Build, sign, and submit PoolManager.commit(secret, nullifier). Uses env:
 * - SOROBAN_COMMIT_SOURCE_SECRET (Stellar secret key; pays for the tx)
 * - NEXT_PUBLIC_POOLMANAGER_CONTRACT_ID or POOLMANAGER_CONTRACT_ID
 */
export async function executeCommit(
  secret: bigint,
  nullifier: bigint,
  network: StellarNetwork
): Promise<ExecuteCommitResult | ExecuteCommitError> {
  const secretKey = process.env.SOROBAN_COMMIT_SOURCE_SECRET?.trim();
  const contractId =
    process.env.POOLMANAGER_CONTRACT_ID?.trim() ||
    process.env.NEXT_PUBLIC_POOLMANAGER_CONTRACT_ID?.trim();

  if (!secretKey) {
    return { success: false, error: "SOROBAN_COMMIT_SOURCE_SECRET not set" };
  }
  if (!contractId) {
    return { success: false, error: "POOLMANAGER_CONTRACT_ID (or NEXT_PUBLIC) not set" };
  }

  try {
    const keypair = Keypair.fromSecret(secretKey);
    const server = new rpc.Server(getRpcUrl(network));
    const account = await server.getAccount(keypair.publicKey());
    const contract = new Contract(contractId);
    const passphrase = getNetworkPassphrase(network);

    const secretScVal = nativeToScVal(secret, { type: "u256" });
    const nullifierScVal = nativeToScVal(nullifier, { type: "u256" });

    const raw = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: passphrase,
    })
      .addOperation(contract.call("commit", secretScVal, nullifierScVal))
      .setTimeout(180)
      .build();

    const sim = await server.simulateTransaction(raw);
    if (rpc.Api.isSimulationError(sim)) {
      return {
        success: false,
        error: String((sim as { error?: string }).error ?? "Simulation failed"),
      };
    }

    const assembled = rpc.assembleTransaction(raw, sim).build();
    assembled.sign(keypair);
    const tx = assembled;
    const send = await server.sendTransaction(tx);
    if (send.errorResult) {
      return { success: false, error: String(send.errorResult) };
    }
    return { success: true, commitmentTxHash: send.hash };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface ExecuteWithdrawResult {
  success: true;
  contractTxHash: string;
}

export interface ExecuteWithdrawError {
  success: false;
  error: string;
}

/**
 * Phase 4: Call PoolManager.withdraw(recipient, nullifiers). Marks nullifiers used on-chain.
 */
export async function executeWithdraw(
  recipientAddress: string,
  nullifiers: bigint[],
  network: StellarNetwork
): Promise<ExecuteWithdrawResult | ExecuteWithdrawError> {
  const secretKey = process.env.SOROBAN_COMMIT_SOURCE_SECRET?.trim();
  const contractId =
    process.env.POOLMANAGER_CONTRACT_ID?.trim() ||
    process.env.NEXT_PUBLIC_POOLMANAGER_CONTRACT_ID?.trim();

  if (!secretKey) {
    return { success: false, error: "SOROBAN_COMMIT_SOURCE_SECRET not set" };
  }
  if (!contractId) {
    return { success: false, error: "POOLMANAGER_CONTRACT_ID not set" };
  }
  if (nullifiers.length === 0) {
    return { success: false, error: "At least one nullifier required" };
  }

  try {
    const keypair = Keypair.fromSecret(secretKey);
    const server = new rpc.Server(getRpcUrl(network));
    const account = await server.getAccount(keypair.publicKey());
    const contract = new Contract(contractId);
    const passphrase = getNetworkPassphrase(network);

    // Contract expects (recipient: Address, nullifiers: Vec<U256>). Pass vec as single ScVal.
    const recipientScVal = new Address(recipientAddress).toScVal();
    const nullifierScVals = nullifiers.map((n) => nativeToScVal(n, { type: "u256" }));
    const nullifiersVecScVal = xdr.ScVal.scvVec(nullifierScVals);

    const raw = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: passphrase,
    })
      .addOperation(
        contract.call("withdraw", recipientScVal, nullifiersVecScVal)
      )
      .setTimeout(180)
      .build();

    const sim = await server.simulateTransaction(raw);
    if (rpc.Api.isSimulationError(sim)) {
      return {
        success: false,
        error: String((sim as { error?: string }).error ?? "Simulation failed"),
      };
    }

    const assembled = rpc.assembleTransaction(raw, sim).build();
    assembled.sign(keypair);
    const send = await server.sendTransaction(assembled);
    if (send.errorResult) {
      return { success: false, error: String(send.errorResult) };
    }
    return { success: true, contractTxHash: send.hash };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
