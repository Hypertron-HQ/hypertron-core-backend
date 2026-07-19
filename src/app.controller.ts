import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getStatus() {
    return {
      service: 'hypertron-core-backend',
      status: 'ok',
    };
  }
}
