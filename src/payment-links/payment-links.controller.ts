import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentLinksService } from './payment-links.service';

@Controller('api/payment-link')
export class PaymentLinksController {
  constructor(private readonly paymentLinksService: PaymentLinksService) {}

  @Post()
  create(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.paymentLinksService.create(request, body ?? {});
  }

  @Get()
  findAll(@Req() request: Request, @Query('businessId') businessId?: string) {
    return this.paymentLinksService.findAll(request, businessId);
  }

  @Get(':id')
  findPublic(@Param('id') id: string) {
    return this.paymentLinksService.findPublic(id);
  }
}
