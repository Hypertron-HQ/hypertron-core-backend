/**
 * PoolManager Soroban contract — ZK commitment pool.
 * - initialize(admin): one-time setup
 * - commit(secret, nullifier): add commitment (leaf = Poseidon(secret, nullifier))
 * - get_state(): read pool root + size (no sign)
 */

import {
  Account,
  Address,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";

const SOROBAN_RPC_TESTNET = "https://soroban-testnet.stellar.org";
const SOROBAN_RPC_MAINNET = "https://soroban-mainnet.stellar.org";
const NETWORK_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const NETWORK_PASSPHRASE_MAINNET = "Public Global Stellar Network ; September 2015";

export type StellarNetwork = "testnet" | "public";

export function getSorobanRpcUrl(network: StellarNetwork): string {
  return network === "testnet" ? SOROBAN_RPC_TESTNET : SOROBAN_RPC_MAINNET;
}

export function getNetworkPassphrase(network: StellarNetwork): string {
  return network === "testnet" ? NETWORK_PASSPHRASE_TESTNET : NETWORK_PASSPHRASE_MAINNET;
}

/**
 * BN254 scalar field order. Poseidon (BnScalar) requires inputs < this;
 * otherwise the host traps (UnreachableCodeReached).
 */
const BN254_SCALAR_FIELD_ORDER = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

/** Random value in [0, BN254 field order) for secret or nullifier. */
export function randomU256(): bigint {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let value = BigInt(0);
  for (let i = 0; i < 32; i++) {
    value = (value << BigInt(8)) | BigInt(bytes[i]);
  }
  return value % BN254_SCALAR_FIELD_ORDER;
}

export interface PoolState {
  root: string;
  size: number;
}

/** Valid dummy source for read-only simulation (get_state). SDK requires a valid G... address. */
const DUMMY_SOURCE =
  "GBVFSJHI3FBQEVWLFCWHPM44Y7PUB2UO346H335WC24RL7UPGPPIGBRW";

/** True if the error means the pool has not been initialized yet (get_state panics). */
function isPoolNotInitializedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not initialized") ||
    m.includes("unreachablecodereached") ||
    (m.includes("wasmvm") && m.includes("get_state")) ||
    (m.includes("invalidaction") && m.includes("get_state"))
  );
}

/**
 * Read pool state (get_state) — no signing. Returns { root, size } or null if not initialized.
 */
export async function fetchPoolState(
  contractId: string,
  network: StellarNetwork
): Promise<PoolState | null> {
  const server = new rpc.Server(getSorobanRpcUrl(network));
  const contract = new Contract(contractId);

  try {
    const sim = await server.simulateTransaction(
      new TransactionBuilder(
        new Account(DUMMY_SOURCE, "0"),
        {
          fee: "100",
          networkPassphrase: getNetworkPassphrase(network),
        }
      )
        .addOperation(contract.call("get_state"))
        .setTimeout(180)
        .build()
    );

    if (rpc.Api.isSimulationError(sim)) {
      const errMsg = String((sim as { error?: string }).error ?? "");
      if (isPoolNotInitializedError(errMsg)) return null;
      throw new Error(errMsg);
    }
    const result = (sim as { result?: { retval?: unknown } }).result;
    if (!result?.retval) return null;

    const ret = scValToNative(result.retval as import("@stellar/stellar-sdk").xdr.ScVal);
    if (ret && typeof ret === "object" && "root" in ret && "size" in ret) {
      return {
        root: String((ret as { root: unknown }).root),
        size: Number((ret as { size: unknown }).size),
      };
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isPoolNotInitializedError(msg)) return null;
    throw e;
  }
}

export type PrepareInvokeResult =
  | {
      success: true;
      xdr: string;
      signAndSend: (signedXdr: string) => Promise<
        { success: true; hash: string } | { success: false; error: string }
      >;
    }
  | { success: false; error: string };

/**
 * Prepare PoolManager.initialize(admin). Caller must sign and then call signAndSend.
 */
export async function prepareInitialize(
  contractId: string,
  network: StellarNetwork,
  adminPublicKey: string
): Promise<PrepareInvokeResult> {
  const server = new rpc.Server(getSorobanRpcUrl(network));
  const networkPassphrase = getNetworkPassphrase(network);
  const contract = new Contract(contractId);
  const adminScVal = new Address(adminPublicKey).toScVal();

  try {
    const account = await server.getAccount(adminPublicKey);
    const raw = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(contract.call("initialize", adminScVal))
      .setTimeout(180)
      .build();

    const sim = await server.simulateTransaction(raw);
    if (rpc.Api.isSimulationError(sim)) {
      return { success: false, error: String((sim as { error?: string }).error) };
    }
    const assembled = rpc.assembleTransaction(raw, sim).build();
    const xdr = assembled.toXDR();

    return {
      success: true,
      xdr,
      signAndSend: async (signedXdr: string) => {
        try {
          const tx = new Transaction(signedXdr, networkPassphrase);
          const send = await server.sendTransaction(tx);
          if (send.errorResult) {
            return { success: false, error: String(send.errorResult) };
          }
          return { success: true, hash: send.hash };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Prepare PoolManager.commit(secret, nullifier). Caller must sign and then call signAndSend.
 */
export async function prepareCommit(
  contractId: string,
  network: StellarNetwork,
  signerPublicKey: string,
  secret: bigint,
  nullifier: bigint
): Promise<PrepareInvokeResult> {
  const server = new rpc.Server(getSorobanRpcUrl(network));
  const networkPassphrase = getNetworkPassphrase(network);
  const contract = new Contract(contractId);

  const secretScVal = nativeToScVal(secret, { type: "u256" });
  const nullifierScVal = nativeToScVal(nullifier, { type: "u256" });

  try {
    const account = await server.getAccount(signerPublicKey);
    const raw = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase,
    })
      .addOperation(contract.call("commit", secretScVal, nullifierScVal))
      .setTimeout(180)
      .build();

    const sim = await server.simulateTransaction(raw);
    if (rpc.Api.isSimulationError(sim)) {
      return { success: false, error: String((sim as { error?: string }).error) };
    }
    const assembled = rpc.assembleTransaction(raw, sim).build();
    const xdr = assembled.toXDR();

    return {
      success: true,
      xdr,
      signAndSend: async (signedXdr: string) => {
        try {
          const tx = new Transaction(signedXdr, networkPassphrase);
          const send = await server.sendTransaction(tx);
          if (send.errorResult) {
            return { success: false, error: String(send.errorResult) };
          }
          return { success: true, hash: send.hash };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
