import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { TemplatesService } from './templates.service';

@Controller('api/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll(@Req() request: Request) {
    return this.templatesService.findAll(request);
  }

  @Post()
  create(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.templatesService.create(request, body ?? {});
  }

  @Get(':id')
  findOne(@Req() request: Request, @Param('id') id: string) {
    return this.templatesService.findOne(request, id);
  }

  @Patch(':id')
  update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.templatesService.update(request, id, body ?? {});
  }
}
