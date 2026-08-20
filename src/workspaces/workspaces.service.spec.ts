import { HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessAccessService } from '../business/business-access.service';
import { PaymentsApiSyncService } from '../business/payments-api-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService', () => {
  const now = new Date('2026-08-17T00:00:00.000Z');
  const request = {} as Request;
  const access = {
    requireSession: jest.fn(() => ({
      kind: 'wallet',
      walletAddress: 'G'.padEnd(56, 'A'),
      actor: 'user',
    })),
  };
  const prisma = {
    business: {
      create: jest.fn(),
    },
    walletPreference: {
      upsert: jest.fn(),
    },
  };
  const paymentsApiSync = {
    pushMerchantSettings: jest.fn(),
  };
  const service = new WorkspacesService(
    access as unknown as BusinessAccessService,
    prisma as unknown as PrismaService,
    paymentsApiSync as unknown as PaymentsApiSyncService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an isolated Business workspace and activates it', async () => {
    prisma.business.create.mockResolvedValue({
      id: 'workspace-1',
      walletAddress: 'G'.padEnd(56, 'A'),
      receiveAddress: null,
      name: 'Arcgenesis Labs',
      businessNature: 'web3-startup',
      workspaceType: 'web3-startup',
      website: 'https://example.com',
      teamSize: '1-5',
      operationModules: ['payments'],
      walletProvider: 'freighter',
      supportedChains: ['stellar'],
      selectedTier: 'tier-1',
      selectedTierName: 'Starter',
      createdAt: now,
      updatedAt: now,
      _count: { members: 1 },
    });
    prisma.walletPreference.upsert.mockResolvedValue({});

    const result = await service.create(request, {
      name: 'Arcgenesis Labs',
      workspaceType: 'web3-startup',
      website: 'https://example.com',
      teamSize: '1-5',
    });

    expect(result.activeWorkspaceId).toBe('workspace-1');
    expect(result.workspace.name).toBe('Arcgenesis Labs');
    expect(prisma.business.create).toHaveBeenCalledTimes(1);
    expect(prisma.walletPreference.upsert).toHaveBeenCalled();
    expect(paymentsApiSync.pushMerchantSettings).toHaveBeenCalled();
  });

  it('rejects a workspace without a name', async () => {
    await expect(
      service.create(request, {
        workspaceType: 'web3-startup',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(prisma.business.create).not.toHaveBeenCalled();
  });
});
