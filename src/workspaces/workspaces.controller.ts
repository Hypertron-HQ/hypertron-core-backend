import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspacesService } from './workspaces.service';

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@Req() request: Request) {
    return this.workspacesService.list(request);
  }

  @Post()
  create(@Req() request: Request, @Body() body: Record<string, unknown>) {
    return this.workspacesService.create(request, body ?? {});
  }

  @Get(':workspaceId')
  get(@Req() request: Request, @Param('workspaceId') workspaceId: string) {
    return this.workspacesService.get(request, workspaceId);
  }

  @Post(':workspaceId/activate')
  activate(@Req() request: Request, @Param('workspaceId') workspaceId: string) {
    return this.workspacesService.activate(request, workspaceId);
  }
}
