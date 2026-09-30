import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { ConnectorHubAuthorizationGuard } from '../auth/authorization.js';
import { SyncService, SyncOptions } from './sync.service.js';

// WI-OI-104a: the tenant comes only from the BFF-signed context; each route names the permission it needs.
@Controller('api/connectors/v1')
@UseGuards(ConnectorHubAuthorizationGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('journal')
  @RequirePermissions('connections:read')
  async getJournal(@CurrentPrincipal() principal: ModulePrincipal, @Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const journal = await this.syncService.getJournal(principal.tenantId, limit);
    return {
      success: true,
      count: journal.length,
      journal,
    };
  }

  @Post('connections/:id/sync')
  @RequirePermissions('connections:sync')
  async triggerSync(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() options?: SyncOptions,
  ) {
    return this.syncService.triggerSync(principal.tenantId, id, options);
  }

  @Get('stats')
  @RequirePermissions('connections:read')
  async getStats(@CurrentPrincipal() principal: ModulePrincipal) {
    const stats = await this.syncService.getStats(principal.tenantId);
    return {
      success: true,
      stats,
    };
  }
}
