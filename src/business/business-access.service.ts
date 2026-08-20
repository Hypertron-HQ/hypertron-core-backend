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
      let membership = await this.prisma.businessMember.findUnique({
        where: {
          walletAddress_businessId: {
            walletAddress: session.walletAddress,
            businessId: id,
          },
        },
        include: { business: true },
      });
      if (!membership) {
        const legacy = await this.prisma.business.findFirst({
          where: { id, walletAddress: session.walletAddress },
        });
        if (legacy) {
          membership = await this.prisma.businessMember.upsert({
            where: {
              walletAddress_businessId: {
                walletAddress: session.walletAddress,
                businessId: legacy.id,
              },
            },
            create: {
              businessId: legacy.id,
              walletAddress: session.walletAddress,
              role: 'owner',
            },
            update: {},
            include: { business: true },
          });
          await this.setActiveBusiness(session.walletAddress, legacy.id);
        }
      }
      if (!membership) {
        throw this.error(HttpStatus.FORBIDDEN, 'Forbidden');
      }

      return { business: membership.business, session };
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
    const preference = await this.prisma.walletPreference.findUnique({
      where: { walletAddress },
    });
    if (preference?.activeBusinessId) {
      const active = await this.prisma.businessMember.findUnique({
        where: {
          walletAddress_businessId: {
            walletAddress,
            businessId: preference.activeBusinessId,
          },
        },
        include: { business: true },
      });
      if (active) {
        this.syncMerchant(active.business);
        return active.business;
      }
    }

    const recent = await this.prisma.businessMember.findFirst({
      where: { walletAddress },
      orderBy: { lastAccessedAt: 'desc' },
      include: { business: true },
    });
    if (recent) {
      await this.setActiveBusiness(walletAddress, recent.businessId);
      this.syncMerchant(recent.business);
      return recent.business;
    }

    // Lazy migration for records created before BusinessMember existed.
    const legacy = await this.prisma.business.findFirst({
      where: { walletAddress },
      orderBy: { createdAt: 'asc' },
    });
    if (legacy) {
      await this.prisma.businessMember.upsert({
        where: {
          walletAddress_businessId: {
            walletAddress,
            businessId: legacy.id,
          },
        },
        create: {
          businessId: legacy.id,
          walletAddress,
          role: 'owner',
        },
        update: {},
      });
      await this.setActiveBusiness(walletAddress, legacy.id);
      this.syncMerchant(legacy);
      return legacy;
    }

    if (!createIfMissing) {
      throw this.error(HttpStatus.NOT_FOUND, 'Business not found');
    }

    const created = await this.prisma.business.create({
      data: {
        walletAddress,
        members: {
          create: {
            walletAddress,
            role: 'owner',
          },
        },
      },
    });
    await this.setActiveBusiness(walletAddress, created.id);
    this.syncMerchant(created);
    return created;
  }

  private async setActiveBusiness(
    walletAddress: string,
    activeBusinessId: string,
  ) {
    await this.prisma.walletPreference.upsert({
      where: { walletAddress },
      create: { walletAddress, activeBusinessId },
      update: { activeBusinessId },
    });
  }

  private syncMerchant(business: Business) {
    // Keep API MerchantSettings warm for developer session + destination resolve.
    this.paymentsApiSync.pushMerchantSettings({
      businessId: business.id,
      walletAddress: business.walletAddress,
      receiveAddress: business.receiveAddress,
    });
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
