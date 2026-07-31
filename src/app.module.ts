import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PaymentLinksModule } from './payment-links/payment-links.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, PaymentLinksModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
