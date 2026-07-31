import { StrKey } from "@stellar/stellar-sdk";
import { pad } from "viem";
import { PublicKey } from "@solana/web3.js";

export type CctpAttestationMessage = {
  message: string;
  attestation: string;
  status: string;
  eventNonce?: string;
};

/** Solana CCTP mint expects a 32-byte nonce as 0x-prefixed hex. */
export function resolveCctpEventNonce(attestation: CctpAttestationMessage): string {
  const raw = attestation.eventNonce?.trim();
  if (raw) {
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      return `0x${hex.toLowerCase()}`;
    }
  }

  const messageHex = attestation.message.startsWith("0x")
    ? attestation.message.slice(2)
    : attestation.message;
  if (messageHex.length < 88) {
    throw new Error("Attestation message is too short to derive event nonce.");
  }

  const nonceHex = messageHex.slice(24, 88);
  if (!/^[0-9a-fA-F]{64}$/.test(nonceHex)) {
    throw new Error("Attestation is missing a valid CCTP event nonce.");
  }
  return `0x${nonceHex.toLowerCase()}`;
}

export function parseUsdcAmount(amount: string): number {
  const n = parseFloat(amount.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Enter a valid USDC amount.");
  }
  return n;
}

/** CCTP message amounts use six decimal subunits. */
export function toCctpSubunits(amount: string): bigint {
  const n = parseUsdcAmount(amount);
  return BigInt(Math.round(n * 1_000_000));
}

/** Stellar burns scale six-decimal CCTP amounts to seven-decimal ledger units. */
export function cctpSubunitsToStellarBurnSubunits(cctpSubunits: bigint): bigint {
  return cctpSubunits * BigInt(10);
}

export function formatUsdcFromCctpSubunits(subunits: bigint): string {
  return (Number(subunits) / 1_000_000).toFixed(6);
}

export function contractStrkeyToBytes32(strkey: string): `0x${string}` {
  if (!StrKey.isValidContract(strkey)) {
    throw new Error(`Invalid Stellar contract address: ${strkey}`);
  }
  return `0x${Buffer.from(StrKey.decodeContract(strkey)).toString("hex")}`;
}

export function buildCctpForwarderHookData(forwardRecipientStrkey: string): `0x${string}` {
  const isValid =
    StrKey.isValidEd25519PublicKey(forwardRecipientStrkey) ||
    StrKey.isValidContract(forwardRecipientStrkey) ||
    StrKey.isValidMed25519PublicKey(forwardRecipientStrkey);
  if (!isValid) {
    throw new Error(
      `Invalid Stellar recipient ${forwardRecipientStrkey}. Expected a G..., C..., or M... address.`
    );
  }

  const recipientBytes = Buffer.from(forwardRecipientStrkey, "utf8");
  const hookData = Buffer.alloc(32 + recipientBytes.length);
  hookData.writeUInt32BE(0, 24);
  hookData.writeUInt32BE(recipientBytes.length, 28);
  recipientBytes.copy(hookData, 32);
  return `0x${hookData.toString("hex")}`;
}

export function evmAddressToBytes32(address: string): `0x${string}` {
  return pad(address as `0x${string}`);
}

export function solanaAddressToBytes32(address: string): Buffer {
  return new PublicKey(address).toBuffer();
}

export function bytesToHexPrefixed(bytes: Buffer | Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function hexToBuffer(hex: string): Buffer {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(normalized, "hex");
}
