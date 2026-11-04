import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { CmmsPackService } from './pack.service.js';

/** WI-OI-154: CMMS's section of the active industry pack (`pack.apply` from the kernel). */
@Controller('v1/pack')
@UseGuards(CmmsAuthorizationGuard)
export class CmmsPackController {
  constructor(private readonly packs: CmmsPackService) {}

  @Get()
  @RequirePermissions('cmms.assets.read')
  current(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.packs.current(principal);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  apply(
    @CommandContext() context: CmmsCommandContext,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const correlation =
      correlationId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationId) ? correlationId : randomUUID();
    return this.packs.apply({ ...context, correlationId: correlation }, body);
  }
}
