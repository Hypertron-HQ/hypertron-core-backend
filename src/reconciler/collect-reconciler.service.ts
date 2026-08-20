/**
 * Dashboard Collect: mark unpaid PaymentLink rows paid from Horizon matches.
 * Runs only in hypertron-core-backend (API no longer polls Collect links).
 */

import { Injectable, Logger } from '@nestjs/common';
import type { PaymentLink } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CircuitOpenError } from './circuit-breaker';
import {
  StellarHorizonService,
  type HorizonEnvironment,
} from './stellar-horizon.service';
import { StellarVerifier } from './stellar-verifier';

export type ReconcileOutcome =
  | 'link_paid'
  | 'skipped'
  | 'no_match'
  | 'expired'
  | 'horizon_unavailable';

@Injectable()
export class CollectReconcilerService {
  private readonly logger = new Logger(CollectReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly horizon: StellarHorizonService,
    private readonly verifier: StellarVerifier,
  ) {}

  async pollUnpaidPaymentLinks(): Promise<{
    processed: number;
    outcomes: Record<string, number>;
  }> {
    const now = new Date();
    const candidates = await this.prisma.paymentLink.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const openLinks = candidates
      .filter((link) => {
        if (link.paidAt || link.paymentTxHash) return false;
        if (!link.amount?.trim()) return false;
        if (!isClassicStellarAddress(link.destinationAddress)) return false;
        if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
          return false;
        }
        return true;
      })
      .slice(0, 200);

    const outcomes: Record<string, number> = {};
    let processed = 0;

    for (const link of openLinks) {
      processed += 1;
      const result = await this.reconcilePaymentLink(link);
      outcomes[result] = (outcomes[result] ?? 0) + 1;
    }

    if (processed > 0) {
      this.logger.log(
        { processed, outcomes },
        'Collect PaymentLink reconcile tick finished',
      );
    }

    return { processed, outcomes };
  }

  async reconcilePaymentLink(link: PaymentLink): Promise<ReconcileOutcome> {
    if (link.paidAt || link.paymentTxHash) return 'skipped';
    if (!link.amount) return 'skipped';
    if (!isClassicStellarAddress(link.destinationAddress)) return 'skipped';

    const environment = resolveEnvironment();
    const lookback = Number(process.env.STELLAR_RECONCILER_LOOKBACK ?? '50');

    let records;
    try {
      records = await this.horizon.listPaymentsForAccount(
        link.destinationAddress,
        environment,
        lookback,
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        this.logger.warn(
          { environment, linkId: link.id },
          'Horizon circuit open — skipping link reconcile',
        );
        return 'horizon_unavailable';
      }
      this.logger.error(
        {
          linkId: link.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'Horizon query failed for PaymentLink',
      );
      return 'horizon_unavailable';
    }

    return this.finalizeMatch(link, records, environment);
  }

  /**
   * Payer-reported tx: verify that specific hash against the link and mark paid.
   * More reliable than account lookback right after submit.
   */
  async reconcilePaymentLinkWithTxHash(
    link: PaymentLink,
    txHash: string,
  ): Promise<ReconcileOutcome> {
    if (link.paidAt || link.paymentTxHash) return 'skipped';
    if (!link.amount) return 'skipped';
    if (!isClassicStellarAddress(link.destinationAddress)) return 'skipped';

    const environment = resolveEnvironment();
    let records;
    try {
      records = await this.horizon.listPaymentsForTransaction(
        txHash.trim(),
        environment,
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        this.logger.warn(
          { environment, linkId: link.id },
          'Horizon circuit open — skipping tx report reconcile',
        );
        return 'horizon_unavailable';
      }
      this.logger.error(
        {
          linkId: link.id,
          txHash,
          err: err instanceof Error ? err.message : String(err),
        },
        'Horizon tx lookup failed for PaymentLink',
      );
      return 'horizon_unavailable';
    }

    return this.finalizeMatch(link, records, environment);
  }

  private async finalizeMatch(
    link: PaymentLink,
    records: Awaited<
      ReturnType<StellarHorizonService['listPaymentsForAccount']>
    >,
    environment: HorizonEnvironment,
  ): Promise<ReconcileOutcome> {
    const knownHashes = await this.loadForeignHashes(
      records.map((r) => r.transactionHash),
      link.id,
    );

    const result = this.verifier.verify(
      {
        linkMemo: link.linkMemo,
        destinationAddress: link.destinationAddress,
        amount: link.amount!,
        currency: link.currency,
        environment,
        expiresAt: link.expiresAt,
      },
      records,
      knownHashes,
    );

    if (!result.ok) {
      if (result.code === 'duplicate_hash') {
        this.logger.error(
          { linkId: link.id, tx: result.payment?.transactionHash },
          'CRITICAL: duplicate tx hash on PaymentLink — skipping',
        );
        return 'skipped';
      }
      if (result.code === 'expired') return 'expired';
      return 'no_match';
    }

    const fresh = await this.prisma.paymentLink.findUnique({
      where: { id: link.id },
    });
    if (!fresh || fresh.paidAt || fresh.paymentTxHash) return 'skipped';

    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: {
        paymentTxHash: result.payment.transactionHash,
        paidAt: new Date(),
      },
    });

    this.logger.log(
      {
        linkId: link.id,
        memo: link.linkMemo,
        tx: result.payment.transactionHash,
      },
      'PaymentLink marked paid from Horizon match',
    );
    return 'link_paid';
  }

  private async loadForeignHashes(
    hashes: string[],
    excludeLinkId: string,
  ): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const unique = [...new Set(hashes)];
    const linkRows = await this.prisma.paymentLink.findMany({
      where: {
        paymentTxHash: { in: unique },
        NOT: { id: excludeLinkId },
      },
      select: { paymentTxHash: true },
    });
    const out = new Set<string>();
    for (const r of linkRows) {
      if (r.paymentTxHash) out.add(r.paymentTxHash);
    }
    return out;
  }
}

function resolveEnvironment(): HorizonEnvironment {
  const raw = (
    process.env.STELLAR_NETWORK ||
    process.env.NEXT_PUBLIC_STELLAR_NETWORK ||
    ''
  )
    .trim()
    .toLowerCase();
  if (raw === 'public' || raw === 'mainnet' || raw === 'live') return 'live';
  if (raw === 'testnet' || raw === 'test') return 'test';
  return process.env.NODE_ENV === 'production' ? 'live' : 'test';
}

function isClassicStellarAddress(address: string): boolean {
  return address.startsWith('G') && address.length === 56;
}
