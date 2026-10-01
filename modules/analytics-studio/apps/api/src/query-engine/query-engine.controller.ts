import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { QueryEngineService } from './query-engine.service.js';

// ─── Query Engine Controller ──────────────────────────────────────────────────

@Controller('v1/query')
@UseGuards(PlatformContextAuthorizationGuard)
export class QueryEngineController {
  constructor(private readonly queryEngine: QueryEngineService) {}

  /**
   * POST /v1/query/spec (WI-OI-103a)
   * Run an AnalyticsQueryV1: measures by dimensions, per time grain, filtered and sorted. Returns typed rows.
   */
  @Post('spec')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('analytics:read')
  async runSpec(@CurrentPrincipal() principal: AnalyticsPrincipal, @Body() body: unknown) {
    return this.queryEngine.runSpec(principal, body);
  }
}
