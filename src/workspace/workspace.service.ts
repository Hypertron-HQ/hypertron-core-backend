import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { BusinessAccessService } from '../business/business-access.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_LOGO_DATA_URL_LENGTH = 600_000;
const WORKSPACE_TYPE_TO_TIER: Record<string, { id: string; name: string }> = {
  'web3-startup': { id: 'tier-1', name: 'Tier 1' },
  other: { id: 'tier-1', name: 'Tier 1' },
  dao: { id: 'tier-2', name: 'Tier 2' },
  agency: { id: 'tier-2', name: 'Tier 2' },
  'service-company': { id: 'tier-2', name: 'Tier 2' },
  foundation: { id: 'tier-3', name: 'Tier 3' },
  infrastructure: { id: 'tier-3', name: 'Tier 3' },
  enterprise: { id: 'tier-3', name: 'Tier 3' },
};
const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  'web3-startup': 'Web3 Startup / Protocol',
  dao: 'DAO',
  agency: 'Agency',
  foundation: 'Foundation / Ecosystem',
  infrastructure: 'Infrastructure Provider',
  'service-company': 'Service Company',
  enterprise: 'Enterprise Team',
  other: 'Other',
};
const OPERATION_MODULE_LABELS: Record<string, string> = {
  treasury: 'Treasury',
  payments: 'Payments',
  'contributor-management': 'Contributor Management',
  'compliance-monitoring': 'Compliance Monitoring',
  'regulations-feed': 'Regulations Feed',
  'risk-reports': 'Risk Reports',
  'client-operations': 'Client Operations',
  'agency-operations': 'Agency Operations',
  'workflow-automation': 'Workflow Automation',
};
const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

type WorkspacePayload = {
  businessName: string;
  complianceFrameworks: string[];
  complianceMonitoring: string[];
  dataResidency?: string;
  dataRetention?: string;
  integrations: string[];
  inviteMembers: Array<{
    email: string;
    nickname: string;
    permission: string;
    role: string;
  }>;
  logoDataUrl?: string;
  logoName?: string;
  operationModules: string[];
  supportedChains: string[];
  teamSize?: string;
  walletProvider?: string;
  website?: string;
  workspaceType: string;
};

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async create(request: Request, input: unknown) {
    try {
      const { business } = await this.access.getBusinessForRequest(request);
      const payload = parseWorkspacePayload(input);
      if ('error' in payload) {
        throw this.error(HttpStatus.BAD_REQUEST, payload.error);
      }

      const tier =
        WORKSPACE_TYPE_TO_TIER[payload.workspaceType] ??
        WORKSPACE_TYPE_TO_TIER['web3-startup'];
      const workspaceTypeLabel =
        WORKSPACE_TYPE_LABELS[payload.workspaceType] ?? payload.workspaceType;
      const now = new Date();
      const widgets = buildWidgets(payload.operationModules);
      const complianceForm = {
        workspaceSetupVersion: 1,
        workspaceType: payload.workspaceType,
        workspaceTypeLabel,
        website: payload.website || null,
        teamSize: payload.teamSize ?? null,
        logoDataUrl:
          payload.logoDataUrl &&
          payload.logoDataUrl.length <= MAX_LOGO_DATA_URL_LENGTH
            ? payload.logoDataUrl
            : null,
        logoName: payload.logoName || null,
        walletProvider: payload.walletProvider ?? null,
        supportedChains: payload.supportedChains,
        integrations: payload.integrations,
        inviteMembers: payload.inviteMembers,
        complianceFrameworks: payload.complianceFrameworks,
        complianceMonitoring: payload.complianceMonitoring,
        dataResidency: payload.dataResidency ?? null,
        dataRetention: payload.dataRetention ?? null,
        createdAt: now.toISOString(),
      };
      const template = await this.prisma.businessTemplate.create({
        data: {
          businessId: business.id,
          name: `${payload.businessName} · ${workspaceTypeLabel}`,
          businessName: payload.businessName,
          bundleId: tier.id,
          bundleName: tier.name,
          description: `Workspace for ${workspaceTypeLabel}`,
          widgets: widgets as Prisma.InputJsonValue,
        },
      });
      await this.prisma.business.update({
        where: { id: business.id },
        data: {
          name: payload.businessName,
          businessNature: payload.workspaceType,
          selectedWidgets: payload.operationModules,
          selectedTier: tier.id,
          selectedTierName: tier.name,
          selectedTierAt: now,
          activeTemplateId: template.id,
          activeTemplateAt: now,
          complianceForm: complianceForm,
          ...(payload.walletProvider ? { vaultType: 'external' } : {}),
        },
      });

      return {
        businessId: business.id,
        templateId: template.id,
        activeTemplateId: template.id,
        selectedTier: tier.id,
        selectedTierName: tier.name,
        template: {
          id: template.id,
          name: template.name,
          businessName: template.businessName,
          savedAt: template.updatedAt.toISOString(),
          bundleId: template.bundleId,
          bundleName: template.bundleName,
          description: template.description,
          widgets,
        },
      };
    } catch (error) {
      this.throwMappedError(error, 'Workspace create error');
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

function parseWorkspacePayload(
  input: unknown,
): WorkspacePayload | { error: string } {
  if (!input || typeof input !== 'object')
    return { error: 'Invalid request body' };
  const raw = input as Record<string, unknown>;
  const workspaceType = stringValue(raw.workspaceType);
  const businessName = stringValue(raw.businessName);
  if (!workspaceType) return { error: 'workspaceType is required' };
  if (!businessName) return { error: 'businessName is required' };

  const operationModules = stringArray(raw.operationModules);
  if (!operationModules.length)
    return { error: 'At least one operation module is required' };

  return {
    workspaceType,
    businessName,
    website: stringValue(raw.website) || undefined,
    teamSize: stringValue(raw.teamSize) || undefined,
    logoDataUrl: stringValue(raw.logoDataUrl) || undefined,
    logoName: stringValue(raw.logoName) || undefined,
    operationModules,
    walletProvider: stringValue(raw.walletProvider) || undefined,
    supportedChains: stringArray(raw.supportedChains),
    inviteMembers: inviteMembers(raw.inviteMembers),
    integrations: stringArray(raw.integrations),
    complianceFrameworks: stringArray(raw.complianceFrameworks),
    complianceMonitoring: stringArray(raw.complianceMonitoring),
    dataResidency: stringValue(raw.dataResidency) || undefined,
    dataRetention: stringValue(raw.dataRetention) || undefined,
  };
}

function buildWidgets(moduleIds: string[]): Array<Record<string, unknown>> {
  const stamp = Date.now();
  const settings = {
    dataSource: 'mock',
    refresh: '5m',
    deployment: 'local',
    parameters: '',
  };
  return moduleIds.map((moduleId, index) => ({
    id: `dw-${stamp}-${index}`,
    widgetId: moduleId,
    title:
      OPERATION_MODULE_LABELS[moduleId] ??
      moduleId
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    type: 'chart',
    x: (index % 4) * 3,
    y: Math.floor(index / 4) * 5,
    w: 3,
    h: 5,
    settings,
  }));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function inviteMembers(value: unknown): WorkspacePayload['inviteMembers'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (member): member is Record<string, unknown> =>
        !!member && typeof member === 'object',
    )
    .map((member) => ({
      email: stringValue(member.email),
      nickname: stringValue(member.nickname),
      role: stringValue(member.role),
      permission: stringValue(member.permission) || 'full-access',
    }));
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
