import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { isValidStellarAddress } from '../auth/auth-session.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessAccessService } from './business-access.service';
import { PaymentsApiSyncService } from './payments-api-sync.service';

const ALLOWED_TIER_IDS = new Set(['tier-1', 'tier-2', 'tier-3']);
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

type ProfileUpdateInput = {
  businessNature?: unknown;
  complianceForm?: unknown;
  email?: unknown;
  name?: unknown;
  selectedTier?: unknown;
  selectedTierName?: unknown;
  selectedWidgets?: unknown;
  /** Public viewing key only — viewSecret never sent to the server. */
  viewPub?: unknown;
  /** Public spend key (owner_pk) only — spendSecret never sent to the server. */
  spendPub?: unknown;
};

@Injectable()
export class BusinessService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
    private readonly paymentsApiSync: PaymentsApiSyncService,
  ) {}

  async getProfile(request: Request) {
    try {
      const { business } = await this.access.getBusinessForRequest(request);
      return this.profileJson(business);
    } catch (error) {
      this.throwMappedError(error, 'Business profile GET error');
    }
  }

  async updateProfile(request: Request, input: ProfileUpdateInput) {
    try {
      let { business } = await this.access.getBusinessForRequest(request);
      const update = this.createProfileUpdate(input);
      if (Object.keys(update).length > 0) {
        business = await this.prisma.business.update({
          where: { id: business.id },
          data: update,
        });
      }

      return this.profileJson(business);
    } catch (error) {
      this.throwMappedError(error, 'Business profile PATCH error');
    }
  }

  async linkBusiness(request: Request, receiveAddress: unknown) {
    try {
      const resolved = await this.access.requireWalletBusiness(request);
      const address = this.optionalStellarAddress(receiveAddress);
      if (address === false) {
        throw this.invalidReceiveAddress();
      }

      const business =
        address && address !== resolved.business.receiveAddress
          ? await this.prisma.business.update({
              where: { id: resolved.business.id },
              data: { receiveAddress: address },
            })
          : resolved.business;

      this.paymentsApiSync.pushMerchantSettings({
        businessId: business.id,
        walletAddress: business.walletAddress,
        receiveAddress: business.receiveAddress,
      });

      return {
        businessId: business.id,
        receiveAddress: business.receiveAddress ?? null,
      };
    } catch (error) {
      this.throwMappedError(error, 'Business link POST error');
    }
  }

  async updateReceiveAddress(request: Request, receiveAddress: unknown) {
    try {
      const resolved = await this.access.requireWalletBusiness(request, false);
      const address = this.optionalStellarAddress(receiveAddress);
      if (!address) {
        throw this.invalidReceiveAddress();
      }

      const business = await this.prisma.business.update({
        where: { id: resolved.business.id },
        data: { receiveAddress: address },
      });
      this.paymentsApiSync.pushMerchantSettings({
        businessId: business.id,
        walletAddress: business.walletAddress,
        receiveAddress: business.receiveAddress,
      });
      return {
        businessId: business.id,
        receiveAddress: business.receiveAddress,
      };
    } catch (error) {
      this.throwMappedError(error, 'Business link PATCH error');
    }
  }

  private createProfileUpdate(
    input: ProfileUpdateInput,
  ): Prisma.BusinessUpdateInput {
    const update: Prisma.BusinessUpdateInput = {};
    const name = nullableString(input.name);
    const email = nullableString(input.email);
    const businessNature = nullableString(input.businessNature);
    const selectedTier = normalizeTierId(input.selectedTier);
    const selectedTierName = nullableString(input.selectedTierName);

    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (businessNature !== undefined) update.businessNature = businessNature;
    if (Array.isArray(input.selectedWidgets)) {
      update.selectedWidgets = input.selectedWidgets.filter(
        (widget): widget is string => typeof widget === 'string',
      );
    }
    if (input.complianceForm !== undefined) {
      update.complianceForm = input.complianceForm as Prisma.InputJsonValue;
    }
    if (selectedTier !== undefined) {
      update.selectedTier = selectedTier;
      update.selectedTierAt = selectedTier ? new Date() : null;
    }
    if (selectedTierName !== undefined)
      update.selectedTierName = selectedTierName;

    if (input.viewPub !== undefined) {
      const viewPub = nullableString(input.viewPub);
      if (viewPub === undefined) {
        /* ignore non-string */
      } else if (viewPub !== null && !isPlausibleHexPub(viewPub)) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'viewPub must be a non-empty hex public viewing key',
        );
      } else {
        update.viewPub = viewPub;
      }
    }

    if (input.spendPub !== undefined) {
      const spendPub = nullableString(input.spendPub);
      if (spendPub === undefined) {
        /* ignore non-string */
      } else if (spendPub !== null && !isPlausibleHexPub(spendPub)) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'spendPub must be a non-empty hex public spend key (owner_pk)',
        );
      } else {
        update.spendPub = spendPub;
      }
    }

    return update;
  }

  private profileJson(business: {
    businessNature: string | null;
    complianceForm: Prisma.JsonValue | null;
    email: string | null;
    id: string;
    name: string | null;
    receiveAddress: string | null;
    viewPub: string | null;
    spendPub: string | null;
    selectedTier: string | null;
    selectedTierAt: Date | null;
    selectedTierName: string | null;
    selectedWidgets: string[];
  }) {
    return {
      businessId: business.id,
      name: business.name ?? '',
      email: business.email ?? '',
      businessNature: business.businessNature ?? '',
      selectedWidgets: business.selectedWidgets,
      selectedTier: business.selectedTier,
      selectedTierName: business.selectedTierName,
      selectedTierAt: business.selectedTierAt?.toISOString() ?? null,
      receiveAddress: business.receiveAddress,
      viewPub: business.viewPub ?? null,
      spendPub: business.spendPub ?? null,
      complianceForm: business.complianceForm,
    };
  }

  private optionalStellarAddress(value: unknown): string | false | null {
    const address = typeof value === 'string' ? value.trim() : '';
    if (!address) return null;
    return isValidStellarAddress(address) ? address : false;
  }

  private invalidReceiveAddress(): HttpException {
    return this.error(
      HttpStatus.BAD_REQUEST,
      'receiveAddress must be a valid Stellar address (starts with G, 56 characters)',
    );
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

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() || null : undefined;
}

/** Hex pubkey (with or without 0x); exact curve length validated client-side. */
function isPlausibleHexPub(value: string): boolean {
  const hex = value.replace(/^0x/i, '');
  return /^[0-9a-fA-F]{32,256}$/.test(hex);
}

function normalizeTierId(value: unknown): string | null | undefined {
  const tier = nullableString(value);
  if (tier === undefined || tier === null) return tier;
  return ALLOWED_TIER_IDS.has(tier.toLowerCase())
    ? tier.toLowerCase()
    : undefined;
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
