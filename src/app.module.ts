import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BusinessModule } from './business/business.module';
import { PaymentLinksModule } from './payment-links/payment-links.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, BusinessModule, PaymentLinksModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
