import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CurrentGeospatialPrincipal,
  GeospatialAuthorizationGuard,
  RequirePermissions,
  type GeospatialPrincipal,
} from '../auth/authorization.js';
import { PlacesService } from './places.service.js';

@Controller('v1/node-types')
@UseGuards(GeospatialAuthorizationGuard)
export class SpatialNodeTypesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @RequirePermissions('maps.nodes.read')
  list(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal) {
    return this.places.listNodeTypes(principal);
  }

  @Post()
  @RequirePermissions('maps.node-types.manage')
  create(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.places.createNodeType({ principal, correlationId: safeCorrelationId(correlationId) }, body);
  }
}

@Controller('v1/nodes')
@UseGuards(GeospatialAuthorizationGuard)
export class SpatialNodesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @RequirePermissions('maps.nodes.read')
  list(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal, @Query() query: unknown) {
    return this.places.listNodes(principal, query);
  }

  @Get('mobile/sync')
  @RequirePermissions('maps.nodes.read')
  mobileSync(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal, @Query() query: unknown) {
    return this.places.mobileSync(principal, query);
  }

  @Get('lookup/tag')
  @RequirePermissions('maps.nodes.read')
  lookupTag(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal, @Query('tag') tag: string) {
    return this.places.lookupTag(principal, tag);
  }

  @Get(':nodeId')
  @RequirePermissions('maps.nodes.read')
  get(@CurrentGeospatialPrincipal() principal: GeospatialPrincipal, @Param('nodeId') nodeId: string) {
    return this.places.getNode(principal, nodeId);
  }

  @Post()
  @RequirePermissions('maps.nodes.manage')
  create(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.places.createNode({ principal, correlationId: safeCorrelationId(correlationId) }, body);
  }

  @Patch(':nodeId')
  @RequirePermissions('maps.nodes.manage')
  update(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('nodeId') nodeId: string,
    @Body() body: unknown,
  ) {
    return this.places.updateNode({ principal, correlationId: safeCorrelationId(correlationId) }, nodeId, body);
  }

  // WI-OI-105b: queue every place again for consumers such as Analytics' place directory.
  @Post('republish')
  @HttpCode(200)
  @RequirePermissions('maps.nodes.manage')
  republish(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
  ) {
    return this.places.republishPlaces({ principal, correlationId: safeCorrelationId(correlationId) });
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermissions('maps.nodes.manage')
  import(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.places.importNodes({ principal, correlationId: safeCorrelationId(correlationId) }, body);
  }

  @Post(':nodeId/move')
  @HttpCode(200)
  @RequirePermissions('maps.nodes.manage')
  move(
    @CurrentGeospatialPrincipal() principal: GeospatialPrincipal,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Param('nodeId') nodeId: string,
    @Body() body: unknown,
  ) {
    return this.places.moveNode({ principal, correlationId: safeCorrelationId(correlationId) }, nodeId, body);
  }
}

function safeCorrelationId(value: string | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : randomUUID();
}
