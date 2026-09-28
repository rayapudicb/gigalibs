import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { PartsService } from './parts.service.js';

@Controller('v1/parts')
@UseGuards(CmmsAuthorizationGuard)
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.parts.search(principal, body);
  }

  @Get(':partId')
  @RequirePermissions('cmms.parts.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('partId') partId: string) {
    return this.parts.get(principal, partId);
  }

  @Get(':partId/movements')
  @RequirePermissions('cmms.parts.read')
  movements(@CurrentPrincipal() principal: CmmsPrincipal, @Param('partId') partId: string) {
    return this.parts.movements(principal, partId);
  }

  @Post()
  @RequirePermissions('cmms.parts.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.parts.create(context, body);
  }

  @Patch(':partId')
  @RequirePermissions('cmms.parts.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('partId') partId: string, @Body() body: unknown) {
    return this.parts.update(context, partId, body);
  }

  @Post(':partId/movements')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.write')
  move(@CommandContext() context: CmmsCommandContext, @Param('partId') partId: string, @Body() body: unknown) {
    return this.parts.recordMovement(context, partId, body);
  }
}
