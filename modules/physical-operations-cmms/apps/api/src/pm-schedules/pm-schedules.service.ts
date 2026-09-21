import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

export interface PmSchedule {
  id: string;
  name: string;
  description: string | null;
  assetId: string;
  locationId: string | null;
  categoryId: string | null;
  triggerType: string;
  cronExpression: string | null;
  cronTimezone: string;
  meterId: string | null;
  meterThreshold: number | null;
  woTitleTemplate: string | null;
  woDescription: string | null;
  woPriority: string;
  assignedTo: string | null;
  assignedTeams: string[];
  formSchemaId: string | null;
  estimatedDuration: number | null;
  workflowDagId: string | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
  nextDueAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PmSchedulesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workOrdersService: WorkOrdersService,
  ) {}

  async list(tenantId: string, assetId?: string, departmentIds?: readonly string[]): Promise<PmSchedule[]> {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }
    if (assetId) {
      conditions.push(`asset_id = $${idx++}`);
      values.push(assetId);
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, description, asset_id, location_id, category_id,
              trigger_type, cron_expression, cron_timezone, meter_id, meter_threshold,
              wo_title_template, wo_description, wo_priority, assigned_to, assigned_teams,
              form_schema_id, estimated_duration, workflow_dag_id, is_active,
              last_triggered_at, next_due_at, version, created_by, created_at, updated_at
       FROM gigalibs_cmms.pm_schedules
       WHERE ${conditions.join(' AND ')}
       ORDER BY next_due_at ASC NULLS LAST, name ASC`,
      values,
    );
    return result.rows.map(mapPm);
  }

  async getOne(tenantId: string, id: string): Promise<PmSchedule> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, name, description, asset_id, location_id, category_id,
              trigger_type, cron_expression, cron_timezone, meter_id, meter_threshold,
              wo_title_template, wo_description, wo_priority, assigned_to, assigned_teams,
              form_schema_id, estimated_duration, workflow_dag_id, is_active,
              last_triggered_at, next_due_at, version, created_by, created_at, updated_at
       FROM gigalibs_cmms.pm_schedules WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`PM Schedule ${id} not found.`);
    return mapPm(result.rows[0]);
  }

  async create(
    tenantId: string,
    actorId: string,
    data: {
      name: string;
      description?: string;
      assetId: string;
      locationId?: string;
      categoryId?: string;
      triggerType: 'CALENDAR' | 'METER_THRESHOLD' | 'BOTH';
      cronExpression?: string;
      meterId?: string;
      meterThreshold?: number;
      woTitleTemplate?: string;
      woDescription?: string;
      woPriority?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
      assignedTo?: string;
      formSchemaId?: string;
      estimatedDuration?: number;
      workflowDagId?: string;
      nextDueAt?: string;
    },
  ): Promise<PmSchedule> {
    await this.ensureTenant(tenantId);
    const id = randomUUID();

    const result = await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.pm_schedules (
         tenant_id, id, name, description, asset_id, location_id, category_id,
         trigger_type, cron_expression, meter_id, meter_threshold,
         wo_title_template, wo_description, wo_priority, assigned_to,
         form_schema_id, estimated_duration, workflow_dag_id, next_due_at, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        tenantId, id, data.name.trim(), data.description ?? null, data.assetId,
        data.locationId ?? null, data.categoryId ?? null, data.triggerType,
        data.cronExpression ?? null, data.meterId ?? null, data.meterThreshold ?? null,
        data.woTitleTemplate ?? `PM: ${data.name}`, data.woDescription ?? null,
        data.woPriority ?? 'MEDIUM', data.assignedTo ?? null, data.formSchemaId ?? null,
        data.estimatedDuration ?? null, data.workflowDagId ?? null,
        data.nextDueAt ?? null, actorId,
      ],
    );

    return mapPm(result.rows[0]);
  }

  async triggerWorkOrder(tenantId: string, id: string, actorId: string) {
    const pm = await this.getOne(tenantId, id);

    const wo = await this.workOrdersService.create(tenantId, actorId, {
      type: 'PREVENTIVE',
      priority: (pm.woPriority as any) ?? 'MEDIUM',
      title: pm.woTitleTemplate || `PM: ${pm.name}`,
      description: pm.woDescription ?? undefined,
      assetId: pm.assetId,
      locationId: pm.locationId ?? undefined,
      categoryId: pm.categoryId ?? undefined,
      assignedTo: pm.assignedTo ?? undefined,
      formSchemaId: pm.formSchemaId ?? undefined,
      estimatedDuration: pm.estimatedDuration ?? undefined,
      triggerSource: 'PM_SCHEDULE',
    });

    const now = new Date().toISOString();
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_cmms.pm_schedules
       SET last_triggered_at = $1, version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $2 AND id = $3`,
      [now, tenantId, id],
    );

    return { message: 'Preventive maintenance work order triggered successfully.', workOrder: wo };
  }

  private async ensureTenant(tenantId: string): Promise<void> {
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_cmms.module_tenants (id, oidc_issuer, external_tenant_subject)
       VALUES ($1, 'system', $1) ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
  }
}

function mapPm(row: any): PmSchedule {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    assetId: row.asset_id,
    locationId: row.location_id ?? null,
    categoryId: row.category_id ?? null,
    triggerType: row.trigger_type,
    cronExpression: row.cron_expression ?? null,
    cronTimezone: row.cron_timezone ?? 'UTC',
    meterId: row.meter_id ?? null,
    meterThreshold: row.meter_threshold ? Number(row.meter_threshold) : null,
    woTitleTemplate: row.wo_title_template ?? null,
    woDescription: row.wo_description ?? null,
    woPriority: row.wo_priority,
    assignedTo: row.assigned_to ?? null,
    assignedTeams: row.assigned_teams ?? [],
    formSchemaId: row.form_schema_id ?? null,
    estimatedDuration: row.estimated_duration ? Number(row.estimated_duration) : null,
    workflowDagId: row.workflow_dag_id ?? null,
    isActive: row.is_active,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at).toISOString() : null,
    nextDueAt: row.next_due_at ? new Date(row.next_due_at).toISOString() : null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
