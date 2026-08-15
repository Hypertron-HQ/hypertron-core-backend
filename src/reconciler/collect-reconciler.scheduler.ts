import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { CollectReconcilerService } from './collect-reconciler.service';

const POLL_MS = 30_000;

@Injectable()
export class CollectReconcilerScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CollectReconcilerScheduler.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(private readonly reconciler: CollectReconcilerService) {}

  onModuleInit(): void {
    if (process.env.DISABLE_RECONCILER === 'true') {
      this.logger.log('DISABLE_RECONCILER=true — Collect reconciler idle');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);

    // Kick once shortly after boot
    setTimeout(() => void this.tick(), 5_000);
    this.logger.log(`Collect reconciler scheduled every ${POLL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconciler.pollUnpaidPaymentLinks();
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Collect reconciler tick failed',
      );
    } finally {
      this.running = false;
    }
  }
}
