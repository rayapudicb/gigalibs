/**
 * LineageController — Lineage + Audit Log REST API
 *
 * GET /v1/lineage/:nodeType/:nodeId?direction=upstream|downstream|both
 * GET /v1/audit?entityId=&eventType=&limit=
 */

import {
  Controller, Get, Param, Query, UseGuards, ParseIntPipe,
  DefaultValuePipe, BadRequestException,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, PlatformPrincipal, RequirePermissions } from '../auth/authorization.js';
import { LineageService, LineageNodeType, AuditEventType } from './lineage.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

@Controller('v1/lineage')
@UseGuards(PlatformContextAuthorizationGuard)
export class LineageController {
  constructor(private readonly lineage: LineageService) {}

  @Get(':nodeType/:nodeId')
  @RequirePermissions('analytics:read')
  async getLineage(
    @PlatformPrincipal() principal: AnalyticsPrincipal,
    @Param('nodeId') nodeId: string,
    @Param('nodeType') nodeType: string,
    @Query('direction') direction?: string,
  ) {
    const dir =
      direction === 'upstream' || direction === 'downstream' || direction === 'both'
        ? direction
        : 'both';
    const edges = await this.lineage.getLineageForNode(
      principal,
      nodeId,
      nodeType as LineageNodeType,
      dir,
    );
    return { nodeId, nodeType, direction: dir, edges };
  }
}

@Controller('v1/audit')
@UseGuards(PlatformContextAuthorizationGuard)
export class AuditController {
  constructor(private readonly lineage: LineageService) {}

  @Get()
  @RequirePermissions('analytics:read')
  async getAuditLog(
    @PlatformPrincipal() principal: AnalyticsPrincipal,
    @Query('entityId') entityId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    if (limit !== undefined && (limit < 1 || limit > 1000)) {
      throw new BadRequestException('limit must be between 1 and 1000');
    }
    const entries = await this.lineage.getAuditLog(principal, {
      entityId,
      eventType: eventType as AuditEventType | undefined,
      limit,
    });
    return { entries, count: entries.length };
  }
}
