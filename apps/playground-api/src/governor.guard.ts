import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { GovernorService } from './governor.service.js';

interface HttpRequestLike {
  path?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | undefined>;
  executionBudget?: unknown;
  tenant?: { id: string };
}

interface HttpResponseLike {
  setHeader?(name: string, value: string | number): void;
}

@Injectable()
export class GovernorThrottlingGuard implements CanActivate {
  constructor(private readonly governorService: GovernorService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();

    // Skip governor limits on internal health/ready routes
    const path = req.path || '';
    if (path.includes('/health') || path.includes('/ready') || path.includes('/metrics')) {
      return true;
    }

    const tenantId =
      (req.headers['x-tenant-id'] as string) ||
      (req as unknown as { tenant?: { id: string } })?.tenant?.id ||
      (req.query?.tenantId as string) ||
      'anonymous-tenant';

    const decision = this.governorService.consumeRequest(tenantId);

    if (res && res.setHeader) {
      res.setHeader('X-RateLimit-Limit', decision.limit);
      res.setHeader('X-RateLimit-Remaining', decision.remaining);
      res.setHeader('X-RateLimit-Reset', decision.resetSeconds);
      res.setHeader('X-Governor-Tier', decision.tier);
    }

    if (!decision.allowed) {
      if (res && res.setHeader) {
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

    // Attach execution budget tracker for downstream request lifecycle
    req.executionBudget = this.governorService.createExecutionBudget(tenantId, decision.tier);

    return true;
  }
}
