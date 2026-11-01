import { randomUUID } from 'node:crypto';
import {
  TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  parseTenantModuleEntitlementsSnapshotV2,
} from '@gigalibs/contracts';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { EntitlementSnapshotInboxService } from './entitlement-snapshot-inbox.service.js';

const DEFAULT_INTERVAL_MS = 300_000;

interface AuthoritativeSnapshotResponse {
  readonly tenantId: string;
  readonly snapshotVersion: number;
  readonly payload: unknown;
}

/**
 * WI-OI-131 B7: pulls authoritative entitlement snapshots when Analytics replica lags control plane.
 */
@Injectable()
export class EntitlementSnapshotReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EntitlementSnapshotReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementSnapshotInboxService,
  ) {}

  onApplicationBootstrap(): void {
    const url = process.env.ANALYTICS_ENTITLEMENT_RECONCILE_URL?.trim();
    if (!url) return;
    const intervalMs = Number.parseInt(process.env.ANALYTICS_ENTITLEMENT_RECONCILE_INTERVAL_MS ?? '', 10);
    const ms = Number.isFinite(intervalMs) && intervalMs >= 30_000 ? intervalMs : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
    this.logger.log(`Entitlement snapshot reconciliation enabled (${ms}ms).`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let repaired = 0;
    try {
      const tenants = await this.db.query<{ tenant_id: string; max_version: string | null }>(
        `SELECT tenant_id, MAX(snapshot_version)::text AS max_version
         FROM gigalibs_analytics.tenant_module_entitlement_replica
         GROUP BY tenant_id`,
      );
      for (const row of tenants.rows) {
        const applied = await this.reconcileTenant(row.tenant_id, Number(row.max_version ?? 0));
        if (applied) repaired += 1;
      }
    } catch (error) {
      this.logger.error(
        'Entitlement snapshot reconciliation pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return repaired;
  }

  async reconcileTenant(tenantId: string, appliedMaxVersion = 0): Promise<boolean> {
    const authoritative = await this.fetchAuthoritativeSnapshot(tenantId);
    if (!authoritative || authoritative.snapshotVersion <= appliedMaxVersion) return false;
    const snapshot = parseTenantModuleEntitlementsSnapshotV2(authoritative.payload);
    const envelope = {
      messageId: randomUUID(),
      tenantId,
      eventType: TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
      aggregateType: 'tenant-module-entitlements',
      aggregateId: tenantId,
      aggregateVersion: snapshot.snapshotVersion,
      correlationId: `reconcile-${tenantId}-${snapshot.snapshotVersion}`,
      causationId: null,
      schemaVersion: 1,
      payload: snapshot,
      occurredAt: new Date().toISOString(),
    };
    const outcome = await this.entitlements.receive(envelope);
    return outcome.status === 'applied';
  }

  private async fetchAuthoritativeSnapshot(tenantId: string): Promise<AuthoritativeSnapshotResponse | null> {
    const baseUrl = process.env.ANALYTICS_ENTITLEMENT_RECONCILE_URL?.trim();
    const token = process.env.ANALYTICS_ENTITLEMENT_RECONCILE_TOKEN?.trim();
    if (!baseUrl || !token) return null;
    const url = new URL(baseUrl.replace('{tenantId}', encodeURIComponent(tenantId)));
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Analytics-Reconcile-Token': token },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    if (
      typeof record.tenantId !== 'string' ||
      !Number.isSafeInteger(record.snapshotVersion) ||
      record.payload === undefined
    ) {
      return null;
    }
    return {
      tenantId: record.tenantId,
      snapshotVersion: record.snapshotVersion as number,
      payload: record.payload,
    };
  }
}
