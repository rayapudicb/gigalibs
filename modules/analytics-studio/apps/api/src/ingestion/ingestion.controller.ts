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
import { IngestionService, type StartSyncDto } from './ingestion.service.js';

@Controller('v1/connectors')
@UseGuards(PlatformContextAuthorizationGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * POST /v1/connectors/:id/sync
   * Start a sync run for the given connection and source table.
   * Required permission: analytics:ingestion:write
   */
  @Post(':id/sync')
  @RequirePermissions('analytics:ingestion:write')
  @HttpCode(HttpStatus.ACCEPTED)
  async startSync(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: Omit<StartSyncDto, 'connectionId'>,
  ) {
    return this.ingestionService.startSync(principal, { ...body, connectionId: id });
  }

  /**
   * GET /v1/connectors/:id/sync
   * List recent sync runs for the given connection.
   * Required permission: analytics:ingestion:read
   */
  @Get(':id/sync')
  @RequirePermissions('analytics:ingestion:read')
  async listSyncRuns(
    @Principal() principal: AnalyticsPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.ingestionService.listSyncRuns(principal, id, limit);
  }

  /**
   * GET /v1/sync-runs/:runId
   * Retrieve a single sync run by its ID.
   * Required permission: analytics:ingestion:read
   */
  @Get('/sync-runs/:runId')
  @RequirePermissions('analytics:ingestion:read')
  async getSyncRun(
    @Principal() principal: AnalyticsPrincipal,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
  ) {
    return this.ingestionService.getSyncRun(principal, runId);
  }
}
