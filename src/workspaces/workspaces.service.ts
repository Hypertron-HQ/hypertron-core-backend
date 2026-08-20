import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { BusinessAccessService } from '../business/business-access.service';
import { PaymentsApiSyncService } from '../business/payments-api-sync.service';
import { PrismaService } from '../prisma/prisma.service';

const WORKSPACE_TYPES = new Set([
  'web3-startup',
  'dao',
  'agency',
  'foundation',
  'infrastructure',
  'service-company',
  'enterprise',
  'other',
]);
const TEAM_SIZES = new Set(['1-5', '5-20', '20-50', '50+']);
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';
const MAX_LOGO_DATA_URL_LENGTH = 600_000;

type WorkspaceCreateInput = Record<string, unknown>;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
    private readonly paymentsApiSync: PaymentsApiSyncService,
  ) {}

  async list(request: Request) {
    try {
      const session = this.access.requireSession(request);
      await this.ensureLegacyMemberships(session.walletAddress);
      const preference = await this.prisma.walletPreference.findUnique({
        where: { walletAddress: session.walletAddress },
      });
      const memberships = await this.prisma.businessMember.findMany({
        where: { walletAddress: session.walletAddress },
        orderBy: { lastAccessedAt: 'desc' },
        include: {
          business: {
            include: { _count: { select: { members: true } } },
          },
        },
      });

      return {
        activeWorkspaceId: preference?.activeBusinessId ?? null,
        workspaces: memberships.map((membership) =>
          this.workspaceJson(
            membership.business,
            membership.role,
            membership.lastAccessedAt,
          ),
        ),
      };
    } catch (error) {
      this.throwMappedError(error, 'Workspace list error');
    }
  }

  async get(request: Request, workspaceId: string) {
    try {
      const membership = await this.requireMembership(request, workspaceId);
      return {
        workspace: this.workspaceJson(
          membership.business,
          membership.role,
          membership.lastAccessedAt,
        ),
      };
    } catch (error) {
      this.throwMappedError(error, 'Workspace GET error');
    }
  }

  async create(request: Request, rawInput: WorkspaceCreateInput) {
    try {
      const session = this.access.requireSession(request);
      const input = this.parseCreateInput(rawInput);

      // First-time wallets get an empty stub business from profile GET.
      // Reuse that stub when it has no name so onboarding stays one form.
      const stubMembership = await this.prisma.businessMember.findFirst({
        where: {
          walletAddress: session.walletAddress,
          OR: [
            { business: { name: null } },
            { business: { name: '' } },
          ],
        },
        include: { business: true },
        orderBy: { createdAt: 'asc' },
      });

      const business = stubMembership
        ? await this.prisma.business.update({
            where: { id: stubMembership.businessId },
            data: {
              name: input.name,
              businessNature: input.workspaceType,
              workspaceType: input.workspaceType,
              website: input.website,
              teamSize: input.teamSize,
              logoDataUrl: input.logoDataUrl,
              logoName: input.logoName,
              invitedMembers: input.invitedMembers,
              selectedTier: 'tier-1',
              selectedTierName: 'Starter',
              selectedTierAt: new Date(),
            },
            include: { _count: { select: { members: true } } },
          })
        : await this.prisma.business.create({
            data: {
              walletAddress: session.walletAddress,
              name: input.name,
              businessNature: input.workspaceType,
              workspaceType: input.workspaceType,
              website: input.website,
              teamSize: input.teamSize,
              logoDataUrl: input.logoDataUrl,
              logoName: input.logoName,
              invitedMembers: input.invitedMembers,
              selectedTier: 'tier-1',
              selectedTierName: 'Starter',
              selectedTierAt: new Date(),
              members: {
                create: {
                  walletAddress: session.walletAddress,
                  role: 'owner',
                },
              },
            },
            include: { _count: { select: { members: true } } },
          });

      await this.prisma.walletPreference.upsert({
        where: { walletAddress: session.walletAddress },
        create: {
          walletAddress: session.walletAddress,
          activeBusinessId: business.id,
        },
        update: { activeBusinessId: business.id },
      });
      this.syncMerchant(business);

      return {
        activeWorkspaceId: business.id,
        workspace: this.workspaceJson(business, 'owner', business.createdAt),
      };
    } catch (error) {
      this.throwMappedError(error, 'Workspace create error');
    }
  }

  async activate(request: Request, workspaceId: string) {
    try {
      const membership = await this.requireMembership(request, workspaceId);
      const now = new Date();
      await Promise.all([
        this.prisma.businessMember.update({
          where: { id: membership.id },
          data: { lastAccessedAt: now },
        }),
        this.prisma.walletPreference.upsert({
          where: { walletAddress: membership.walletAddress },
          create: {
            walletAddress: membership.walletAddress,
            activeBusinessId: membership.businessId,
          },
          update: { activeBusinessId: membership.businessId },
        }),
      ]);
      this.syncMerchant(membership.business);

      return {
        ok: true,
        activeWorkspaceId: membership.businessId,
      };
    } catch (error) {
      this.throwMappedError(error, 'Workspace activate error');
    }
  }

  private async ensureLegacyMemberships(walletAddress: string) {
    const legacy = await this.prisma.business.findMany({
      where: { walletAddress },
      orderBy: { createdAt: 'asc' },
    });
    if (legacy.length === 0) return;

    await Promise.all(
      legacy.map((business) =>
        this.prisma.businessMember.upsert({
          where: {
            walletAddress_businessId: {
              walletAddress,
              businessId: business.id,
            },
          },
          create: {
            businessId: business.id,
            walletAddress,
            role: 'owner',
          },
          update: {},
        }),
      ),
    );

    const preference = await this.prisma.walletPreference.findUnique({
      where: { walletAddress },
    });
    if (!preference) {
      await this.prisma.walletPreference.create({
        data: {
          walletAddress,
          activeBusinessId: legacy[0].id,
        },
      });
    }
  }

  private async requireMembership(request: Request, workspaceId: string) {
    const id = requiredString(workspaceId, 'workspaceId', 128);
    const session = this.access.requireSession(request);
    const membership = await this.prisma.businessMember.findUnique({
      where: {
        walletAddress_businessId: {
          walletAddress: session.walletAddress,
          businessId: id,
        },
      },
      include: {
        business: {
          include: { _count: { select: { members: true } } },
        },
      },
    });
    if (!membership) {
      throw this.error(HttpStatus.NOT_FOUND, 'Workspace not found');
    }
    return membership;
  }

  private parseCreateInput(input: WorkspaceCreateInput) {
    const name = requiredString(input.name, 'name', 80);
    if (name.length < 2) {
      throw this.error(
        HttpStatus.BAD_REQUEST,
        'name must be at least 2 characters',
      );
    }

    const workspaceType = requiredString(
      input.workspaceType,
      'workspaceType',
      40,
    ).toLowerCase();
    if (!WORKSPACE_TYPES.has(workspaceType)) {
      throw this.error(HttpStatus.BAD_REQUEST, 'Invalid workspaceType');
    }

    const website = optionalString(input.website, 300);
    if (website && !isHttpUrl(website)) {
      throw this.error(
        HttpStatus.BAD_REQUEST,
        'website must be a valid http(s) URL',
      );
    }

    const teamSize = optionalEnum(input.teamSize, TEAM_SIZES, 'teamSize');
    const logo = parseLogo(input.logoDataUrl, input.logoName);

    return {
      name,
      workspaceType,
      website,
      teamSize,
      logoDataUrl: logo.dataUrl,
      logoName: logo.name,
      invitedMembers: parseInvitedMembers(input.invitedMembers),
    };
  }

  private workspaceJson(
    business: {
      _count: { members: number };
      businessNature: string | null;
      createdAt: Date;
      id: string;
      logoDataUrl: string | null;
      logoName: string | null;
      name: string | null;
      receiveAddress: string | null;
      selectedTier: string | null;
      selectedTierName: string | null;
      teamSize: string | null;
      updatedAt: Date;
      website: string | null;
      workspaceType: string | null;
    },
    role: string,
    lastAccessedAt: Date,
  ) {
    return {
      id: business.id,
      name: business.name?.trim() || 'Untitled workspace',
      workspaceType:
        business.workspaceType ?? business.businessNature ?? 'other',
      website: business.website,
      teamSize: business.teamSize,
      logoUrl: business.logoDataUrl,
      logoName: business.logoName,
      tier: business.selectedTierName ?? 'Starter',
      selectedTier: business.selectedTier,
      role: capitalizeRole(role),
      members: Math.max(1, business._count.members),
      receiveAddress: business.receiveAddress,
      lastAccessedAt: lastAccessedAt.toISOString(),
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
    };
  }

  private syncMerchant(business: {
    id: string;
    walletAddress: string;
    receiveAddress: string | null;
  }) {
    this.paymentsApiSync.pushMerchantSettings({
      businessId: business.id,
      walletAddress: business.walletAddress,
      receiveAddress: business.receiveAddress,
    });
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

function requiredString(value: unknown, field: string, maxLength: number) {
  const resolved = optionalString(value, maxLength);
  if (!resolved) {
    throw new HttpException(
      { error: `${field} is required` },
      HttpStatus.BAD_REQUEST,
    );
  }
  return resolved;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpException(
      { error: 'Expected a string value' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return value.trim().slice(0, maxLength) || null;
}

function optionalEnum(
  value: unknown,
  allowed: Set<string>,
  field: string,
): string | null {
  const resolved = optionalString(value, 60)?.toLowerCase() ?? null;
  if (resolved && !allowed.has(resolved)) {
    throw new HttpException(
      { error: `Invalid ${field}` },
      HttpStatus.BAD_REQUEST,
    );
  }
  return resolved;
}

function parseInvitedMembers(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (member): member is Record<string, unknown> =>
        Boolean(member) && typeof member === 'object',
    )
    .slice(0, 25)
    .map((member) => ({
      email: optionalString(member.email, 254) ?? '',
      nickname: optionalString(member.nickname, 80) ?? '',
      role: optionalString(member.role, 30) ?? 'member',
      permission: optionalString(member.permission, 30) ?? 'view-only',
    }))
    .filter((member) => member.email || member.nickname);
}

function parseLogo(dataUrl: unknown, name: unknown) {
  if (dataUrl === undefined || dataUrl === null || dataUrl === '') {
    return { dataUrl: null, name: null };
  }
  if (typeof dataUrl !== 'string') {
    throw new HttpException(
      { error: 'logoDataUrl must be a string' },
      HttpStatus.BAD_REQUEST,
    );
  }
  const raw = dataUrl.trim();
  if (!raw) return { dataUrl: null, name: null };
  if (!raw.startsWith('data:image/')) {
    throw new HttpException(
      { error: 'logoDataUrl must be an image data URL' },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (raw.length > MAX_LOGO_DATA_URL_LENGTH) {
    throw new HttpException(
      { error: 'Logo is too large. Use a file under 2 MB.' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return {
    dataUrl: raw,
    name: optionalString(name, 120),
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function capitalizeRole(role: string) {
  const normalized = role.trim().toLowerCase();
  return normalized
    ? `${normalized[0].toUpperCase()}${normalized.slice(1)}`
    : 'Member';
}

function isPrismaConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as {
    code?: string;
    message?: string;
    name?: string;
  };
  if (prismaError.name === 'PrismaClientInitializationError') return true;
  if (prismaError.code === 'P1001' || prismaError.code === 'P1017') return true;
  return [
    'Error creating a database connection',
    'No route to host',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
  ].some((fragment) => prismaError.message?.includes(fragment));
}
