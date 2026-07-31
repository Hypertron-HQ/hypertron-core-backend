import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

const SEP53_PREFIX = Buffer.from('Stellar Signed Message:\n', 'utf8');

export function sep53MessageHash(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([SEP53_PREFIX, Buffer.from(message, 'utf8')]))
    .digest();
}

export function verifySep53SignedMessage(
  message: string,
  signatureBase64: string,
  expectedPublicKey: string,
): boolean {
  const signature = Buffer.from(signatureBase64.trim(), 'base64');
  if (signature.length !== 64) {
    return false;
  }

  try {
    return Keypair.fromPublicKey(expectedPublicKey.trim()).verify(
      sep53MessageHash(message),
      signature,
    );
  } catch {
    return false;
  }
}
