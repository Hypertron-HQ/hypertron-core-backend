import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { isValidStellarAddress } from '../auth/auth-session.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessAccessService } from './business-access.service';

const ALLOWED_TIER_IDS = new Set(['tier-1', 'tier-2', 'tier-3']);
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

type ProfileUpdateInput = {
  activeTemplateId?: unknown;
  businessNature?: unknown;
  complianceForm?: unknown;
  email?: unknown;
  name?: unknown;
  selectedTier?: unknown;
  selectedTierName?: unknown;
  selectedWidgets?: unknown;
};

@Injectable()
export class BusinessService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async getProfile(request: Request) {
    try {
      const { business } = await this.access.getBusinessForRequest(request);
      return this.profileJson(
        business,
        await this.resolveActiveTemplate(business),
      );
    } catch (error) {
      this.throwMappedError(error, 'Business profile GET error');
    }
  }

  async updateProfile(request: Request, input: ProfileUpdateInput) {
    try {
      let { business } = await this.access.getBusinessForRequest(request);
      const update = await this.createProfileUpdate(business, input);
      if (Object.keys(update).length > 0) {
        business = await this.prisma.business.update({
          where: { id: business.id },
          data: update,
        });
      }

      return this.profileJson(
        business,
        await this.resolveActiveTemplate(business),
      );
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
      return {
        businessId: business.id,
        receiveAddress: business.receiveAddress,
      };
    } catch (error) {
      this.throwMappedError(error, 'Business link PATCH error');
    }
  }

  private async createProfileUpdate(
    business: { activeTemplateId: string | null; id: string },
    input: ProfileUpdateInput,
  ): Promise<Prisma.BusinessUpdateInput> {
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
      update.complianceForm = input.complianceForm;
    }
    if (selectedTier !== undefined) {
      update.selectedTier = selectedTier;
      update.selectedTierAt = selectedTier ? new Date() : null;
    }
    if (selectedTierName !== undefined)
      update.selectedTierName = selectedTierName;

    const activeTemplateId = nullableString(input.activeTemplateId);
    if (activeTemplateId !== undefined) {
      if (!activeTemplateId) {
        update.activeTemplateId = null;
        update.activeTemplateAt = null;
      } else {
        const template = await this.prisma.businessTemplate.findFirst({
          where: { id: activeTemplateId, businessId: business.id },
          select: { id: true },
        });
        if (!template) {
          throw this.error(
            HttpStatus.BAD_REQUEST,
            'activeTemplateId not found for this business',
          );
        }
        update.activeTemplateId = template.id;
        update.activeTemplateAt = new Date();
      }
    }

    if (selectedTier !== undefined && business.activeTemplateId) {
      const activeTemplate = await this.prisma.businessTemplate.findFirst({
        where: { id: business.activeTemplateId, businessId: business.id },
        select: { bundleId: true },
      });
      const activeTemplateTier = activeTemplate
        ? normalizeTierId(activeTemplate.bundleId)
        : undefined;
      if (
        activeTemplateTier !== undefined &&
        activeTemplateTier !== selectedTier
      ) {
        update.activeTemplateId = null;
        update.activeTemplateAt = null;
      }
    }

    return update;
  }

  private async resolveActiveTemplate(business: {
    activeTemplateId: string | null;
    id: string;
  }) {
    if (!business.activeTemplateId) {
      return { activeTemplateId: null, activeTemplate: null };
    }

    const template = await this.prisma.businessTemplate.findFirst({
      where: { id: business.activeTemplateId, businessId: business.id },
      select: {
        id: true,
        name: true,
        bundleId: true,
        bundleName: true,
        businessName: true,
      },
    });
    if (!template) {
      await this.prisma.business
        .update({
          where: { id: business.id },
          data: { activeTemplateId: null, activeTemplateAt: null },
        })
        .catch(() => undefined);
      return { activeTemplateId: null, activeTemplate: null };
    }

    return {
      activeTemplateId: template.id,
      activeTemplate: {
        id: template.id,
        name: template.name,
        bundleId: template.bundleId,
        bundleName: template.bundleName,
        businessName: template.businessName,
      },
    };
  }

  private profileJson(
    business: {
      activeTemplateAt: Date | null;
      businessNature: string | null;
      complianceForm: Prisma.JsonValue | null;
      email: string | null;
      id: string;
      name: string | null;
      receiveAddress: string | null;
      selectedTier: string | null;
      selectedTierAt: Date | null;
      selectedTierName: string | null;
      selectedWidgets: string[];
    },
    active: Awaited<ReturnType<BusinessService['resolveActiveTemplate']>>,
  ) {
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
      complianceForm: business.complianceForm,
      activeTemplateId: active.activeTemplateId,
      activeTemplateAt: business.activeTemplateAt?.toISOString() ?? null,
      activeTemplate: active.activeTemplate,
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
