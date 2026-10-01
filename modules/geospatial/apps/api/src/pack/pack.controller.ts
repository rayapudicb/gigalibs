import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  CurrentGeospatialPrincipal,
  GeospatialAuthorizationGuard,
  type GeospatialPrincipal,
  RequirePermissions,
} from '../auth/authorization.js';
import { GeospatialPackService } from './pack.service.js';

/** WI-OI-107: Geospatial's section of the active industry pack. `apply` is called by the kernel's `pack.apply` job. */
@Controller('v1/pack')
@UseGuards(GeospatialAuthorizationGuard)
export class GeospatialPackController {
  constructor(private readonly packs: GeospatialPackService) {}

  @Get()
  @RequirePermissions('maps.nodes.read')
  current(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal) {
    return this.packs.current(principal);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('maps.node-types.manage')
  apply(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    const correlation = correlationId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationId) ? correlationId : randomUUID();
    return this.packs.apply({ principal, correlationId: correlation }, body);
  }
}
