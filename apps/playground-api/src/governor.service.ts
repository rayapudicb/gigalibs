import { Injectable, Logger } from '@nestjs/common';

export type TenantTier = 'FREE' | 'STANDARD' | 'PRO' | 'ENTERPRISE';

export interface GovernorTierConfig {
  requestsPerMinute: number;
  burstCapacity: number;
  maxDbQueriesPerRequest: number;
  maxExecutionTimeMs: number;
  maxConcurrentRequests: number;
}

export const DEFAULT_GOVERNOR_TIERS: Record<TenantTier, GovernorTierConfig> = {
  FREE: {
    requestsPerMinute: 60,
    burstCapacity: 20,
    maxDbQueriesPerRequest: 50,
    maxExecutionTimeMs: 3000,
    maxConcurrentRequests: 5,
  },
  STANDARD: {
    requestsPerMinute: 300,
    burstCapacity: 60,
    maxDbQueriesPerRequest: 150,
    maxExecutionTimeMs: 8000,
    maxConcurrentRequests: 25,
  },
  PRO: {
    requestsPerMinute: 1200,
    burstCapacity: 200,
    maxDbQueriesPerRequest: 500,
    maxExecutionTimeMs: 15000,
    maxConcurrentRequests: 100,
  },
  ENTERPRISE: {
    requestsPerMinute: 6000,
    burstCapacity: 1000,
    maxDbQueriesPerRequest: 2000,
    maxExecutionTimeMs: 30000,
    maxConcurrentRequests: 500,
  },
};

export interface RateLimitDecision {
  allowed: boolean;
  tier: TenantTier;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}

export class GovernorLimitExceededError extends Error {
  readonly code = 'GOVERNOR_RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  constructor(
    public readonly tenantId: string,
    public readonly tier: TenantTier,
    public readonly retryAfterSeconds: number,
  ) {
    super(
      `Tenant '${tenantId}' has exceeded governor rate limit for tier '${tier}'. Retry after ${retryAfterSeconds} seconds.`,
    );
    this.name = 'GovernorLimitExceededError';
  }
}

export class GovernorQueryLimitExceededError extends Error {
  readonly code = 'GOVERNOR_QUERY_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  constructor(
    public readonly tenantId: string,
    public readonly tier: TenantTier,
    public readonly queryCount: number,
    public readonly maxAllowed: number,
  ) {
    super(
      `Tenant '${tenantId}' exceeded database query governor budget (${queryCount}/${maxAllowed} queries) for tier '${tier}'. Potential runaway loop or unbounded N+1 join detected.`,
    );
    this.name = 'GovernorQueryLimitExceededError';
  }
}

export class GovernorTimeoutExceededError extends Error {
  readonly code = 'GOVERNOR_TIMEOUT_EXCEEDED';
  readonly statusCode = 408;
  constructor(
    public readonly tenantId: string,
    public readonly tier: TenantTier,
    public readonly elapsedMs: number,
    public readonly maxAllowedMs: number,
  ) {
    super(
      `Tenant '${tenantId}' request exceeded governor execution budget (${elapsedMs}ms/${maxAllowedMs}ms) for tier '${tier}'.`,
    );
    this.name = 'GovernorTimeoutExceededError';
  }
}

interface TenantBucketState {
  tokens: number;
  lastRefillTimestampMs: number;
  tier: TenantTier;
}

export class ExecutionBudgetTracker {
  private queryCount = 0;
  private readonly startTimeMs: number;
  private readonly tierConfig: GovernorTierConfig;

  constructor(
    public readonly tenantId: string,
    public readonly tier: TenantTier,
  ) {
    this.startTimeMs = Date.now();
    this.tierConfig = DEFAULT_GOVERNOR_TIERS[tier] || DEFAULT_GOVERNOR_TIERS.STANDARD;
  }

  recordQuery(_queryIdentifier?: string): number {
    this.queryCount += 1;
    if (this.queryCount > this.tierConfig.maxDbQueriesPerRequest) {
      throw new GovernorQueryLimitExceededError(
        this.tenantId,
        this.tier,
        this.queryCount,
        this.tierConfig.maxDbQueriesPerRequest,
      );
    }
    return this.queryCount;
  }

  checkTimeout(): void {
    const elapsedMs = Date.now() - this.startTimeMs;
    if (elapsedMs > this.tierConfig.maxExecutionTimeMs) {
      throw new GovernorTimeoutExceededError(
        this.tenantId,
        this.tier,
        elapsedMs,
        this.tierConfig.maxExecutionTimeMs,
      );
    }
  }

  getSnapshot() {
    return {
      tenantId: this.tenantId,
      tier: this.tier,
      queriesExecuted: this.queryCount,
      maxQueriesAllowed: this.tierConfig.maxDbQueriesPerRequest,
      elapsedMs: Date.now() - this.startTimeMs,
      maxExecutionTimeMs: this.tierConfig.maxExecutionTimeMs,
    };
  }
}

@Injectable()
export class GovernorService {
  private readonly logger = new Logger(GovernorService.name);
  private readonly tenantBuckets = new Map<string, TenantBucketState>();
  private readonly tenantTierOverrides = new Map<string, TenantTier>();

  setTenantTier(tenantId: string, tier: TenantTier): void {
    this.tenantTierOverrides.set(tenantId, tier);
    const existing = this.tenantBuckets.get(tenantId);
    if (existing) {
      existing.tier = tier;
    }
  }

  getTenantTier(tenantId: string): TenantTier {
    return this.tenantTierOverrides.get(tenantId) || 'STANDARD';
  }

  consumeRequest(tenantId: string, fallbackTier?: TenantTier): RateLimitDecision {
    const now = Date.now();
    const tier = this.tenantTierOverrides.get(tenantId) || fallbackTier || 'STANDARD';
    const config = DEFAULT_GOVERNOR_TIERS[tier] || DEFAULT_GOVERNOR_TIERS.STANDARD;

    let bucket = this.tenantBuckets.get(tenantId);
    if (!bucket) {
      bucket = {
        tokens: config.burstCapacity,
        lastRefillTimestampMs: now,
        tier,
      };
      this.tenantBuckets.set(tenantId, bucket);
    }

    const refillRatePerSec = config.requestsPerMinute / 60;
    const elapsedSeconds = (now - bucket.lastRefillTimestampMs) / 1000;
    bucket.tokens = Math.min(config.burstCapacity, bucket.tokens + elapsedSeconds * refillRatePerSec);
    bucket.lastRefillTimestampMs = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        tier,
        limit: config.requestsPerMinute,
        remaining: Math.floor(bucket.tokens),
        resetSeconds: Math.ceil((config.burstCapacity - bucket.tokens) / refillRatePerSec),
        retryAfterSeconds: 0,
      };
    }

    const waitSeconds = Math.ceil((1 - bucket.tokens) / refillRatePerSec);
    this.logger.warn(
      `[GOVERNOR_THROTTLE] Tenant '${tenantId}' exceeded governor limits for tier '${tier}'. Wait: ${waitSeconds}s`,
    );

    return {
      allowed: false,
      tier,
      limit: config.requestsPerMinute,
      remaining: 0,
      resetSeconds: waitSeconds,
      retryAfterSeconds: Math.max(1, waitSeconds),
    };
  }

  createExecutionBudget(tenantId: string, fallbackTier?: TenantTier): ExecutionBudgetTracker {
    const tier = this.tenantTierOverrides.get(tenantId) || fallbackTier || 'STANDARD';
    return new ExecutionBudgetTracker(tenantId, tier);
  }

  getQuotaStatus(tenantId: string) {
    const tier = this.getTenantTier(tenantId);
    const config = DEFAULT_GOVERNOR_TIERS[tier];
    const bucket = this.tenantBuckets.get(tenantId);
    const availableTokens = bucket ? Math.floor(bucket.tokens) : config.burstCapacity;

    return {
      tenantId,
      tier,
      config,
      availableTokens,
    };
  }

  resetTenant(tenantId: string): void {
    this.tenantBuckets.delete(tenantId);
    this.tenantTierOverrides.delete(tenantId);
  }
}
