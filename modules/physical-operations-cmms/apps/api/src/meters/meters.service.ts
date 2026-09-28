import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateCmmsMeterV1Schema,
  RecordCmmsMeterReadingV1Schema,
  type CmmsMeterReadingV1,
  type CmmsMeterV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import {
  assertUuid,
  iso,
  isoOrNull,
  notFound,
  numberOrNull,
  parseInput,
  recordMutation,
  translateConstraint,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

@Injectable()
export class MetersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
  ) {}

  /** Meters on assets the caller can see, optionally for one asset. */
  async list(principal: CmmsPrincipal, assetId?: string): Promise<{ readonly items: readonly CmmsMeterV1[] }> {
    if (assetId !== undefined) assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['m.tenant_id = $1', 'a.archived_at IS NULL', ...scopePredicates(principal, values, 'a.')];
      if (assetId) {
        values.push(assetId);
        where.push(`m.asset_id = $${values.length}`);
      }
      const result = await client.query(
        `SELECT m.*, a.name AS asset_name
           FROM gigalibs_cmms.meters m
           JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.name ASC, m.name ASC
          LIMIT 500`,
        values,
      );
      return { items: result.rows.map(mapMeter) };
    });
  }

  async create(context: CmmsCommandContext, raw: unknown): Promise<CmmsMeterV1> {
    const input = parseInput(CreateCmmsMeterV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef });
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.meters
             (tenant_id, asset_id, name, unit, reading_type, min_threshold, max_threshold, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
           RETURNING id`,
          [
            context.principal.tenantId,
            input.assetId,
            input.name,
            input.unit,
            input.readingType,
            input.minThreshold ?? null,
            input.maxThreshold ?? null,
            context.principal.subject,
            context.correlationId,
          ],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_METER_CREATED',
          aggregateType: 'CMMS_METER',
          aggregateId: id,
          aggregateVersion: 1,
          payload: { assetId: input.assetId, unit: input.unit, readingType: input.readingType },
        });
        return this.meterRow(client, context.principal, id);
      } catch (error) {
        translateConstraint(error, { unique: 'This asset already has a meter with that name.' });
      }
    });
  }

  /**
   * Stores one reading. Readings may arrive out of order: every reading is kept, but only a reading at or
   * after the latest replaces the meter's latest value, and a counter may not run backwards. A repeated request
   * key returns the stored reading.
   */
  async recordReading(
    context: CmmsCommandContext,
    meterId: string,
    raw: unknown,
  ): Promise<{ readonly meter: CmmsMeterV1; readonly reading: CmmsMeterReadingV1; readonly replayed: boolean }> {
    assertUuid(meterId, 'meterId');
    const input = parseInput(RecordCmmsMeterReadingV1Schema, raw);
    const readAt = input.readAt ? new Date(input.readAt) : new Date();
    if (readAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw new BadRequestException({ code: 'CMMS_READING_IN_FUTURE', message: 'A reading cannot be dated in the future.' });
    }
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, meterId];
      const where = ['m.tenant_id = $1', 'm.id = $2', 'a.archived_at IS NULL', ...scopePredicates(context.principal, values, 'a.')];
      const locked = await client.query(
        `SELECT m.*, a.department_id AS asset_department_id, a.site_ref AS asset_site_ref
           FROM gigalibs_cmms.meters m
           JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
          WHERE ${where.join(' AND ')}
          FOR UPDATE OF m`,
        values,
      );
      const meter = locked.rows[0];
      if (!meter) notFound('The meter');
      assertWritableScope(context.principal, { departmentId: meter.asset_department_id, siteRef: meter.asset_site_ref });

      const replay = await client.query(
        `SELECT * FROM gigalibs_cmms.meter_readings WHERE tenant_id = $1 AND meter_id = $2 AND request_key = $3`,
        [context.principal.tenantId, meterId, input.requestKey],
      );
      if (replay.rows[0]) {
        return { meter: await this.meterRow(client, context.principal, meterId), reading: mapReading(replay.rows[0]), replayed: true };
      }

      const lastReadAt = meter.last_read_at ? new Date(meter.last_read_at) : null;
      const isLatest = lastReadAt === null || readAt.getTime() >= lastReadAt.getTime();
      if (meter.reading_type === 'COUNTER') {
        const neighbours = await client.query<{ before_value: string | null; after_value: string | null }>(
          `SELECT
             (SELECT value FROM gigalibs_cmms.meter_readings
               WHERE tenant_id = $1 AND meter_id = $2 AND read_at <= $3 ORDER BY read_at DESC LIMIT 1) AS before_value,
             (SELECT value FROM gigalibs_cmms.meter_readings
               WHERE tenant_id = $1 AND meter_id = $2 AND read_at > $3 ORDER BY read_at ASC LIMIT 1) AS after_value`,
          [context.principal.tenantId, meterId, readAt.toISOString()],
        );
        const before = numberOrNull(neighbours.rows[0]?.before_value);
        const after = numberOrNull(neighbours.rows[0]?.after_value);
        if ((before !== null && input.value < before) || (after !== null && input.value > after)) {
          throw new BadRequestException({
            code: 'CMMS_COUNTER_REGRESSION',
            message: 'A counter reading must not be lower than an earlier reading or higher than a later one.',
          });
        }
      }

      const inserted = await client.query(
        `INSERT INTO gigalibs_cmms.meter_readings
           (tenant_id, meter_id, value, read_at, notes, request_key, recorded_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          context.principal.tenantId,
          meterId,
          input.value,
          readAt.toISOString(),
          input.notes ?? null,
          input.requestKey,
          context.principal.subject,
          context.correlationId,
        ],
      );
      const updated = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.meters
            SET last_value = CASE WHEN $3::boolean THEN $4::numeric ELSE last_value END,
                last_read_at = CASE WHEN $3::boolean THEN $5::timestamptz ELSE last_read_at END,
                version = version + 1, updated_by = $6, correlation_id = $7, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING version`,
        [
          context.principal.tenantId,
          meterId,
          isLatest,
          input.value,
          readAt.toISOString(),
          context.principal.subject,
          context.correlationId,
        ],
      );
      const reading = mapReading(inserted.rows[0]);
      const minThreshold = numberOrNull(meter.min_threshold);
      const maxThreshold = numberOrNull(meter.max_threshold);
      await recordMutation(client, context, {
        action: 'CMMS_METER_READING_RECORDED',
        aggregateType: 'CMMS_METER',
        aggregateId: meterId,
        aggregateVersion: Number(updated.rows[0]!.version),
        payload: {
          readingId: reading.id,
          assetId: meter.asset_id,
          value: input.value,
          readAt: reading.readAt,
          latest: isLatest,
          outOfRange:
            (minThreshold !== null && input.value < minThreshold) || (maxThreshold !== null && input.value > maxThreshold),
        },
      });
      return { meter: await this.meterRow(client, context.principal, meterId), reading, replayed: false };
    });
  }

  async readings(principal: CmmsPrincipal, meterId: string): Promise<{ readonly items: readonly CmmsMeterReadingV1[] }> {
    assertUuid(meterId, 'meterId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.meterRow(client, principal, meterId);
      const result = await client.query(
        `SELECT * FROM gigalibs_cmms.meter_readings WHERE tenant_id = $1 AND meter_id = $2
          ORDER BY read_at DESC, id DESC LIMIT 200`,
        [principal.tenantId, meterId],
      );
      return { items: result.rows.map(mapReading) };
    });
  }

  private async meterRow(client: PoolClient, principal: CmmsPrincipal, meterId: string): Promise<CmmsMeterV1> {
    const values: unknown[] = [principal.tenantId, meterId];
    const where = ['m.tenant_id = $1', 'm.id = $2', ...scopePredicates(principal, values, 'a.')];
    const result = await client.query(
      `SELECT m.*, a.name AS asset_name
         FROM gigalibs_cmms.meters m
         JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
        WHERE ${where.join(' AND ')}`,
      values,
    );
    if (!result.rows[0]) notFound('The meter');
    return mapMeter(result.rows[0]);
  }
}

function mapMeter(row: any): CmmsMeterV1 {
  const lastValue = numberOrNull(row.last_value);
  const minThreshold = numberOrNull(row.min_threshold);
  const maxThreshold = numberOrNull(row.max_threshold);
  return {
    id: row.id,
    assetId: row.asset_id,
    assetName: row.asset_name ?? null,
    name: row.name,
    unit: row.unit,
    readingType: row.reading_type,
    minThreshold,
    maxThreshold,
    lastValue,
    lastReadAt: isoOrNull(row.last_read_at),
    condition:
      lastValue === null
        ? 'UNKNOWN'
        : minThreshold !== null && lastValue < minThreshold
          ? 'BELOW_MINIMUM'
          : maxThreshold !== null && lastValue > maxThreshold
            ? 'ABOVE_MAXIMUM'
            : 'NORMAL',
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapReading(row: any): CmmsMeterReadingV1 {
  return {
    id: row.id,
    meterId: row.meter_id,
    value: Number(row.value),
    readAt: iso(row.read_at),
    source: 'MANUAL',
    notes: row.notes ?? null,
    recordedBy: row.recorded_by,
    recordedAt: iso(row.recorded_at),
  };
}
