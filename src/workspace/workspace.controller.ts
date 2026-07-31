import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceService } from './workspace.service';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post('create')
  create(@Req() request: Request, @Body() body: unknown) {
    return this.workspaceService.create(request, body);
  }
}
