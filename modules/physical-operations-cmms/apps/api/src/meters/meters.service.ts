import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateCmmsMeterTriggerV1Schema,
  CreateCmmsMeterV1Schema,
  IngestCmmsTelemetryBatchV1Schema,
  RecordCmmsMeterReadingV1Schema,
  UpdateCmmsMeterTriggerV1Schema,
  type CmmsMeterReadingV1,
  type CmmsMeterTriggerV1,
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
  versionConflict,
} from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

@Injectable()
export class MetersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
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
   * key returns the stored reading. Triggers automatic PM work orders if thresholds or intervals fire.
   */
  async recordReading(
    context: CmmsCommandContext,
    meterId: string,
    raw: unknown,
  ): Promise<{
    readonly meter: CmmsMeterV1;
    readonly reading: CmmsMeterReadingV1;
    readonly replayed: boolean;
    readonly triggeredWorkOrderIds?: readonly string[];
  }> {
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
           (tenant_id, meter_id, value, read_at, source, notes, device_id, payload_ref, request_key, recorded_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          context.principal.tenantId,
          meterId,
          input.value,
          readAt.toISOString(),
          input.source ?? 'MANUAL',
          input.notes ?? null,
          input.deviceId ?? null,
          input.payloadRef ?? null,
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
          source: reading.source,
          latest: isLatest,
          outOfRange:
            (minThreshold !== null && input.value < minThreshold) || (maxThreshold !== null && input.value > maxThreshold),
        },
      });

      // Autonomous trigger evaluation
      const triggeredWorkOrderIds = await this.evaluateTriggersForMeter(client, context, meter, reading);

      return {
        meter: await this.meterRow(client, context.principal, meterId),
        reading,
        replayed: false,
        triggeredWorkOrderIds,
      };
    });
  }

  /**
   * Ingests a batch of telemetry readings from IoT gateways, Connector Hub, or SCADA systems.
   */
  async recordBatchReadings(
    context: CmmsCommandContext,
    raw: unknown,
  ): Promise<{ readonly processedCount: number; readonly triggeredWorkOrderIds: readonly string[] }> {
    const input = parseInput(IngestCmmsTelemetryBatchV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      let processedCount = 0;
      const allTriggeredWoIds: string[] = [];

      for (const item of input.readings) {
        const readAt = item.readAt ? new Date(item.readAt) : new Date();
        const values: unknown[] = [context.principal.tenantId, item.meterId];
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
        if (!meter) {
          const tenantCheck = await client.query<{ department_id: string | null; site_ref: string | null }>(
            `SELECT a.department_id, a.site_ref
               FROM gigalibs_cmms.meters m
               JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
              WHERE m.tenant_id = $1 AND m.id = $2 AND a.archived_at IS NULL`,
            [context.principal.tenantId, item.meterId],
          );
          if (tenantCheck.rows[0]) {
            assertWritableScope(context.principal, {
              departmentId: tenantCheck.rows[0].department_id,
              siteRef: tenantCheck.rows[0].site_ref,
            });
          }
          continue; // Skip inaccessible or deleted meters in batch
        }
        assertWritableScope(context.principal, { departmentId: meter.asset_department_id, siteRef: meter.asset_site_ref });

        // Replay check
        const replay = await client.query(
          `SELECT id FROM gigalibs_cmms.meter_readings WHERE tenant_id = $1 AND meter_id = $2 AND request_key = $3`,
          [context.principal.tenantId, item.meterId, item.requestKey],
        );
        if (replay.rows[0]) continue;

        const lastReadAt = meter.last_read_at ? new Date(meter.last_read_at) : null;
        const isLatest = lastReadAt === null || readAt.getTime() >= lastReadAt.getTime();

        const inserted = await client.query(
          `INSERT INTO gigalibs_cmms.meter_readings
             (tenant_id, meter_id, value, read_at, source, notes, device_id, request_key, recorded_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            context.principal.tenantId,
            item.meterId,
            item.value,
            readAt.toISOString(),
            input.source,
            item.notes ?? null,
            item.deviceId ?? null,
            item.requestKey,
            context.principal.subject,
            context.correlationId,
          ],
        );

        await client.query(
          `UPDATE gigalibs_cmms.meters
              SET last_value = CASE WHEN $3::boolean THEN $4::numeric ELSE last_value END,
                  last_read_at = CASE WHEN $3::boolean THEN $5::timestamptz ELSE last_read_at END,
                  version = version + 1, updated_by = $6, correlation_id = $7, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [
            context.principal.tenantId,
            item.meterId,
            isLatest,
            item.value,
            readAt.toISOString(),
            context.principal.subject,
            context.correlationId,
          ],
        );

        const reading = mapReading(inserted.rows[0]);
        processedCount++;

        const triggered = await this.evaluateTriggersForMeter(client, context, meter, reading);
        allTriggeredWoIds.push(...triggered);
      }

      return { processedCount, triggeredWorkOrderIds: allTriggeredWoIds };
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

  // ─── Meter Triggers CRUD & Policy Evaluation ──────────────────────────────────

  async listTriggers(principal: CmmsPrincipal, meterId?: string): Promise<{ readonly items: readonly CmmsMeterTriggerV1[] }> {
    if (meterId !== undefined) assertUuid(meterId, 'meterId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = [
        't.tenant_id = $1',
        'a.archived_at IS NULL',
        ...scopePredicates(principal, values, 'a.'),
      ];
      if (meterId) {
        values.push(meterId);
        where.push(`t.meter_id = $${values.length}`);
      }
      const sql = `SELECT t.*, jp.title AS job_plan_title
                     FROM gigalibs_cmms.cmms_meter_triggers t
                     JOIN gigalibs_cmms.meters m ON m.tenant_id = t.tenant_id AND m.id = t.meter_id
                     JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
                     LEFT JOIN gigalibs_cmms.cmms_job_plans jp ON jp.tenant_id = t.tenant_id AND jp.id = t.job_plan_id
                    WHERE ${where.join(' AND ')}
                    ORDER BY t.created_at DESC`;
      const result = await client.query(sql, values);
      return { items: result.rows.map(mapTrigger) };
    });
  }

  async createTrigger(context: CmmsCommandContext, raw: unknown): Promise<CmmsMeterTriggerV1> {
    const input = parseInput(CreateCmmsMeterTriggerV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, input.meterId];
      const where = ['m.tenant_id = $1', 'm.id = $2', 'a.archived_at IS NULL', ...scopePredicates(context.principal, values, 'a.')];
      const meterRes = await client.query(
        `SELECT m.id, a.department_id, a.site_ref
           FROM gigalibs_cmms.meters m
           JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
          WHERE ${where.join(' AND ')}`,
        values,
      );
      if (!meterRes.rows[0]) notFound('The meter');
      const meter = meterRes.rows[0];
      assertWritableScope(context.principal, { departmentId: meter.department_id, siteRef: meter.site_ref });

      if (input.jobPlanId) {
        const jp = await client.query(
          `SELECT id FROM gigalibs_cmms.cmms_job_plans WHERE tenant_id = $1 AND id = $2`,
          [context.principal.tenantId, input.jobPlanId],
        );
        if (!jp.rows[0]) notFound('Job plan');
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.cmms_meter_triggers
           (tenant_id, meter_id, trigger_type, threshold_type, threshold_value, interval_value,
            job_plan_id, work_order_title, work_order_priority, is_active,
            created_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)
         RETURNING id`,
        [
          context.principal.tenantId,
          input.meterId,
          input.triggerType,
          input.thresholdType ?? null,
          input.thresholdValue ?? null,
          input.intervalValue ?? null,
          input.jobPlanId ?? null,
          input.workOrderTitle,
          input.workOrderPriority,
          input.isActive,
          context.principal.subject,
          context.correlationId,
        ],
      );
      const id = result.rows[0]!.id;
      await recordMutation(client, context, {
        action: 'CMMS_METER_TRIGGER_CREATED',
        aggregateType: 'CMMS_METER_TRIGGER',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { meterId: input.meterId, triggerType: input.triggerType },
      });
      return (await this.visibleTriggerRow(client, context.principal, id)).trigger;
    });
  }

  async updateTrigger(context: CmmsCommandContext, id: string, raw: unknown): Promise<CmmsMeterTriggerV1> {
    assertUuid(id, 'triggerId');
    const input = parseInput(UpdateCmmsMeterTriggerV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visibleTriggerRow(client, context.principal, id, { lock: true });
      assertWritableScope(context.principal, { departmentId: current.assetDepartmentId, siteRef: current.assetSiteRef });

      const result = await client.query<{ version: number }>(
        `UPDATE gigalibs_cmms.cmms_meter_triggers
            SET threshold_type = $4, threshold_value = $5, interval_value = $6,
                job_plan_id = $7, work_order_title = $8, work_order_priority = $9,
                is_active = $10, version = version + 1, updated_by = $11, correlation_id = $12, updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version`,
        [
          context.principal.tenantId,
          id,
          input.expectedVersion,
          input.thresholdType === undefined ? current.trigger.thresholdType : (input.thresholdType ?? null),
          input.thresholdValue === undefined ? current.trigger.thresholdValue : (input.thresholdValue ?? null),
          input.intervalValue === undefined ? current.trigger.intervalValue : (input.intervalValue ?? null),
          input.jobPlanId === undefined ? current.trigger.jobPlanId : (input.jobPlanId ?? null),
          input.workOrderTitle ?? current.trigger.workOrderTitle,
          input.workOrderPriority ?? current.trigger.workOrderPriority,
          input.isActive === undefined ? current.trigger.isActive : input.isActive,
          context.principal.subject,
          context.correlationId,
        ],
      );
      if (result.rowCount === 0) versionConflict('The meter trigger');
      await recordMutation(client, context, {
        action: 'CMMS_METER_TRIGGER_UPDATED',
        aggregateType: 'CMMS_METER_TRIGGER',
        aggregateId: id,
        aggregateVersion: Number(result.rows[0]!.version),
        payload: {},
      });
      return (await this.visibleTriggerRow(client, context.principal, id)).trigger;
    });
  }

  async deleteTrigger(context: CmmsCommandContext, id: string): Promise<void> {
    assertUuid(id, 'triggerId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.visibleTriggerRow(client, context.principal, id, { lock: true });
      assertWritableScope(context.principal, { departmentId: current.assetDepartmentId, siteRef: current.assetSiteRef });
      const result = await client.query<{ version: number }>(
        `DELETE FROM gigalibs_cmms.cmms_meter_triggers WHERE tenant_id = $1 AND id = $2 RETURNING version`,
        [context.principal.tenantId, id],
      );
      if (result.rowCount === 0) notFound('Meter trigger');
      // WI-OI-120h: the deletion is the trigger's next version (outbox events need a positive version).
      await recordMutation(client, context, {
        action: 'CMMS_METER_TRIGGER_DELETED',
        aggregateType: 'CMMS_METER_TRIGGER',
        aggregateId: id,
        aggregateVersion: result.rows[0]!.version + 1,
        payload: {},
      });
    });
  }

  // ─── Trigger Policy Evaluation ────────────────────────────────────────────────

  private async evaluateTriggersForMeter(
    client: PoolClient,
    context: CmmsCommandContext,
    meter: any,
    reading: CmmsMeterReadingV1,
  ): Promise<readonly string[]> {
    const triggersRes = await client.query(
      `SELECT t.*, jp.title AS job_plan_title
         FROM gigalibs_cmms.cmms_meter_triggers t
         LEFT JOIN gigalibs_cmms.cmms_job_plans jp ON jp.tenant_id = t.tenant_id AND jp.id = t.job_plan_id
        WHERE t.tenant_id = $1 AND t.meter_id = $2 AND t.is_active = true`,
      [context.principal.tenantId, meter.id],
    );

    const generatedWorkOrderIds: string[] = [];

    for (const t of triggersRes.rows) {
      let shouldFire = false;
      if (t.trigger_type === 'THRESHOLD_BREACH') {
        const thresholdVal = t.threshold_value !== null ? Number(t.threshold_value) : null;
        const minThresh = meter.min_threshold !== null ? Number(meter.min_threshold) : null;
        const maxThresh = meter.max_threshold !== null ? Number(meter.max_threshold) : null;

        if (t.threshold_type === 'UPPER') {
          const target = thresholdVal ?? maxThresh;
          if (target !== null && reading.value > target) shouldFire = true;
        } else if (t.threshold_type === 'LOWER') {
          const target = thresholdVal ?? minThresh;
          if (target !== null && reading.value < target) shouldFire = true;
        } else if (t.threshold_type === 'OUT_OF_BOUNDS') {
          if ((minThresh !== null && reading.value < minThresh) || (maxThresh !== null && reading.value > maxThresh)) {
            shouldFire = true;
          }
        }
      } else if (t.trigger_type === 'USAGE_INTERVAL') {
        const interval = Number(t.interval_value);
        const lastVal = t.last_triggered_value !== null ? Number(t.last_triggered_value) : 0;
        if (interval > 0 && reading.value - lastVal >= interval) {
          shouldFire = true;
        }
      }

      if (shouldFire) {
        // Debounce: don't create multiple work orders for the exact same condition if one is already active
        const recentWo = await client.query(
          `SELECT id FROM gigalibs_cmms.work_orders
            WHERE tenant_id = $1 AND meter_trigger_id = $2
              AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')
            LIMIT 1`,
          [context.principal.tenantId, t.id],
        );
        if (recentWo.rows[0]) {
          continue;
        }

        // Fetch job plan tasks if job_plan_id is set
        let tasks: Array<{ label: string; required: boolean }> = [];
        if (t.job_plan_id) {
          const jpTasks = await client.query(
            `SELECT label, required FROM gigalibs_cmms.cmms_job_plan_tasks
              WHERE tenant_id = $1 AND job_plan_id = $2
              ORDER BY sequence ASC`,
            [context.principal.tenantId, t.job_plan_id],
          );
          tasks = jpTasks.rows.map((r) => ({ label: r.label, required: r.required === true }));
        }
        if (tasks.length === 0) {
          tasks = [{ label: `Inspect condition on ${meter.name}`, required: true }];
        }

        const woTitle = `[Condition Alert] ${t.work_order_title} (${meter.name}: ${reading.value} ${meter.unit})`;
        const woType = t.trigger_type === 'THRESHOLD_BREACH' && t.threshold_type === 'UPPER' ? 'EMERGENCY' : 'PREVENTIVE';

        const workOrderId = await this.workOrders.createWithClient(
          client,
          context,
          {
            type: woType,
            priority: t.work_order_priority,
            title: woTitle,
            description: `Automated work order triggered by meter ${meter.name} reading (${reading.value} ${meter.unit}) via source ${reading.source}.`,
            assetId: meter.asset_id,
            jobPlanId: t.job_plan_id ?? undefined,
            requiresSignature: false,
            tasks,
          },
          {
            triggerSource: 'METER_TRIGGER',
            pmScheduleId: null,
            pmOccurrenceAt: null,
            meterTriggerId: t.id,
          },
        );

        // Update trigger last_triggered
        await client.query(
          `UPDATE gigalibs_cmms.cmms_meter_triggers
              SET last_triggered_value = $3, last_triggered_at = now(), version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [context.principal.tenantId, t.id, reading.value],
        );

        await recordMutation(client, context, {
          action: 'CMMS_METER_TRIGGER_FIRED',
          aggregateType: 'CMMS_METER_TRIGGER',
          aggregateId: t.id,
          aggregateVersion: Number(t.version) + 1,
          payload: {
            meterId: meter.id,
            readingValue: reading.value,
            workOrderId,
          },
        });

        generatedWorkOrderIds.push(workOrderId);
      }
    }

    return generatedWorkOrderIds;
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

  private async visibleTriggerRow(
    client: PoolClient,
    principal: CmmsPrincipal,
    id: string,
    options?: { readonly lock?: boolean },
  ): Promise<{
    readonly trigger: CmmsMeterTriggerV1;
    readonly assetDepartmentId: string | null;
    readonly assetSiteRef: string | null;
  }> {
    const values: unknown[] = [principal.tenantId, id];
    const where = [
      't.tenant_id = $1',
      't.id = $2',
      'a.archived_at IS NULL',
      ...scopePredicates(principal, values, 'a.'),
    ];
    const result = await client.query(
      `SELECT t.*, jp.title AS job_plan_title,
              a.department_id AS asset_department_id, a.site_ref AS asset_site_ref
         FROM gigalibs_cmms.cmms_meter_triggers t
         JOIN gigalibs_cmms.meters m ON m.tenant_id = t.tenant_id AND m.id = t.meter_id
         JOIN gigalibs_cmms.assets a ON a.tenant_id = m.tenant_id AND a.id = m.asset_id
         LEFT JOIN gigalibs_cmms.cmms_job_plans jp ON jp.tenant_id = t.tenant_id AND jp.id = t.job_plan_id
        WHERE ${where.join(' AND ')}${options?.lock ? ' FOR UPDATE OF t' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('Meter trigger');
    return {
      trigger: mapTrigger(result.rows[0]),
      assetDepartmentId: result.rows[0].asset_department_id,
      assetSiteRef: result.rows[0].asset_site_ref,
    };
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
    source: row.source ?? 'MANUAL',
    notes: row.notes ?? null,
    deviceId: row.device_id ?? null,
    payloadRef: row.payload_ref ?? null,
    recordedBy: row.recorded_by,
    recordedAt: iso(row.recorded_at),
  };
}

function mapTrigger(row: any): CmmsMeterTriggerV1 {
  return {
    id: row.id,
    meterId: row.meter_id,
    triggerType: row.trigger_type,
    thresholdType: row.threshold_type ?? null,
    thresholdValue: numberOrNull(row.threshold_value),
    intervalValue: numberOrNull(row.interval_value),
    lastTriggeredValue: numberOrNull(row.last_triggered_value),
    lastTriggeredAt: isoOrNull(row.last_triggered_at),
    jobPlanId: row.job_plan_id ?? null,
    jobPlanTitle: row.job_plan_title ?? undefined,
    workOrderTitle: row.work_order_title,
    workOrderPriority: row.work_order_priority,
    isActive: row.is_active === true,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
