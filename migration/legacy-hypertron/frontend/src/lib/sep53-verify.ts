import { createHash } from "crypto";
import { Keypair } from "@stellar/stellar-sdk";

const SEP53_PREFIX = Buffer.from("Stellar Signed Message:\n", "utf8");

/** SHA256(prefix + utf8(message)) per SEP-53. */
export function sep53MessageHash(message: string): Buffer {
  const msgBytes = Buffer.from(message, "utf8");
  return createHash("sha256").update(Buffer.concat([SEP53_PREFIX, msgBytes])).digest();
}

/** Verify a base64-encoded detached Ed25519 signature from Freighter `signMessage`. */
export function verifySep53SignedMessage(
  messageUtf8: string,
  signedMessageBase64: string,
  expectedPublicKey: string
): boolean {
  const sig = Buffer.from(signedMessageBase64.trim(), "base64");
  if (sig.length !== 64) return false;
  const hash = sep53MessageHash(messageUtf8);
  try {
    return Keypair.fromPublicKey(expectedPublicKey.trim()).verify(hash, sig);
  } catch {
    return false;
  }
}
