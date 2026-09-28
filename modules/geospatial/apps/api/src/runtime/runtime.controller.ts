import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  CurrentGeospatialPrincipal,
  GeospatialAuthorizationGuard,
  type GeospatialPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { GeospatialDatabaseService } from '../database/database.service.js';

@Controller('v1/runtime')
@UseGuards(GeospatialAuthorizationGuard)
export class GeospatialRuntimeController {
  constructor(private readonly database: GeospatialDatabaseService) {}

  @Get('tenant-scope')
  @RequirePermissions('maps:read')
  async getTenantScope(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal) {
    const tenantId = await this.database.currentTenantScope(principal.tenantId);
    return {
      status: 'ready',
      service: 'gigalibs-geospatial-api',
      tenantId,
      orgScope: principal.orgScope,
      businessCapabilitiesEnabled: true,
      enabledCapabilities: ['node-types', 'places-hierarchy'],
    };
  }
}
