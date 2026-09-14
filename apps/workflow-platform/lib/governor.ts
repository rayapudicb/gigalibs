/**
 * Governor Limits & Noisy-Neighbor Throttling Engine (Next.js / Execution Plane)
 *
 * Provides identical enterprise multi-tenant rate limiting and execution budget semantics.
 */

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

interface TenantBucketState {
  tokens: number;
  lastRefillTimestampMs: number;
  tier: TenantTier;
}

export class NextGovernorStore {
  private static instance: NextGovernorStore;
  private readonly tenantBuckets = new Map<string, TenantBucketState>();
  private readonly tenantTierOverrides = new Map<string, TenantTier>();

  static getInstance(): NextGovernorStore {
    if (!NextGovernorStore.instance) {
      NextGovernorStore.instance = new NextGovernorStore();
    }
    return NextGovernorStore.instance;
  }

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

  consume(tenantId: string, fallbackTier?: TenantTier): RateLimitDecision {
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
    return {
      allowed: false,
      tier,
      limit: config.requestsPerMinute,
      remaining: 0,
      resetSeconds: waitSeconds,
      retryAfterSeconds: Math.max(1, waitSeconds),
    };
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

  reset(tenantId: string): void {
    this.tenantBuckets.delete(tenantId);
    this.tenantTierOverrides.delete(tenantId);
  }
}

export const nextGovernorStore = NextGovernorStore.getInstance();
