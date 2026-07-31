import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [BusinessModule, PrismaModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
