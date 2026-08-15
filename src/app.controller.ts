import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getStatus() {
    return this.health();
  }

  @Get('health')
  getHealth() {
    return this.health();
  }

  private health() {
    return {
      service: 'hypertron-core-backend',
      status: 'ok',
    };
  }
}
