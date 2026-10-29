import { randomUUID } from 'node:crypto';
import { signPlatformContextToken, type PlatformContextV1 } from '@gigalibs/auth-core';
import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CMMS_API_AUDIENCE, loadIotCmmsRelayConfig } from './relay-config.js';

const BATCH = 20;
const LEASE_SECONDS = 60;
const MAX_ATTEMPTS = 10;

@Injectable()
export class IotCmmsRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IotCmmsRelayService.name);
  private readonly config = loadIotCmmsRelayConfig();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  onApplicationBootstrap(): void {
    if (!this.config.outbound || !this.config.cmmsBaseUrl) {
      this.logger.log('IoT → CMMS relay is not configured; meter and alert facts stay in the IoT outbox.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (!this.config.outbound || !this.config.cmmsBaseUrl || this.running) return 0;
    this.running = true;
    let published = 0;
    try {
      const rows = await this.database.relayCall<Record<string, unknown>>('relay_lease_cmms_events', [
        BATCH,
        LEASE_SECONDS,
      ]);
      for (const row of rows) {
        const outcome = await this.deliverRow(row);
        const retrySeconds = outcome.permanent
          ? null
          : Math.min(5 * 2 ** Math.max(Number(row.attempt_count) - 1, 0), 900);
        await this.database.relayCall('relay_settle_cmms_event', [
          row.tenant_id,
          row.id,
          outcome.ok,
          outcome.code,
          outcome.ok ? 0 : retrySeconds,
          MAX_ATTEMPTS,
        ]);
        if (outcome.ok) published += 1;
        else this.logger.warn(`IoT relay ${row.event_type} ${row.id}: ${outcome.code}`);
      }
    } catch (error) {
      this.logger.error('IoT → CMMS relay pass failed.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
    return published;
  }

  private async deliverRow(row: Record<string, unknown>): Promise<{ ok: boolean; code: string; permanent: boolean }> {
    const tenantId = String(row.tenant_id);
    const eventType = String(row.event_type);
    const payload = row.payload as Record<string, unknown>;
    const token = this.signCmmsToken(tenantId, eventType === 'IOT_METER_READING_V1' ? ['cmms.meters.write'] : ['cmms.assets.write']);
    if (eventType === 'IOT_METER_READING_V1') {
      return this.postJson(
        `${this.config.cmmsBaseUrl}/v1/meters/telemetry/batch`,
        token,
        {
          source: 'IOT_TELEMETRY',
          readings: [
            {
              meterId: payload.meterId,
              value: payload.value,
              requestKey: payload.requestKey,
              readAt: payload.readAt,
            },
          ],
        },
      );
    }
    if (eventType === 'TELEMETRY_ALERT_V1' && payload.assetId && payload.severity === 'CRITICAL') {
      return this.postJson(`${this.config.cmmsBaseUrl}/v1/assets/${payload.assetId}/downtime/start`, token, {
        downtimeType: 'UNPLANNED',
        source: 'IOT_AUTO',
        externalAlertId: payload.alertId,
        notes: `Auto downtime from IoT alert ${payload.metricType}`,
      });
    }
    return { ok: true, code: 'SKIPPED', permanent: true };
  }

  private signCmmsToken(tenantId: string, scopes: readonly string[]): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: PlatformContextV1 = {
      iss: 'gigalibs-control-plane',
      aud: CMMS_API_AUDIENCE,
      sub: 'iot-gateway-relay',
      tenant_id: tenantId,
      session_id: `iot-relay-${tenantId}`,
      auth_version: 1,
      roles: ['IOT_RELAY'],
      granted_scopes: [...scopes],
      persona_type: 'TENANT_ADMIN',
      org_scope: { mode: 'FLAT_TENANT' },
      entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' },
      iat: now,
      exp: now + 120,
      jti: randomUUID(),
    };
    return signPlatformContextToken(claims, this.config.outbound!.privateKey);
  }

  private async postJson(
    url: string,
    bearer: string,
    body: unknown,
  ): Promise<{ ok: boolean; code: string; permanent: boolean }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const code = `HTTP_${response.status}`;
    if (response.ok) return { ok: true, code, permanent: false };
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    return { ok: false, code, permanent };
  }
}
