import { Keypair } from '@stellar/stellar-sdk';
import { sep53MessageHash, verifySep53SignedMessage } from './sep53-verify';

describe('verifySep53SignedMessage', () => {
  it('accepts a valid SEP-53 signature from the expected wallet', () => {
    const keypair = Keypair.random();
    const message = 'Hypertron dashboard sign-in';
    const signature = keypair
      .sign(sep53MessageHash(message))
      .toString('base64');

    expect(
      verifySep53SignedMessage(message, signature, keypair.publicKey()),
    ).toBe(true);
  });

  it('rejects a signature when the message changes', () => {
    const keypair = Keypair.random();
    const signature = keypair
      .sign(sep53MessageHash('Hypertron dashboard sign-in'))
      .toString('base64');

    expect(
      verifySep53SignedMessage(
        'A different message',
        signature,
        keypair.publicKey(),
      ),
    ).toBe(false);
  });
});
