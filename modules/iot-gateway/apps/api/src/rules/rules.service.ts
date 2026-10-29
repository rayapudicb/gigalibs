import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IotPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(200),
  metricType: z.string().min(1).max(80),
  conditionType: z.enum(['THRESHOLD', 'RATE_OF_CHANGE', 'CONSECUTIVE_READINGS']),
  thresholdValue: z.number(),
  thresholdUnit: z.string().min(1).max(32),
  severity: z.enum(['WARNING', 'CRITICAL']),
  scopeMode: z.enum(['ALL', 'ASSET', 'CLASSIFICATION']).default('ALL'),
  scopeAssetId: z.string().uuid().optional(),
  scopeClassification: z.string().max(80).optional(),
  consecutiveCount: z.number().int().min(1).max(100).optional(),
  windowMs: z.number().int().min(1000).max(86400000).optional(),
});

@Injectable()
export class RulesService {
  constructor(private readonly database: DatabaseService) {}

  list(principal: IotPrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, name, metric_type, condition_type, threshold_value, threshold_unit, severity, scope_mode, enabled
           FROM gigalibs_iot.iot_condition_rules WHERE tenant_id = $1 ORDER BY name ASC`,
        [principal.tenantId],
      );
      return { items: result.rows };
    });
  }

  create(principal: IotPrincipal, raw: unknown) {
    const body = CreateRuleSchema.parse(raw ?? {});
    const id = randomUUID();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_iot.iot_condition_rules
           (tenant_id, id, name, metric_type, condition_type, threshold_value, threshold_unit, severity,
            scope_mode, scope_asset_id, scope_classification, consecutive_count, window_ms, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [
          principal.tenantId,
          id,
          body.name,
          body.metricType,
          body.conditionType,
          body.thresholdValue,
          body.thresholdUnit,
          body.severity,
          body.scopeMode,
          body.scopeAssetId ?? null,
          body.scopeClassification ?? null,
          body.consecutiveCount ?? null,
          body.windowMs ?? null,
          principal.subject,
        ],
      );
      return { id, preview: this.preview(body) };
    });
  }

  private preview(body: z.infer<typeof CreateRuleSchema>): string {
    const target =
      body.scopeMode === 'ASSET'
        ? 'the selected asset'
        : body.scopeMode === 'CLASSIFICATION'
          ? `assets tagged as ${body.scopeClassification ?? '…'}`
          : 'any bound asset';
    if (body.conditionType === 'CONSECUTIVE_READINGS') {
      return `Trigger ${body.severity} alert when ${body.metricType} exceeds ${body.thresholdValue} ${body.thresholdUnit} for ${body.consecutiveCount ?? 1} consecutive readings on ${target}.`;
    }
    if (body.conditionType === 'RATE_OF_CHANGE') {
      return `Trigger ${body.severity} alert when ${body.metricType} rate of change exceeds ${body.thresholdValue} ${body.thresholdUnit} on ${target}.`;
    }
    return `Trigger ${body.severity} alert when ${body.metricType} exceeds ${body.thresholdValue} ${body.thresholdUnit} on ${target}.`;
  }
}
