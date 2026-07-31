import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessAccessService } from '../business/business-access.service';
import { PrismaService } from '../prisma/prisma.service';

const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

@Injectable()
export class BalanceService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async getBalance(request: Request, businessId: string | undefined) {
    try {
      const id = businessId?.trim() ?? '';
      if (!id) {
        throw this.error(HttpStatus.BAD_REQUEST, 'businessId query required');
      }
      await this.access.requireOwnedBusiness(request, id);

      const [withdrawals, sends, links] = await Promise.all([
        this.prisma.withdrawal.findMany({
          where: { businessId: id, status: 'completed' },
          select: { nullifiers: true },
        }),
        this.prisma.outgoingPayment.findMany({
          where: { businessId: id, status: 'completed' },
          select: { nullifiers: true },
        }),
        this.prisma.paymentLink.findMany({
          where: {
            businessId: id,
            paidAt: { not: null },
            nullifier: { not: null },
            commitmentTxHash: { not: null },
          },
          select: { amount: true, currency: true, nullifier: true },
        }),
      ]);
      const usedNullifiers = new Set([
        ...withdrawals.flatMap((withdrawal) => withdrawal.nullifiers),
        ...sends.flatMap((payment) => payment.nullifiers),
      ]);
      let usdc = 0;
      let xlm = 0;
      let unspentCount = 0;

      for (const link of links) {
        if (!link.nullifier || usedNullifiers.has(link.nullifier)) continue;
        const amount = Number.parseFloat(link.amount ?? '');
        if (!Number.isFinite(amount) || amount <= 0) continue;
        unspentCount += 1;
        if (normalizeCurrency(link.currency) === 'XLM') xlm += amount;
        else usdc += amount;
      }

      return {
        businessId: id,
        virtualBalanceUsdc: usdc.toFixed(4),
        virtualBalanceXlm: xlm.toFixed(4),
        unspentCount,
      };
    } catch (error) {
      this.throwMappedError(error, 'Balance API error');
    }
  }

  private throwMappedError(error: unknown, context: string): never {
    if (error instanceof HttpException) throw error;
    if (isPrismaConnectionError(error)) {
      throw this.error(
        HttpStatus.SERVICE_UNAVAILABLE,
        DATABASE_UNAVAILABLE_MESSAGE,
      );
    }
    console.error(`${context}:`, error);
    throw this.error(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
  }

  private error(status: HttpStatus, message: string): HttpException {
    return new HttpException({ error: message }, status);
  }
}

function normalizeCurrency(value: string): 'USDC' | 'EURC' | 'XLM' {
  const currency = value.trim().toUpperCase();
  return currency === 'XLM' || currency === 'EURC' ? currency : 'USDC';
}

function isPrismaConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as {
    cause?: unknown;
    code?: string;
    message?: string;
    name?: string;
  };
  if (prismaError.name === 'PrismaClientInitializationError') return true;
  if (prismaError.code === 'P1001' || prismaError.code === 'P1017') return true;
  const message =
    typeof prismaError.message === 'string'
      ? prismaError.message
      : typeof prismaError.cause === 'string'
        ? prismaError.cause
        : '';
  return [
    'Error creating a database connection',
    'No route to host',
    'DNS resolution',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ].some((fragment) => message.includes(fragment));
}
