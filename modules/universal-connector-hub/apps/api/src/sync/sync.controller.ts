import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
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
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.syncService.triggerSync(principal.tenantId, id, { from_start: options?.from_start === true }, correlationId ?? null);
  }

  // WI-OI-104d: a connection's recent pulls and the records they could not identify.
  @Get('connections/:id/sync-jobs')
  @RequirePermissions('connections:read')
  async listSyncJobs(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return { success: true, jobs: await this.syncService.listSyncJobs(principal.tenantId, id) };
  }

  @Get('connections/:id/quarantine')
  @RequirePermissions('connections:read')
  async listQuarantine(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return { success: true, records: await this.syncService.listQuarantine(principal.tenantId, id) };
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
