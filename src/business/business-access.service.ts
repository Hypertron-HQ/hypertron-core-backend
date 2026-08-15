import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Business } from '@prisma/client';
import type { Request } from 'express';
import { AuthService, type AppSession } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsApiSyncService } from './payments-api-sync.service';

const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

export type ResolvedBusiness = {
  business: Business;
  session: AppSession;
};

@Injectable()
export class BusinessAccessService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly paymentsApiSync: PaymentsApiSyncService,
  ) {}

  requireSession(request: Request): AppSession {
    return this.auth.getAppSession(request);
  }

  async getBusinessForRequest(
    request: Request,
    createIfMissing = true,
  ): Promise<ResolvedBusiness> {
    try {
      const session = this.auth.getAppSession(request);
      const business = await this.getBusinessForWallet(
        session.walletAddress,
        createIfMissing,
      );
      return { business, session };
    } catch (error) {
      this.throwMappedError(error, 'Business session lookup error');
    }
  }

  async requireOwnedBusiness(
    request: Request,
    businessId: string,
  ): Promise<ResolvedBusiness> {
    try {
      const id = businessId.trim();
      if (!id) {
        throw this.error(HttpStatus.BAD_REQUEST, 'businessId required');
      }
      const session = this.auth.getAppSession(request);
      const business = await this.prisma.business.findFirst({
        where: { id, walletAddress: session.walletAddress },
      });
      if (!business) {
        throw this.error(HttpStatus.FORBIDDEN, 'Forbidden');
      }

      return { business, session };
    } catch (error) {
      this.throwMappedError(error, 'Business ownership lookup error');
    }
  }

  async requireWalletBusiness(
    request: Request,
    createIfMissing = true,
  ): Promise<ResolvedBusiness> {
    return this.getBusinessForRequest(request, createIfMissing);
  }

  private async getBusinessForWallet(
    walletAddress: string,
    createIfMissing: boolean,
  ): Promise<Business> {
    const business = await this.prisma.business.findUnique({
      where: { walletAddress },
    });
    if (business) {
      // Keep API MerchantSettings warm for developer session + destination resolve
      this.paymentsApiSync.pushMerchantSettings({
        businessId: business.id,
        walletAddress: business.walletAddress,
        receiveAddress: business.receiveAddress,
      });
      return business;
    }
    if (!createIfMissing) {
      throw this.error(HttpStatus.NOT_FOUND, 'Business not found');
    }

    const created = await this.prisma.business.create({
      data: { walletAddress },
    });
    this.paymentsApiSync.pushMerchantSettings({
      businessId: created.id,
      walletAddress: created.walletAddress,
      receiveAddress: created.receiveAddress,
    });
    return created;
  }

  private throwMappedError(error: unknown, context: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
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

function isPrismaConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const prismaError = error as {
    cause?: unknown;
    code?: string;
    message?: string;
    name?: string;
  };
  if (prismaError.name === 'PrismaClientInitializationError') {
    return true;
  }
  if (prismaError.code === 'P1001' || prismaError.code === 'P1017') {
    return true;
  }

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
