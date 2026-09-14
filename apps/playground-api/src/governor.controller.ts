import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  GovernorService,
  TenantTier,
  DEFAULT_GOVERNOR_TIERS,
} from './governor.service.js';
import { Public } from '@gigalibs/auth-nest';

export interface ResponseHeadersAdapter {
  setHeader(name: string, value: string | number): void;
}

@Controller('governor')
export class GovernorController {
  constructor(private readonly governorService: GovernorService) {}

  @Public()
  @Get('quotas')
  getQuotas(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-system-tenant';
    const status = this.governorService.getQuotaStatus(tenantId);
    return {
      status: 'active',
      governor: {
        tenantId: status.tenantId,
        tier: status.tier,
        limits: {
          requestsPerMinute: status.config.requestsPerMinute,
          burstCapacity: status.config.burstCapacity,
          maxDbQueriesPerRequest: status.config.maxDbQueriesPerRequest,
          maxExecutionTimeMs: status.config.maxExecutionTimeMs,
          maxConcurrentRequests: status.config.maxConcurrentRequests,
        },
        liveState: {
          availableTokens: status.availableTokens,
        },
      },
    };
  }

  @Public()
  @Post('consume')
  consumeToken(
    @Body() body: { tenantId?: string; tier?: TenantTier },
    @Headers('x-tenant-id') headerTenantId?: string,
    @Res({ passthrough: true }) res?: ResponseHeadersAdapter,
  ) {
    const tenantId = body?.tenantId || headerTenantId || 'default-system-tenant';
    const decision = this.governorService.consumeRequest(tenantId, body?.tier);

    if (res) {
      res.setHeader('X-RateLimit-Limit', decision.limit);
      res.setHeader('X-RateLimit-Remaining', decision.remaining);
      res.setHeader('X-RateLimit-Reset', decision.resetSeconds);
      res.setHeader('X-Governor-Tier', decision.tier);
    }

    if (!decision.allowed) {
      if (res) {
        res.setHeader('Retry-After', decision.retryAfterSeconds);
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          code: 'GOVERNOR_RATE_LIMIT_EXCEEDED',
          message: `Governor rate limit exceeded for tenant '${tenantId}' on tier '${decision.tier}'. Please retry after ${decision.retryAfterSeconds} seconds.`,
          tenantId,
          tier: decision.tier,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      allowed: true,
      decision,
    };
  }

  @Post('check-budget')
  checkExecutionBudget(
    @Body() body: { tenantId?: string; plannedQueries?: number; plannedExecutionMs?: number; tier?: TenantTier },
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = body?.tenantId || headerTenantId || 'default-system-tenant';
    const tier = body?.tier || this.governorService.getTenantTier(tenantId);
    const config = DEFAULT_GOVERNOR_TIERS[tier];

    const plannedQueries = body?.plannedQueries ?? 1;
    const plannedExecutionMs = body?.plannedExecutionMs ?? 100;

    const queryBudgetOk = plannedQueries <= config.maxDbQueriesPerRequest;
    const timeBudgetOk = plannedExecutionMs <= config.maxExecutionTimeMs;

    if (!queryBudgetOk || !timeBudgetOk) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Budget Rejected',
          code: 'GOVERNOR_EXECUTION_BUDGET_EXCEEDED',
          message: `Workload exceeds governor execution budget for tier '${tier}'.`,
          details: {
            plannedQueries,
            maxAllowedQueries: config.maxDbQueriesPerRequest,
            queryBudgetOk,
            plannedExecutionMs,
            maxAllowedExecutionMs: config.maxExecutionTimeMs,
            timeBudgetOk,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      status: 'ADMISSIBLE',
      tenantId,
      tier,
      plannedQueries,
      maxAllowedQueries: config.maxDbQueriesPerRequest,
      plannedExecutionMs,
      maxAllowedExecutionMs: config.maxExecutionTimeMs,
    };
  }

  @Post('tier')
  setTier(
    @Body() body: { tenantId: string; tier: TenantTier },
  ) {
    if (!body?.tenantId || !body?.tier || !DEFAULT_GOVERNOR_TIERS[body.tier]) {
      throw new HttpException('Invalid tenantId or tier', HttpStatus.BAD_REQUEST);
    }
    this.governorService.setTenantTier(body.tenantId, body.tier);
    return {
      status: 'success',
      tenantId: body.tenantId,
      tier: body.tier,
      config: DEFAULT_GOVERNOR_TIERS[body.tier],
    };
  }
}
