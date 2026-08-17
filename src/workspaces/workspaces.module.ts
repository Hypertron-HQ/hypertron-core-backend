import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [BusinessModule, PrismaModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
