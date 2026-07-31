import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessAccessService } from './business-access.service';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BusinessController],
  providers: [BusinessAccessService, BusinessService],
  exports: [BusinessAccessService],
})
export class BusinessModule {}
