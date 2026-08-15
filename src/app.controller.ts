import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getStatus() {
    return {
      service: 'hypertron-core-backend',
      status: 'ok',
    };
  }

  @Get('health')
  async getHealth() {
    try {
      await this.prisma.$runCommandRaw({ ping: 1 });
      return {
        service: 'hypertron-core-backend',
        status: 'ok',
        database: 'ok',
      };
    } catch {
      throw new HttpException(
        {
          service: 'hypertron-core-backend',
          status: 'degraded',
          database: 'unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
