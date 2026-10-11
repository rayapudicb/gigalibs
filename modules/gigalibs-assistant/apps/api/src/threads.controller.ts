import { CommandContext, type ModuleCommandContext, RequirePermissions } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.js';
import { ThreadsService } from './threads.service.js';

@Controller('v1/threads')
@UseGuards(AuthorizationGuard)
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  @RequirePermissions('assistant:thread:read')
  list(@CommandContext() context: ModuleCommandContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.threads.list(context, limit, cursor);
  }

  @Post()
  @RequirePermissions('assistant:thread:write')
  create(@CommandContext() context: ModuleCommandContext, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'title')
      throw new BadRequestException('Only title is accepted.');
    return this.threads.create(context, (body as Record<string, unknown>).title, key);
  }

  @Get(':id')
  @RequirePermissions('assistant:thread:read')
  get(@CommandContext() context: ModuleCommandContext, @Param('id') id: string) {
    return this.threads.get(context, id);
  }

  @Get(':id/messages')
  @RequirePermissions('assistant:thread:read')
  messages(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.threads.messages(context, id, limit, cursor);
  }

  @Post(':id/messages')
  @RequirePermissions('assistant:thread:write')
  append(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return this.threads.appendUserMessage(context, id, body, key);
  }
}
