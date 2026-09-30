import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, Principal, RequirePermissions } from '../auth/authorization.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { ConnectorService, type CreateConnectionDto } from './connector.service.js';

// ── Request body validation ────────────────────────────────────────────────
// NestJS class-validator is not yet in the dependency tree; we perform
// lightweight runtime checks inside ConnectorService to keep the module
// self-contained until a validation pipe is added.

@Controller('v1/connectors')
@UseGuards(PlatformContextAuthorizationGuard)
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  /**
   * POST /v1/connectors
   * Register a new external data source connection.
   * Required permission: analytics:connectors:write
   */
  @Post()
  @RequirePermissions('analytics:connectors:write')
  @HttpCode(HttpStatus.CREATED)
  async createConnection(
    @Principal() principal: AnalyticsPrincipal,
    @Body() body: CreateConnectionDto,
  ) {
    return this.connectorService.createConnection(principal, body);
  }

  /**
   * GET /v1/connectors
   * List all registered connections for the calling tenant.
   * Required permission: analytics:connectors:read
   */
  @Get()
  @RequirePermissions('analytics:connectors:write')
  async listConnections(@Principal() principal: AnalyticsPrincipal) {
    return this.connectorService.listConnections(principal);
  }

  /**
   * GET /v1/connectors/:id
   * Retrieve a single connection by ID.
   * Required permission: analytics:connectors:read
   */
  @Get(':id')
  @RequirePermissions('analytics:connectors:write')
  async getConnection(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.connectorService.getConnection(principal, id);
  }

  /**
   * POST /v1/connectors/:id/test
   * Initiate a live connectivity test for a registered connection.
   * Required permission: analytics:connectors:write
   */
  @Post(':id/test')
  @RequirePermissions('analytics:connectors:write')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.connectorService.testConnection(principal, id);
  }

  /**
   * DELETE /v1/connectors/:id
   * Remove a connection registration.
   * Required permission: analytics:connectors:write
   */
  @Delete(':id')
  @RequirePermissions('analytics:connectors:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConnection(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.connectorService.deleteConnection(principal, id);
  }
}
