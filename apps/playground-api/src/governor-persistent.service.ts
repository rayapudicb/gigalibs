/**
 * GovernorPersistentService — Durable Token-Bucket Rate Limiter (Phase 4)
 *
 * Replaces the in-memory Map<tenantId, TenantBucketState> in GovernorService with
 * a PostgreSQL-backed implementation via the tenant_rate_buckets table.
 *
 * Design:
 *   - Token refill uses a leaky-bucket formula recomputed from lastRefillTimestampMs.
 *   - Each consumeRequest uses SELECT ... FOR UPDATE within a Prisma $transaction so
 *     concurrent requests for the same tenant cannot double-spend tokens.
 *   - Tier overrides are stored in the same row; no second table is needed.
 *   - The ExecutionBudgetTracker and error classes remain in-process (per-request
 *     counters do not need cross-replica persistence).
 *
 * Interface is a drop-in superset of GovernorService so guard wiring is unchanged.
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@gigalibs/db';
import {
  DEFAULT_GOVERNOR_TIERS,
  ExecutionBudgetTracker,
  GovernorLimitExceededError,
  type GovernorTierConfig,
  type RateLimitDecision,
  type TenantTier,
} from './governor.service.js';

// ─── Raw DB row ───────────────────────────────────────────────────────────────

interface RateBucketRow {
  tenant_id: string;
  tier: string;
  tokens: number;
  last_refill_timestamp_ms: bigint;
  updated_at: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GovernorPersistentService {
  private readonly logger = new Logger(GovernorPersistentService.name);

  // ── Tier management ────────────────────────────────────────────────────────

  async setTenantTier(tenantId: string, tier: TenantTier): Promise<void> {
    const config = DEFAULT_GOVERNOR_TIERS[tier];
    const nowMs = BigInt(Date.now());
    await prisma.$executeRaw`
      INSERT INTO tenant_rate_buckets (tenant_id, tier, tokens, last_refill_timestamp_ms, updated_at)
      VALUES (${tenantId}, ${tier}, ${config.burstCapacity}::float8, ${nowMs}, NOW())
      ON CONFLICT (tenant_id) DO UPDATE
        SET tier = ${tier},
            tokens = ${config.burstCapacity}::float8,
            last_refill_timestamp_ms = ${nowMs},
            updated_at = NOW()
    `;
  }

  async getTenantTier(tenantId: string): Promise<TenantTier> {
    const rows = await prisma.$queryRaw<Pick<RateBucketRow, 'tier'>[]>`
      SELECT tier FROM tenant_rate_buckets WHERE tenant_id = ${tenantId} LIMIT 1
    `;
    return (rows[0]?.tier as TenantTier | undefined) ?? 'STANDARD';
  }

  // ── Token bucket (atomic) ──────────────────────────────────────────────────

  async consumeRequest(
    tenantId: string,
    fallbackTier: TenantTier = 'STANDARD',
  ): Promise<RateLimitDecision> {
    return prisma.$transaction(async (tx) => {
      // Lock the row for this tenant to prevent concurrent token double-spend
      const rows = await tx.$queryRaw<RateBucketRow[]>`
        SELECT * FROM tenant_rate_buckets
        WHERE tenant_id = ${tenantId}
        FOR UPDATE
      `;

      const tier: TenantTier =
        (rows[0]?.tier as TenantTier | undefined) ?? fallbackTier;
      const config: GovernorTierConfig =
        DEFAULT_GOVERNOR_TIERS[tier] ?? DEFAULT_GOVERNOR_TIERS['STANDARD'];
      const nowMs = Date.now();

      let currentTokens: number;

      if (rows.length === 0) {
        // First request — create bucket at burst capacity minus 1 (consuming one token now)
        currentTokens = config.burstCapacity - 1;
        await tx.$executeRaw`
          INSERT INTO tenant_rate_buckets
            (tenant_id, tier, tokens, last_refill_timestamp_ms, updated_at)
          VALUES
            (${tenantId}, ${tier}, ${currentTokens}::float8, ${BigInt(nowMs)}, NOW())
          ON CONFLICT DO NOTHING
        `;
        return this.allowedDecision(tier, config, currentTokens);
      }

      const row = rows[0]!;
      const elapsedSeconds =
        (nowMs - Number(row.last_refill_timestamp_ms)) / 1_000;
      const refillRate = config.requestsPerMinute / 60;
      const refilled = Math.min(
        config.burstCapacity,
        row.tokens + elapsedSeconds * refillRate,
      );

      if (refilled < 1) {
        const waitSeconds = Math.ceil((1 - refilled) / refillRate);
        this.logger.warn(
          `[GOVERNOR_THROTTLE] tenant '${tenantId}' (${tier}) throttled — retry in ${waitSeconds}s`,
        );
        // Update refilled tokens even on throttle (time passed = tokens accrued)
        await tx.$executeRaw`
          UPDATE tenant_rate_buckets
          SET tokens = ${refilled}::float8,
              last_refill_timestamp_ms = ${BigInt(nowMs)},
              updated_at = NOW()
          WHERE tenant_id = ${tenantId}
        `;
        return this.throttledDecision(tier, config, refilled, refillRate);
      }

      currentTokens = refilled - 1;
      await tx.$executeRaw`
        UPDATE tenant_rate_buckets
        SET tokens = ${currentTokens}::float8,
            last_refill_timestamp_ms = ${BigInt(nowMs)},
            updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `;
      return this.allowedDecision(tier, config, currentTokens);
    });
  }

  // ── Execution budget (per-request, in-process) ─────────────────────────────

  async createExecutionBudget(
    tenantId: string,
    fallbackTier: TenantTier = 'STANDARD',
  ): Promise<ExecutionBudgetTracker> {
    const tier = await this.getTenantTier(tenantId);
    return new ExecutionBudgetTracker(tenantId, tier || fallbackTier);
  }

  async getQuotaStatus(tenantId: string) {
    const rows = await prisma.$queryRaw<RateBucketRow[]>`
      SELECT * FROM tenant_rate_buckets WHERE tenant_id = ${tenantId} LIMIT 1
    `;
    const tier: TenantTier =
      (rows[0]?.tier as TenantTier | undefined) ?? 'STANDARD';
    const config = DEFAULT_GOVERNOR_TIERS[tier] ?? DEFAULT_GOVERNOR_TIERS['STANDARD'];

    return {
      tenantId,
      tier,
      config,
      availableTokens: rows[0] ? Math.floor(rows[0].tokens) : config.burstCapacity,
    };
  }

  async resetTenant(tenantId: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM tenant_rate_buckets WHERE tenant_id = ${tenantId}
    `;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private allowedDecision(
    tier: TenantTier,
    config: GovernorTierConfig,
    remainingTokens: number,
  ): RateLimitDecision {
    const refillRate = config.requestsPerMinute / 60;
    return {
      allowed: true,
      tier,
      limit: config.requestsPerMinute,
      remaining: Math.floor(remainingTokens),
      resetSeconds: Math.ceil(
        (config.burstCapacity - remainingTokens) / refillRate,
      ),
      retryAfterSeconds: 0,
    };
  }

  private throttledDecision(
    tier: TenantTier,
    config: GovernorTierConfig,
    currentTokens: number,
    refillRate: number,
  ): RateLimitDecision {
    const waitSeconds = Math.max(1, Math.ceil((1 - currentTokens) / refillRate));
    return {
      allowed: false,
      tier,
      limit: config.requestsPerMinute,
      remaining: 0,
      resetSeconds: waitSeconds,
      retryAfterSeconds: waitSeconds,
    };
  }
}

export { GovernorLimitExceededError };
