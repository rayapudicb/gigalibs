import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { LeaksService } from './leaks.service.js';
import {
  OidcAuthorizationGuard,
  Principal,
  type RecoveryPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class LeaksController {
  constructor(private readonly leaksService: LeaksService) {}

  @Get('metrics')
  @RequirePermissions('recovery:read')
  async getMetrics(@Principal() principal: RecoveryPrincipal) {
    return this.leaksService.getMetrics(principal.tenantId);
  }

  @Get('leaks')
  @RequirePermissions('recovery:read')
  async getLeaks(
    @Principal() principal: RecoveryPrincipal,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.leaksService.getLeaks(principal.tenantId, { type, severity, status, search });
  }

  @Get('leaks/:id')
  @RequirePermissions('recovery:read')
  async getLeakById(
    @Principal() principal: RecoveryPrincipal,
    @Param('id') id: string,
  ) {
    return this.leaksService.getLeakById(principal.tenantId, id);
  }

  @Post('leaks/:id/action')
  @RequirePermissions('recovery:action')
  async takeAction(
    @Principal() principal: RecoveryPrincipal,
    @Param('id') id: string,
    @Body() body: { action: string; notes?: string },
  ) {
    return this.leaksService.takeAction(principal.tenantId, id, body.action, body.notes, principal);
  }
}
