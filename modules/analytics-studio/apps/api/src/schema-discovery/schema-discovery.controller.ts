import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import {
  SchemaDiscoveryService,
  type CreateMappingDto,
  type PublishMappingDto,
} from './schema-discovery.service.js';

@Controller('v1')
@UseGuards(PlatformContextAuthorizationGuard)
export class SchemaDiscoveryController {
  constructor(private readonly schemaDiscoveryService: SchemaDiscoveryService) {}

  /**
   * GET /v1/sources — WI-OI-104e: the sources a member can map (name, kind and status only; no connection details). The
   * Sources screen uses this instead of the Postgres connector's admin routes, which WI-OI-104f retires.
   */
  @Get('sources')
  @RequirePermissions('analytics:mappings:write')
  async listSources(@Principal() principal: AnalyticsPrincipal) {
    return this.schemaDiscoveryService.listSources(principal);
  }

  /** POST /v1/connectors/:id/discover — trigger schema discovery for a table */
  @Post('connectors/:id/discover')
  @RequirePermissions('analytics:mappings:write')
  @HttpCode(HttpStatus.OK)
  async discoverSchema(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) connectionId: string,
    @Query('table') sourceTableName: string,
    @Query('sampleSize', new DefaultValuePipe(1000), ParseIntPipe) sampleSize: number,
  ) {
    return this.schemaDiscoveryService.discoverSchema(principal, connectionId, sourceTableName, sampleSize);
  }

  /** GET /v1/schemas/:schemaId — fetch a schema + field profiles */
  @Get('schemas/:schemaId')
  @RequirePermissions('analytics:read')
  async getSchema(
    @Principal() principal: AnalyticsPrincipal,
    @Param('schemaId', new ParseUUIDPipe({ version: '4' })) schemaId: string,
  ) {
    return this.schemaDiscoveryService.getSchema(principal, schemaId);
  }

  /** POST /v1/mappings — create a DRAFT mapping */
  @Post('mappings')
  @RequirePermissions('analytics:mappings:write')
  @HttpCode(HttpStatus.CREATED)
  async createMapping(
    @Principal() principal: AnalyticsPrincipal,
    @Body() body: CreateMappingDto,
  ) {
    return this.schemaDiscoveryService.createMapping(principal, body);
  }

  /** GET /v1/mappings — list all mappings for the tenant */
  @Get('mappings')
  @RequirePermissions('analytics:read')
  async listMappings(@Principal() principal: AnalyticsPrincipal) {
    return this.schemaDiscoveryService.listMappings(principal);
  }

  /** POST /v1/mappings/:id/publish — publish a mapping version (immutable) */
  @Post('mappings/:id/publish')
  @RequirePermissions('analytics:mappings:write')
  @HttpCode(HttpStatus.OK)
  async publishMappingVersion(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) mappingId: string,
    @Body() body: PublishMappingDto,
  ) {
    return this.schemaDiscoveryService.publishMappingVersion(principal, mappingId, body);
  }
}
