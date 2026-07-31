import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { BusinessAccessService } from '../business/business-access.service';
import { PrismaService } from '../prisma/prisma.service';

const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';
const DEFAULT_PAYMENT_METHODS = ['wallet', 'qr'];
const PAYMENT_METHODS = new Set(['wallet', 'qr', 'onramp']);

type PaymentLinkInput = {
  amount?: unknown;
  businessId?: unknown;
  clientName?: unknown;
  currency?: unknown;
  expiryDays?: unknown;
  flexibleAmount?: unknown;
  metadata?: unknown;
  paymentMethods?: unknown;
  purpose?: unknown;
  workflowStage?: unknown;
};

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async create(request: Request, input: PaymentLinkInput) {
    try {
      const businessId = stringValue(input.businessId);
      if (!businessId) {
        throw this.error(HttpStatus.BAD_REQUEST, 'businessId required');
      }
      const { business } = await this.access.requireOwnedBusiness(
        request,
        businessId,
      );
      const flexibleAmount =
        input.flexibleAmount === true || input.flexibleAmount === 'true';
      const amount = flexibleAmount ? '' : stringValue(input.amount);
      if (!flexibleAmount && !amount) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'amount required (or set flexibleAmount: true for pay-any-amount link)',
        );
      }

      const destinationAddress = this.resolveDestinationAddress(business);
      if (!destinationAddress) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'No payment destination configured. Create a vault in Settings -> Treasury, or set PAYMENT_POOL_ADDRESS in .env.',
        );
      }

      const linkMemo = await this.createUniqueMemo();
      const link = await this.prisma.paymentLink.create({
        data: {
          businessId,
          amount,
          currency: normalizeCurrency(input.currency),
          purpose: nullableString(input.purpose),
          clientName: nullableString(input.clientName),
          workflowStage: nullableString(input.workflowStage),
          metadata: nullableString(input.metadata)?.slice(0, 2000) ?? null,
          paymentMethods: normalizePaymentMethods(input.paymentMethods),
          expiresAt: parseExpiryDays(input.expiryDays),
          linkMemo,
          destinationAddress,
        },
      });
      const directVault = business.vaultAddress === destinationAddress;
      const url = `${this.paymentLinkBaseUrl(request)}/pay/${link.id}`;

      return {
        linkId: link.id,
        url,
        qrPayload: url,
        memo: link.linkMemo,
        amount: link.amount,
        currency: link.currency,
        expiresAt: link.expiresAt,
        paymentMethods: link.paymentMethods,
        destinationAddress: link.destinationAddress,
        mode: directVault ? 'direct_vault' : 'pool',
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link create error');
    }
  }

  async findAll(request: Request, businessId: string | undefined) {
    try {
      const id = businessId?.trim() ?? '';
      if (!id) {
        throw this.error(HttpStatus.BAD_REQUEST, 'businessId query required');
      }
      await this.access.requireOwnedBusiness(request, id);
      const links = await this.prisma.paymentLink.findMany({
        where: { businessId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          purpose: true,
          clientName: true,
          workflowStage: true,
          metadata: true,
          paymentMethods: true,
          expiresAt: true,
          linkMemo: true,
          paidAt: true,
          paymentTxHash: true,
          commitmentTxHash: true,
          createdAt: true,
        },
      });
      const baseUrl = this.paymentLinkBaseUrl(request);

      return {
        links: links.map((link) => ({
          ...link,
          url: `${baseUrl}/pay/${link.id}`,
        })),
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link list error');
    }
  }

  async findPublic(id: string) {
    try {
      const link = await this.prisma.paymentLink.findUnique({
        where: { id },
        include: { business: { select: { name: true } } },
      });
      if (!link) {
        throw this.error(HttpStatus.NOT_FOUND, 'Payment link not found');
      }
      if (isLinkExpired(link.expiresAt)) {
        throw new HttpException(
          { error: 'This payment link has expired', expired: true },
          HttpStatus.GONE,
        );
      }

      return {
        id: link.id,
        amount: link.amount,
        currency: normalizeCurrency(link.currency),
        memo: link.linkMemo,
        destinationAddress: this.expectedDestinationAddress(
          link.destinationAddress,
        ),
        purpose: link.purpose,
        businessName: link.business?.name?.trim() || null,
        clientName: link.clientName,
        workflowStage: link.workflowStage,
        metadata: link.metadata,
        paymentMethods: link.paymentMethods.length
          ? link.paymentMethods
          : DEFAULT_PAYMENT_METHODS,
        expiresAt: link.expiresAt,
        paidAt: link.paidAt,
        paymentTxHash: link.paymentTxHash,
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link get error');
    }
  }

  private resolveDestinationAddress(business: {
    receiveAddress: string | null;
    vaultAddress: string | null;
    vaultType: string | null;
  }): string {
    if (business.vaultAddress && business.vaultType)
      return business.vaultAddress;
    return (
      this.paymentPoolAddress() ||
      business.receiveAddress ||
      this.fallbackRecipient()
    );
  }

  private expectedDestinationAddress(linkDestination: string): string {
    return (
      process.env.RELAYER_PUBLIC_KEY?.trim() ||
      process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY?.trim() ||
      this.paymentPoolAddress() ||
      linkDestination
    );
  }

  private paymentPoolAddress(): string {
    return (
      process.env.PAYMENT_POOL_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
      ''
    );
  }

  private fallbackRecipient(): string {
    return (
      process.env.MERCHANT_RECIPIENT?.trim() ||
      process.env.NEXT_PUBLIC_MERCHANT_RECIPIENT?.trim() ||
      ''
    );
  }

  private paymentLinkBaseUrl(request: Request): string {
    const configured =
      process.env.FRONTEND_URL?.trim() || process.env.APP_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');

    return `${request.protocol}://${request.get('host') ?? 'localhost:4000'}`;
  }

  private async createUniqueMemo(): Promise<string> {
    let memo = this.generateMemo();
    while (
      await this.prisma.paymentLink.findUnique({ where: { linkMemo: memo } })
    ) {
      memo = this.generateMemo();
    }
    return memo;
  }

  private generateMemo(): string {
    return `hpl_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
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

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized || null;
}

function normalizeCurrency(value: unknown): 'USDC' | 'EURC' | 'XLM' {
  const currency = stringValue(value).toUpperCase();
  return currency === 'XLM' || currency === 'EURC' ? currency : 'USDC';
}

function normalizePaymentMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PAYMENT_METHODS];
  const methods = new Set(
    value
      .filter((method): method is string => typeof method === 'string')
      .map((method) => method.trim().toLowerCase())
      .filter((method) => PAYMENT_METHODS.has(method)),
  );
  return methods.size ? [...methods] : [...DEFAULT_PAYMENT_METHODS];
}

function parseExpiryDays(value: unknown): Date | null {
  if (
    value === 'never' ||
    value === null ||
    value === undefined ||
    value === ''
  )
    return null;
  const days =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(days) || days <= 0) return null;
  const expiry = new Date();
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry;
}

function isLinkExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() < Date.now();
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
