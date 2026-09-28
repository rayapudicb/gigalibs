import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

export interface CreateWorkflowDto {
  workflow_code: string;
  name: string;
  description?: string;
  category: string;
  trigger_type?: string;
  trigger_config?: any;
  dag_definition: any;
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  category?: string;
  status?: string;
  trigger_type?: string;
  trigger_config?: any;
  dag_definition?: any;
}


@Injectable()
export class WorkflowsService {
  constructor(private readonly db: DatabaseService) {}

  async getWorkflows(
    tenantId: string,
    category?: string,
    status?: string,
    search?: string,
  ): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      let sql = `
        SELECT 
          w.id, w.tenant_id, w.workflow_code, w.name, w.description, w.category,
          w.active_version, w.trigger_type, w.trigger_config, w.status, w.created_at, w.updated_at,
          COUNT(DISTINCT r.id)::int AS runs_count,
          (
            SELECT r2.status FROM gigalibs_workflow.workflow_runs r2 
            WHERE r2.workflow_id = w.id ORDER BY r2.started_at DESC LIMIT 1
          ) AS last_run_status
        FROM gigalibs_workflow.workflow_definitions w
        LEFT JOIN gigalibs_workflow.workflow_runs r ON w.id = r.workflow_id
        WHERE w.tenant_id = $1
      `;
      const params: any[] = [tenantId];

      if (category && category !== 'ALL') {
        params.push(category);
        sql += ` AND w.category = $${params.length}`;
      }

      if (status && status !== 'ALL') {
        params.push(status);
        sql += ` AND w.status = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        sql += ` AND (w.workflow_code ILIKE $${params.length} OR w.name ILIKE $${params.length})`;
      }

      sql += ` GROUP BY w.id ORDER BY w.updated_at DESC`;

      const res = await client.query(sql, params);
      return res.rows;
    });
  }

  async getWorkflowById(tenantId: string, idOrCode: string): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const wfRes = await client.query(
        `SELECT * FROM gigalibs_workflow.workflow_definitions 
         WHERE tenant_id = $1 AND (id = $2 OR workflow_code = $2)`,
        [tenantId, idOrCode]
      );

      if (wfRes.rowCount === 0) {
        throw new NotFoundException(`Workflow '${idOrCode}' not found`);
      }

      const workflow = wfRes.rows[0];

      const versionsRes = await client.query(
        `SELECT * FROM gigalibs_workflow.workflow_versions WHERE workflow_id = $1 ORDER BY published_at DESC`,
        [workflow.id]
      );

      const activeVersion =
        versionsRes.rows.find((v) => v.version === workflow.active_version) || versionsRes.rows[0];

      return {
        ...workflow,
        dag_definition: activeVersion ? activeVersion.dag_definition : { nodes: [], edges: [] },
        versions: versionsRes.rows,
      };
    });
  }

  async createWorkflow(tenantId: string, dto: CreateWorkflowDto): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!dto.workflow_code || !dto.name || !dto.category || !dto.dag_definition) {
      throw new BadRequestException('workflow_code, name, category, and dag_definition are required');
    }

    // Validate DAG structure basics
    if (!Array.isArray(dto.dag_definition.nodes)) {
      throw new BadRequestException('dag_definition.nodes array is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const wfId = `wf-${randomUUID().slice(0, 8)}`;
      const verId = `ver-${randomUUID().slice(0, 8)}`;
      const version = '1.0.0';

      const insertWfSql = `
        INSERT INTO gigalibs_workflow.workflow_definitions (
          id, tenant_id, workflow_code, name, description, category, active_version,
          trigger_type, trigger_config, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', NOW(), NOW())
        RETURNING *
      `;

      const wfRes = await client.query(insertWfSql, [
        wfId,
        tenantId,
        dto.workflow_code,
        dto.name,
        dto.description || '',
        dto.category,
        version,
        dto.trigger_type || 'EVENT_WEBHOOK',
        JSON.stringify(dto.trigger_config || {}),
      ]);

      const insertVerSql = `
        INSERT INTO gigalibs_workflow.workflow_versions (
          id, workflow_id, version, dag_definition, published_by, published_at
        ) VALUES ($1, $2, $3, $4, 'admin', NOW())
        RETURNING *
      `;

      await client.query(insertVerSql, [
        verId,
        wfId,
        version,
        JSON.stringify(dto.dag_definition),
      ]);

      await client.query(
        `INSERT INTO gigalibs_workflow.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'WORKFLOW', $3, 'WORKFLOW_CREATED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          wfId,
          JSON.stringify({ workflow_code: dto.workflow_code, category: dto.category }),
        ]
      );

      return {
        ...wfRes.rows[0],
        dag_definition: dto.dag_definition,
      };
    });
  }

  async updateWorkflow(tenantId: string, idOrCode: string, dto: UpdateWorkflowDto): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    if (dto.dag_definition && !Array.isArray(dto.dag_definition.nodes)) {
      throw new BadRequestException('dag_definition.nodes array is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const wfRes = await client.query(
        `SELECT * FROM gigalibs_workflow.workflow_definitions 
         WHERE tenant_id = $1 AND (id = $2 OR workflow_code = $2)`,
        [tenantId, idOrCode],
      );

      if (wfRes.rowCount === 0) {
        throw new NotFoundException(`Workflow '${idOrCode}' not found`);
      }

      const workflow = wfRes.rows[0];

      if (dto.dag_definition) {
        const versionRes = await client.query(
          `SELECT * FROM gigalibs_workflow.workflow_versions 
           WHERE workflow_id = $1 AND version = $2`,
          [workflow.id, workflow.active_version],
        );

        if ((versionRes.rowCount ?? 0) > 0) {
          await client.query(
            `UPDATE gigalibs_workflow.workflow_versions 
             SET dag_definition = $1, published_at = NOW() 
             WHERE id = $2`,
            [JSON.stringify(dto.dag_definition), versionRes.rows[0].id],
          );
        } else {
          const verId = `ver-${randomUUID().slice(0, 8)}`;
          await client.query(
            `INSERT INTO gigalibs_workflow.workflow_versions (
              id, workflow_id, version, dag_definition, published_by, published_at
            ) VALUES ($1, $2, $3, $4, 'admin', NOW())`,
            [verId, workflow.id, workflow.active_version || '1.0.0', JSON.stringify(dto.dag_definition)],
          );
        }
      }

      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [tenantId, workflow.id];

      if (dto.name !== undefined) {
        params.push(dto.name);
        updates.push(`name = $${params.length}`);
      }
      if (dto.description !== undefined) {
        params.push(dto.description);
        updates.push(`description = $${params.length}`);
      }
      if (dto.category !== undefined) {
        params.push(dto.category);
        updates.push(`category = $${params.length}`);
      }
      if (dto.status !== undefined) {
        params.push(dto.status);
        updates.push(`status = $${params.length}`);
      }
      if (dto.trigger_type !== undefined) {
        params.push(dto.trigger_type);
        updates.push(`trigger_type = $${params.length}`);
      }
      if (dto.trigger_config !== undefined) {
        params.push(JSON.stringify(dto.trigger_config));
        updates.push(`trigger_config = $${params.length}`);
      }

      const updateSql = `
        UPDATE gigalibs_workflow.workflow_definitions 
        SET ${updates.join(', ')} 
        WHERE tenant_id = $1 AND id = $2 
        RETURNING *
      `;

      const updatedWfRes = await client.query(updateSql, params);
      const updatedWf = updatedWfRes.rows[0];

      await client.query(
        `INSERT INTO gigalibs_workflow.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'WORKFLOW', $3, 'WORKFLOW_UPDATED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          workflow.id,
          JSON.stringify({
            workflow_code: workflow.workflow_code,
            updated_fields: Object.keys(dto),
          }),
        ],
      );

      let dagDefinition = dto.dag_definition;
      if (!dagDefinition) {
        const verRes = await client.query(
          `SELECT dag_definition FROM gigalibs_workflow.workflow_versions WHERE workflow_id = $1 AND version = $2 LIMIT 1`,
          [workflow.id, updatedWf.active_version],
        );
        dagDefinition = verRes.rows[0]?.dag_definition || { nodes: [], edges: [] };
      }

      return {
        ...updatedWf,
        dag_definition: dagDefinition,
      };
    });
  }
}

