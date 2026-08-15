import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CollectReconcilerScheduler } from './collect-reconciler.scheduler';
import { CollectReconcilerService } from './collect-reconciler.service';
import { StellarHorizonService } from './stellar-horizon.service';
import { StellarVerifier } from './stellar-verifier';

@Module({
  imports: [PrismaModule],
  providers: [
    StellarHorizonService,
    StellarVerifier,
    CollectReconcilerService,
    CollectReconcilerScheduler,
  ],
  exports: [CollectReconcilerService],
})
export class ReconcilerModule {}
