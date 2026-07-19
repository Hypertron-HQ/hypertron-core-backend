import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { PaymentLinksService } from './payment-links.service';

@Controller('api/payment-link')
export class PaymentLinksController {
  constructor(private readonly paymentLinksService: PaymentLinksService) {}

  @Post()
  create(@Body() body: CreatePaymentLinkDto) {
    if (!body?.amount?.trim()) {
      throw new BadRequestException({ error: 'amount required' });
    }

    return this.paymentLinksService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentLinksService.findOne(id);
  }
}
