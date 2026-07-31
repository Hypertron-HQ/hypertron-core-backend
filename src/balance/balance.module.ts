import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';

@Module({
  imports: [BusinessModule, PrismaModule],
  controllers: [BalanceController],
  providers: [BalanceService],
})
export class BalanceModule {}
