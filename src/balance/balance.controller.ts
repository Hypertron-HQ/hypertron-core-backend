import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BalanceService } from './balance.service';

@Controller('api/balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  getBalance(
    @Req() request: Request,
    @Query('businessId') businessId?: string,
  ) {
    return this.balanceService.getBalance(request, businessId);
  }
}
