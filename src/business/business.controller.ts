import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessService } from './business.service';

@Controller('api/business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('profile')
  getProfile(@Req() request: Request) {
    return this.businessService.getProfile(request);
  }

  @Patch('profile')
  updateProfile(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    return this.businessService.updateProfile(request, body ?? {});
  }

  @Post('link')
  linkBusiness(
    @Req() request: Request,
    @Body() body: { receiveAddress?: unknown },
  ) {
    return this.businessService.linkBusiness(request, body?.receiveAddress);
  }

  @Patch('link')
  updateReceiveAddress(
    @Req() request: Request,
    @Body() body: { receiveAddress?: unknown },
  ) {
    return this.businessService.updateReceiveAddress(
      request,
      body?.receiveAddress,
    );
  }
}
