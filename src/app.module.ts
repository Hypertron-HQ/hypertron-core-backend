import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BalanceModule } from './balance/balance.module';
import { BusinessModule } from './business/business.module';
import { PaymentLinksModule } from './payment-links/payment-links.module';
import { PrismaModule } from './prisma/prisma.module';
import { TemplatesModule } from './templates/templates.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BalanceModule,
    BusinessModule,
    PaymentLinksModule,
    TemplatesModule,
    WorkspaceModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
