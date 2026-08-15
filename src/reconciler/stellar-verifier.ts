/**
 * Classic Horizon payment match checks for dashboard Collect PaymentLinks.
 */

import { Injectable } from '@nestjs/common';

import { compareDecimalStrings } from './amount.util';
import type {
  HorizonEnvironment,
  HorizonPaymentRecord,
} from './stellar-horizon.service';

export interface PaymentMatchTarget {
  linkMemo: string;
  destinationAddress: string;
  amount: string;
  currency: string;
  environment: HorizonEnvironment;
  expiresAt: Date | null;
}

export type VerifyFailureCode =
  | 'wrong_asset'
  | 'wrong_issuer'
  | 'insufficient_amount'
  | 'wrong_amount'
  | 'memo_mismatch'
  | 'wrong_destination'
  | 'expired'
  | 'duplicate_hash'
  | 'tx_unsuccessful'
  | 'no_match';

export type VerifyResult =
  | { ok: true; payment: HorizonPaymentRecord }
  | {
      ok: false;
      code: VerifyFailureCode;
      message: string;
      payment?: HorizonPaymentRecord;
    };

@Injectable()
export class StellarVerifier {
  verify(
    target: PaymentMatchTarget,
    records: HorizonPaymentRecord[],
    knownHashes: Set<string>,
  ): VerifyResult {
    let memoHit: HorizonPaymentRecord | undefined;

    for (const record of records) {
      if (!record.successful) continue;
      if (record.memo !== target.linkMemo) continue;

      memoHit = record;
      const check = this.checkRecord(target, record, knownHashes);
      if (check.ok) return check;
      return check;
    }

    if (memoHit) {
      return {
        ok: false,
        code: 'no_match',
        message: 'Memo matched but payment failed verification',
        payment: memoHit,
      };
    }

    return {
      ok: false,
      code: 'no_match',
      message: 'No Horizon payment matched this link memo',
    };
  }

  checkRecord(
    target: PaymentMatchTarget,
    record: HorizonPaymentRecord,
    knownHashes: Set<string>,
  ): VerifyResult {
    if (!record.successful) {
      return {
        ok: false,
        code: 'tx_unsuccessful',
        message: 'Transaction was not successful on Stellar',
        payment: record,
      };
    }

    if (record.to !== target.destinationAddress) {
      return {
        ok: false,
        code: 'wrong_destination',
        message: `Destination ${record.to} does not match ${target.destinationAddress}`,
        payment: record,
      };
    }

    const expectedCode = target.currency.toUpperCase();
    const actualCode =
      record.assetType === 'native' ? 'XLM' : (record.assetCode ?? '');
    if (actualCode !== expectedCode) {
      return {
        ok: false,
        code: 'wrong_asset',
        message: `Expected asset ${expectedCode}, received ${actualCode || record.assetType}`,
        payment: record,
      };
    }

    const expectedIssuer = this.expectedIssuer(
      expectedCode,
      target.environment,
    );
    if (expectedIssuer === null) {
      if (record.assetIssuer !== null) {
        return {
          ok: false,
          code: 'wrong_issuer',
          message: 'Native XLM payment must not carry an issuer',
          payment: record,
        };
      }
    } else if (record.assetIssuer !== expectedIssuer) {
      return {
        ok: false,
        code: 'wrong_issuer',
        message: `Expected issuer ${expectedIssuer}, received ${record.assetIssuer ?? 'null'}`,
        payment: record,
      };
    }

    const cmp = compareDecimalStrings(record.amount, target.amount);
    if (cmp < 0) {
      return {
        ok: false,
        code: 'insufficient_amount',
        message: `Received ${record.amount}, expected ${target.amount}`,
        payment: record,
      };
    }
    if (cmp > 0) {
      return {
        ok: false,
        code: 'wrong_amount',
        message: `Received ${record.amount}, expected exact ${target.amount}`,
        payment: record,
      };
    }

    if (record.memo !== target.linkMemo) {
      return {
        ok: false,
        code: 'memo_mismatch',
        message: 'Memo does not match payment linkMemo',
        payment: record,
      };
    }

    if (knownHashes.has(record.transactionHash)) {
      return {
        ok: false,
        code: 'duplicate_hash',
        message: `Transaction ${record.transactionHash} already attributed`,
        payment: record,
      };
    }

    if (target.expiresAt && record.createdAt > target.expiresAt) {
      return {
        ok: false,
        code: 'expired',
        message: 'Payment arrived after expiresAt',
        payment: record,
      };
    }

    return { ok: true, payment: record };
  }

  expectedIssuer(
    currency: string,
    environment: HorizonEnvironment,
  ): string | null {
    if (currency === 'XLM') return null;
    const live = environment === 'live';
    if (currency === 'USDC') {
      return live
        ? (process.env.STELLAR_USDC_ISSUER_MAINNET ??
            'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
        : (process.env.STELLAR_USDC_ISSUER_TESTNET ??
            'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3MNLQUIL');
    }
    if (currency === 'EURC') {
      return live
        ? (process.env.STELLAR_EURC_ISSUER_MAINNET ?? null)
        : (process.env.STELLAR_EURC_ISSUER_TESTNET ?? null);
    }
    return null;
  }
}
