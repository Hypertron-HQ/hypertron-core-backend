import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReconcilerModule } from '../reconciler/reconciler.module';
import { PaymentLinksController } from './payment-links.controller';
import { PaymentLinksService } from './payment-links.service';

@Module({
  imports: [BusinessModule, PrismaModule, ReconcilerModule],
  controllers: [PaymentLinksController],
  providers: [PaymentLinksService],
})
export class PaymentLinksModule {}
