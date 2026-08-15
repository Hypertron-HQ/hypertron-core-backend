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
  /** Merchant-precreated note material (private settlement only). */
  shieldSalt?: unknown;
  shieldCommitment?: unknown;
  shieldProof?: unknown;
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

      const metadata = nullableString(input.metadata)?.slice(0, 2000) ?? null;
      const privateSettlement = isPrivateSettlementMetadata(metadata);
      const shield = normalizeShieldFields(input, privateSettlement);
      if (privateSettlement && !business.viewPub?.trim()) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'Private settlement requires a viewing public key. Set viewPub on the business profile first.',
        );
      }
      if (privateSettlement && !business.spendPub?.trim()) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'Private settlement requires a spend public key. Set spendPub on the business profile first.',
        );
      }
      const destinationAddress = this.resolveDestinationAddress(
        business,
        privateSettlement,
      );
      if (!destinationAddress) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          privateSettlement
            ? 'No payment destination configured. Set PAYMENT_POOL_ADDRESS in .env for private settlement.'
            : 'No merchant wallet for classic payments. Set a receive address (G…) in Settings, or use the Freighter wallet linked to this business.',
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
          metadata,
          paymentMethods: normalizePaymentMethods(input.paymentMethods),
          expiresAt: parseExpiryDays(input.expiryDays),
          linkMemo,
          destinationAddress,
          shieldSalt: shield.shieldSalt,
          shieldCommitment: shield.shieldCommitment,
          shieldProof: shield.shieldProof,
        },
      });
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
        mode: privateSettlement ? 'pool' : 'direct_receive',
        shieldSalt: link.shieldSalt,
        shieldCommitment: link.shieldCommitment,
        shieldProof: link.shieldProof,
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
          shieldSalt: true,
          shieldCommitment: true,
          shieldProof: true,
          paidAt: true,
          paymentTxHash: true,
          claimedAt: true,
          claimTxHash: true,
          claimOutCommitment: true,
          confirmedAt: true,
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
        include: {
          business: { select: { name: true, viewPub: true, spendPub: true } },
        },
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
        destinationAddress: link.destinationAddress,
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
        claimedAt: link.claimedAt,
        claimTxHash: link.claimTxHash,
        confirmedAt: link.confirmedAt,
        shieldCommitment: link.shieldCommitment,
        shieldProof: link.shieldProof,
        viewPub: link.business?.viewPub ?? null,
        spendPub: link.business?.spendPub ?? null,
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link get error');
    }
  }

  /**
   * Payer claims a link after submitting a private transfer.
   * Records the transfer txHash and out_cm1 (recipient note commitment).
   */
  async claim(
    id: string,
    input: { txHash?: unknown; outCommitment?: unknown },
  ) {
    try {
      const txHash = stringValue(input.txHash);
      const outCommitment = stringValue(input.outCommitment);

      if (!txHash) {
        throw this.error(HttpStatus.BAD_REQUEST, 'txHash required');
      }
      if (!outCommitment) {
        throw this.error(HttpStatus.BAD_REQUEST, 'outCommitment required');
      }

      const link = await this.prisma.paymentLink.findUnique({ where: { id } });
      if (!link) {
        throw this.error(HttpStatus.NOT_FOUND, 'Payment link not found');
      }
      if (link.paidAt || link.confirmedAt) {
        throw this.error(HttpStatus.CONFLICT, 'Link already paid');
      }
      if (link.claimedAt) {
        throw this.error(HttpStatus.CONFLICT, 'Link already claimed');
      }
      if (isLinkExpired(link.expiresAt)) {
        throw this.error(HttpStatus.GONE, 'Payment link has expired');
      }

      const updated = await this.prisma.paymentLink.update({
        where: { id },
        data: {
          claimedAt: new Date(),
          claimTxHash: txHash,
          claimOutCommitment: outCommitment.startsWith('0x')
            ? outCommitment
            : `0x${outCommitment}`,
        },
      });

      return {
        id: updated.id,
        claimedAt: updated.claimedAt,
        claimTxHash: updated.claimTxHash,
        claimOutCommitment: updated.claimOutCommitment,
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link claim error');
    }
  }

  /**
   * Merchant confirms after decrypting the received note.
   * Marks the link as fully paid/confirmed.
   */
  async confirm(request: Request, id: string) {
    try {
      this.access.requireSession(request);

      const link = await this.prisma.paymentLink.findUnique({
        where: { id },
        include: { business: { select: { id: true } } },
      });
      if (!link) {
        throw this.error(HttpStatus.NOT_FOUND, 'Payment link not found');
      }

      await this.access.requireOwnedBusiness(request, link.businessId);

      if (link.confirmedAt) {
        throw this.error(HttpStatus.CONFLICT, 'Link already confirmed');
      }
      if (!link.claimedAt && !link.paidAt) {
        throw this.error(HttpStatus.BAD_REQUEST, 'Link has not been claimed or paid yet');
      }

      const updated = await this.prisma.paymentLink.update({
        where: { id },
        data: {
          confirmedAt: new Date(),
          // Also set paidAt if not already set (for transfer claims).
          paidAt: link.paidAt ?? new Date(),
          paymentTxHash: link.paymentTxHash ?? link.claimTxHash,
        },
      });

      return {
        id: updated.id,
        confirmedAt: updated.confirmedAt,
        paidAt: updated.paidAt,
        paymentTxHash: updated.paymentTxHash,
      };
    } catch (error) {
      this.throwMappedError(error, 'Payment link confirm error');
    }
  }

  /**
   * Classic (privacy off): pay the merchant G-address directly
   *   receiveAddress → Freighter walletAddress → MERCHANT_RECIPIENT
   * Private (privacy on): pool contract for shield deposit attribution
   *   PAYMENT_POOL_ADDRESS → receiveAddress → walletAddress
   */
  private resolveDestinationAddress(
    business: {
      receiveAddress: string | null;
      walletAddress: string;
    },
    privateSettlement: boolean,
  ): string {
    if (privateSettlement) {
      return (
        this.paymentPoolAddress() ||
        stellarGAddress(business.receiveAddress) ||
        stellarGAddress(business.walletAddress) ||
        this.fallbackRecipient()
      );
    }

    return (
      stellarGAddress(business.receiveAddress) ||
      stellarGAddress(business.walletAddress) ||
      stellarGAddress(this.fallbackRecipient())
    );
  }

  private paymentPoolAddress(): string {
    return (
      process.env.PAYMENT_POOL_ADDRESS?.trim() ||
      process.env.NEXT_PUBLIC_PAYMENT_POOL_ADDRESS?.trim() ||
      ''
    );
  }

  private fallbackRecipient(): string {
    return process.env.MERCHANT_RECIPIENT?.trim() || '';
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

function isPrivateSettlementMetadata(metadata: string | null): boolean {
  if (!metadata?.trim()) return false;
  try {
    const parsed = JSON.parse(metadata) as { privateSettlement?: unknown };
    return parsed?.privateSettlement === true;
  } catch {
    return false;
  }
}

function normalizeShieldFields(
  input: PaymentLinkInput,
  privateSettlement: boolean,
): {
  shieldSalt: string | null;
  shieldCommitment: string | null;
  shieldProof: string | null;
} {
  const shieldSalt = nullableString(input.shieldSalt);
  const shieldCommitment = nullableString(input.shieldCommitment);
  const shieldProof = nullableString(input.shieldProof);

  if (!privateSettlement) {
    return { shieldSalt: null, shieldCommitment: null, shieldProof: null };
  }

  if (!shieldSalt || !shieldCommitment || !shieldProof) {
    throw new HttpException(
      {
        error:
          'Private settlement requires shieldSalt, shieldCommitment, and shieldProof (merchant-precreated note).',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  // Commitment is 32 bytes hex (64 hex chars, optional 0x).
  const commitmentHex = shieldCommitment.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(commitmentHex)) {
    throw new HttpException(
      { error: 'shieldCommitment must be 32-byte hex' },
      HttpStatus.BAD_REQUEST,
    );
  }

  return {
    shieldSalt,
    shieldCommitment: shieldCommitment.startsWith('0x')
      ? shieldCommitment
      : `0x${commitmentHex}`,
    shieldProof,
  };
}

/** Classic Stellar payments require a G… account (not a C… contract). */
function stellarGAddress(value: string | null | undefined): string {
  const address = value?.trim() ?? '';
  if (address.startsWith('G') && address.length === 56) return address;
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
