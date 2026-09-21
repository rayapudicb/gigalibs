import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type {
  CreateWorkOrder,
  UpdateWorkOrder,
  WorkOrderSearch,
} from './work-orders.schemas.js';

export type WoStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type WoPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
export type WoType = 'REACTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY';

const VALID_STATUSES = new Set<WoStatus>(['OPEN','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED']);
const VALID_TRANSITIONS: Record<WoStatus, WoStatus[]> = {
  OPEN:        ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD:     ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
};

export interface WorkOrder {
  id: string;
  woNumber: string;
  type: string;
  priority: string;
  status: string;
  title: string;
  description: string | null;
  assetId: string | null;
  locationId: string | null;
  categoryId: string | null;
  assignedTo: string | null;
  additionalWorkers: string[];
  assignedTeams: string[];
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  requiredSignature: boolean;
  signatureData: string | null;
  feedback: string | null;
  triggerSource: string;
  formSchemaId: string | null;
  formData: Record<string, unknown> | null;
  estimatedDuration: number | null;
  auditReceipt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly db: DatabaseService) {}

  async search(
    tenantId: string,
    params: WorkOrderSearch,
    departmentIds?: readonly string[],
  ): Promise<{ data: WorkOrder[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['tenant_id = $1', 'NOT is_deleted'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    // Department scope predicate — applied when caller operates in SCOPED_DEPARTMENTS mode.
    // Rows with department_id = NULL are treated as enterprise-wide and always visible.
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }

    if (params.status) { conditions.push(`status = $${idx++}`); values.push(params.status); }
    if (params.priority) { conditions.push(`priority = $${idx++}`); values.push(params.priority); }
    if (params.assetId) { conditions.push(`asset_id = $${idx++}`); values.push(params.assetId); }
    if (params.assignedTo) { conditions.push(`assigned_to = $${idx++}`); values.push(params.assignedTo); }
    if (params.q) { conditions.push(`title ILIKE $${idx++}`); values.push(`%${params.q}%`); }
    if (params.dateFrom) { conditions.push(`due_date >= $${idx++}`); values.push(params.dateFrom); }
    if (params.dateTo) { conditions.push(`due_date <= $${idx++}`); values.push(params.dateTo); }

    const where = conditions.join(' AND ');
    const [countResult, dataResult] = await Promise.all([
      this.db.queryWithTenant<{ total: string }>(tenantId, `SELECT COUNT(*) AS total FROM gigalibs_cmms.work_orders WHERE ${where}`, values),
      this.db.queryWithTenant(
        tenantId,
        `SELECT ${WO_COLUMNS} FROM gigalibs_cmms.work_orders WHERE ${where}
         ORDER BY
           CASE priority WHEN 'EMERGENCY' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
           due_date ASC NULLS LAST
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, pageSize, offset],
      ),
    ]);

    return { data: dataResult.rows.map(mapWo), total: Number(countResult.rows[0]?.total ?? 0), page, pageSize };
  }

  async getUrgent(tenantId: string, departmentIds?: readonly string[]): Promise<WorkOrder[]> {
    const conditions: string[] = [
      `tenant_id = $1`,
      `priority IN ('HIGH','EMERGENCY')`,
      `status NOT IN ('COMPLETED','CANCELLED')`,
      `NOT is_deleted`,
    ];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (departmentIds && departmentIds.length > 0) {
      const placeholders = departmentIds.map(() => `$${idx++}`).join(', ');
      conditions.push(`(department_id IS NULL OR department_id IN (${placeholders}))`);
      for (const d of departmentIds) values.push(d);
    }
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT ${WO_COLUMNS} FROM gigalibs_cmms.work_orders
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE priority WHEN 'EMERGENCY' THEN 0 ELSE 1 END, due_date ASC NULLS LAST`,
      values,
    );
    return result.rows.map(mapWo);
  }

  async getOne(tenantId: string, id: string): Promise<WorkOrder> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT ${WO_COLUMNS} FROM gigalibs_cmms.work_orders WHERE tenant_id=$1 AND id=$2 AND NOT is_deleted`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException(`Work order ${id} not found.`);
    return mapWo(result.rows[0]);
  }

  async getHistory(tenantId: string, id: string): Promise<Array<{
    id: string;
    changedBy: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
  }>> {
    await this.getOne(tenantId, id);
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT id, changed_by, field_name, old_value, new_value, created_at
       FROM gigalibs_cmms.wo_history
       WHERE tenant_id = $1 AND wo_id = $2
       ORDER BY created_at DESC, id DESC`,
      [tenantId, id],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      changedBy: row.changed_by,
      fieldName: row.field_name,
      oldValue: row.old_value ?? null,
      newValue: row.new_value ?? null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async create(
    tenantId: string,
    actorId: string,
    data: CreateWorkOrder,
  ): Promise<WorkOrder> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      await this.ensureTenant(client, tenantId);
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`cmms-work-order-number:${tenantId}`],
      );
      const id = randomUUID();
      const woNumber = await this.generateWoNumber(client, tenantId);
      const result = await client.query(
        `INSERT INTO gigalibs_cmms.work_orders (
           tenant_id, id, wo_number, type, priority, status, title, description,
           asset_id, location_id, category_id, assigned_to, due_date,
           required_signature, form_schema_id, estimated_duration,
           trigger_source, trigger_rule_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING ${WO_COLUMNS}`,
        [
          tenantId, id, woNumber,
          data.type,
          data.priority ?? 'NONE',
          data.type === 'EMERGENCY' ? 'IN_PROGRESS' : 'OPEN',
          data.title,
          data.description ?? null,
          data.assetId ?? null,
          data.locationId ?? null,
          data.categoryId ?? null,
          data.assignedTo ?? null,
          data.dueDate ?? null,
          data.requiredSignature ?? false,
          data.formSchemaId ?? null,
          data.estimatedDuration ?? null,
          data.triggerSource ?? 'MANUAL',
          data.triggerRuleId ?? null,
          actorId,
        ],
      );
      await this.writeHistory(client, tenantId, id, actorId, 'status', null, result.rows[0].status);
      return mapWo(result.rows[0]);
    });
  }

  async changeStatus(
    tenantId: string,
    id: string,
    actorId: string,
    newStatus: WoStatus,
    expectedVersion: number,
    feedback?: string,
    signatureData?: string,
  ): Promise<WorkOrder> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const existingResult = await client.query(
        `SELECT ${WO_COLUMNS} FROM gigalibs_cmms.work_orders
         WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted FOR UPDATE`,
        [tenantId, id],
      );
      if (!existingResult.rows[0]) throw new NotFoundException(`Work order ${id} not found.`);
      const existing = mapWo(existingResult.rows[0]);
      if (existing.version !== expectedVersion) {
        throw new ConflictException('Work order changed; reload before retrying.');
      }
      const allowed = VALID_TRANSITIONS[existing.status as WoStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestException(`Cannot transition work order from ${existing.status} to ${newStatus}.`);
      }
      if (newStatus === 'COMPLETED' && existing.requiredSignature && !signatureData) {
        throw new BadRequestException('Signature is required to complete this work order.');
      }

      const now = new Date().toISOString();
      const completedAt = newStatus === 'COMPLETED' ? now : null;
      const startedAt = newStatus === 'IN_PROGRESS' && !existing.startedAt ? now : existing.startedAt;
      const result = await client.query(
        `UPDATE gigalibs_cmms.work_orders SET
           status = $1, feedback = COALESCE($2, feedback),
           signature_data = COALESCE($3, signature_data),
           completed_at = COALESCE($4::timestamptz, completed_at),
           started_at = COALESCE($5::timestamptz, started_at),
           version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $6 AND id = $7 AND version = $8 AND NOT is_deleted
         RETURNING ${WO_COLUMNS}`,
        [newStatus, feedback ?? null, signatureData ?? null, completedAt, startedAt, tenantId, id, expectedVersion],
      );
      if (!result.rows[0]) throw new ConflictException('Work order changed; reload before retrying.');
      await this.writeHistory(client, tenantId, id, actorId, 'status', existing.status, newStatus);
      return mapWo(result.rows[0]);
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorId: string,
    data: UpdateWorkOrder,
  ): Promise<WorkOrder> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const existingResult = await client.query(
        `SELECT ${WO_COLUMNS} FROM gigalibs_cmms.work_orders
         WHERE tenant_id = $1 AND id = $2 AND NOT is_deleted FOR UPDATE`,
        [tenantId, id],
      );
      if (!existingResult.rows[0]) throw new NotFoundException(`Work order ${id} not found.`);
      const existing = mapWo(existingResult.rows[0]);
      if (existing.version !== data.expectedVersion) {
        throw new ConflictException('Work order changed; reload before retrying.');
      }
      const result = await client.query(
        `UPDATE gigalibs_cmms.work_orders SET
           title = $1, description = $2, priority = $3, assigned_to = $4,
           due_date = $5, form_data = $6::jsonb, estimated_duration = $7,
           version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $8 AND id = $9 AND version = $10 AND NOT is_deleted
         RETURNING ${WO_COLUMNS}`,
        [
          data.title ?? existing.title,
          data.description === undefined ? existing.description : data.description,
          data.priority ?? existing.priority,
          data.assignedTo === undefined ? existing.assignedTo : data.assignedTo,
          data.dueDate === undefined ? existing.dueDate : data.dueDate,
          JSON.stringify(data.formData ?? existing.formData ?? {}),
          data.estimatedDuration === undefined ? existing.estimatedDuration : data.estimatedDuration,
          tenantId, id, data.expectedVersion,
        ],
      );
      if (!result.rows[0]) throw new ConflictException('Work order changed; reload before retrying.');
      await this.writeHistory(client, tenantId, id, actorId, 'update', null, null);
      return mapWo(result.rows[0]);
    });
  }

  private async generateWoNumber(client: PoolClient, tenantId: string): Promise<string> {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM gigalibs_cmms.work_orders WHERE tenant_id = $1`,
      [tenantId],
    );
    const seq = String(Number(result.rows[0]?.count ?? 0) + 1).padStart(4, '0');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `WO-${today}-${seq}`;
  }

  private async writeHistory(
    client: PoolClient,
    tenantId: string,
    woId: string,
    actorId: string,
    fieldName: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO gigalibs_cmms.wo_history (tenant_id, id, wo_id, changed_by, field_name, old_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, randomUUID(), woId, actorId, fieldName, oldValue, newValue],
    );
  }

  private async ensureTenant(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(
      `INSERT INTO gigalibs_cmms.module_tenants (id, oidc_issuer, external_tenant_subject)
       VALUES ($1,'system',$1) ON CONFLICT (id) DO NOTHING`,
      [tenantId],
    );
  }
}

const WO_COLUMNS = `
  id, wo_number, type, priority, status, title, description,
  asset_id, location_id, category_id, assigned_to, additional_workers, assigned_teams,
  due_date, started_at, completed_at, required_signature, signature_data, feedback,
  trigger_source, trigger_rule_id, form_schema_id, form_data, estimated_duration,
  audit_receipt, version, created_by, created_at, updated_at
`;

function mapWo(row: any): WorkOrder {
  return {
    id: row.id,
    woNumber: row.wo_number,
    type: row.type,
    priority: row.priority,
    status: row.status,
    title: row.title,
    description: row.description ?? null,
    assetId: row.asset_id ?? null,
    locationId: row.location_id ?? null,
    categoryId: row.category_id ?? null,
    assignedTo: row.assigned_to ?? null,
    additionalWorkers: row.additional_workers ?? [],
    assignedTeams: row.assigned_teams ?? [],
    dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    requiredSignature: row.required_signature,
    signatureData: row.signature_data ?? null,
    feedback: row.feedback ?? null,
    triggerSource: row.trigger_source,
    formSchemaId: row.form_schema_id ?? null,
    formData: row.form_data ?? null,
    estimatedDuration: row.estimated_duration ? Number(row.estimated_duration) : null,
    auditReceipt: row.audit_receipt ?? null,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
