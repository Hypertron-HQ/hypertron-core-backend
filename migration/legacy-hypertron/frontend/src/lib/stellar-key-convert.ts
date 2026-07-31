import { Keypair } from "@stellar/stellar-sdk";

export type PrivyHexToFreighterResult =
  | { ok: true; secretKey: string; publicKey: string }
  | { ok: false; error: string };

/** Convert Privy's raw Ed25519 hex seed to a Freighter-compatible Stellar S… secret key. */
export function privyHexSeedToStellarSecret(
  hexInput: string,
  expectedPublicKey?: string | null
): PrivyHexToFreighterResult {
  const hex = hexInput.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return { ok: false, error: "Enter a valid hexadecimal seed from Privy." };
  }
  if (hex.length !== 64) {
    return {
      ok: false,
      error: "Privy exports a 32-byte seed (64 hex characters). Check you copied the full key.",
    };
  }

  try {
    const seed = Buffer.from(hex, "hex");
    const keypair = Keypair.fromRawEd25519Seed(seed);
    const publicKey = keypair.publicKey();
    const secretKey = keypair.secret();

    const expected = expectedPublicKey?.trim();
    if (expected && expected.length === 56 && expected.startsWith("G") && publicKey !== expected) {
      return {
        ok: false,
        error: "This seed does not match your wallet address. Export the key for this account from Privy.",
      };
    }

    return { ok: true, secretKey, publicKey };
  } catch {
    return { ok: false, error: "Could not derive a Stellar keypair from that seed." };
  }
}
