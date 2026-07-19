import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PaymentLinksModule } from './payment-links/payment-links.module';

@Module({
  imports: [PaymentLinksModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
