import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { BusinessTemplate, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessAccessService } from '../business/business-access.service';

const DATABASE_UNAVAILABLE_MESSAGE =
  'Database unavailable. Check DATABASE_URL in .env and that MongoDB is reachable (network/VPN).';

type TemplateInput = {
  businessName?: unknown;
  bundleId?: unknown;
  bundleName?: unknown;
  description?: unknown;
  name?: unknown;
  widgets?: unknown;
};

@Injectable()
export class TemplatesService {
  constructor(
    private readonly access: BusinessAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(request: Request) {
    try {
      const { business } = await this.access.getBusinessForRequest(request);
      const templates = await this.prisma.businessTemplate.findMany({
        where: { businessId: business.id },
        orderBy: { updatedAt: 'desc' },
      });

      return {
        templates: templates.map((template) => this.templateJson(template)),
      };
    } catch (error) {
      this.throwMappedError(error, 'Templates GET error');
    }
  }

  async create(request: Request, input: TemplateInput) {
    try {
      const { business } = await this.access.getBusinessForRequest(request);
      const name = requiredString(input.name);
      const bundleId = requiredString(input.bundleId);
      const bundleName = requiredString(input.bundleName);
      if (!name || !bundleId || !bundleName) {
        throw this.error(
          HttpStatus.BAD_REQUEST,
          'name, bundleId, and bundleName are required',
        );
      }

      const template = await this.prisma.businessTemplate.create({
        data: {
          businessId: business.id,
          name,
          bundleId,
          bundleName,
          businessName: nullableString(input.businessName) ?? null,
          description: nullableString(input.description) ?? null,
          widgets: jsonArrayOrEmpty(input.widgets),
        },
      });

      return { template: this.templateJson(template) };
    } catch (error) {
      this.throwMappedError(error, 'Templates POST error');
    }
  }

  async findOne(request: Request, id: string) {
    try {
      const { business } = await this.access.getBusinessForRequest(
        request,
        false,
      );
      const template = await this.prisma.businessTemplate.findFirst({
        where: { id, businessId: business.id },
      });
      if (!template) {
        throw this.error(HttpStatus.NOT_FOUND, 'Template not found');
      }

      return { template: this.templateJson(template) };
    } catch (error) {
      this.throwMappedError(error, 'Template GET error');
    }
  }

  async update(request: Request, id: string, input: TemplateInput) {
    try {
      const { business } = await this.access.getBusinessForRequest(
        request,
        false,
      );
      const template = await this.prisma.businessTemplate.findFirst({
        where: { id, businessId: business.id },
        select: { id: true },
      });
      if (!template) {
        throw this.error(HttpStatus.NOT_FOUND, 'Template not found');
      }

      const update: Prisma.BusinessTemplateUpdateInput = {};
      const name = requiredString(input.name);
      if (name) update.name = name;
      if (input.description !== undefined) {
        update.description = nullableString(input.description) ?? null;
      }
      if (Array.isArray(input.widgets)) {
        update.widgets = jsonArrayOrEmpty(input.widgets);
      }
      if (Object.keys(update).length === 0) {
        throw this.error(HttpStatus.BAD_REQUEST, 'No valid fields to update');
      }

      const updated = await this.prisma.businessTemplate.update({
        where: { id: template.id },
        data: update,
      });
      return { template: this.templateJson(updated) };
    } catch (error) {
      this.throwMappedError(error, 'Template PATCH error');
    }
  }

  private templateJson(template: BusinessTemplate) {
    return {
      id: template.id,
      name: template.name,
      businessName: template.businessName ?? null,
      savedAt: template.updatedAt.toISOString(),
      bundleId: template.bundleId,
      bundleName: template.bundleName,
      description: template.description ?? null,
      widgets: Array.isArray(template.widgets) ? template.widgets : [],
    };
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

function requiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() || null : undefined;
}

function jsonArrayOrEmpty(value: unknown): Prisma.InputJsonValue {
  return Array.isArray(value) ? (value as Prisma.InputJsonValue) : [];
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
